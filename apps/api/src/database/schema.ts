import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  char,
  customType,
  foreignKey,
  geometry,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgSequence,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * DB 스키마 — migrations/ 0000~0010을 적용한 결과와 같다(제약·인덱스·정책 이름까지).
 * 스키마를 바꾸면 여기를 고치고 `npm run db:generate -- --name 다음번호_설명`으로 다음 번호
 * 마이그레이션 SQL을 만든다(ADR 010). 함수·트리거·pg_cron 예약·롤·GRANT는 여기서 다루지 않아
 * 그런 변경은 SQL 마이그레이션에 직접 쓴다.
 *
 * RLS 정책은 요청마다 트랜잭션 안에서 채우는 app.user_id·app.user_role을 읽는다
 * (app_user_id()·app_is_admin() 함수는 0007_rls.sql).
 */

/** 대소문자를 가리지 않는 문자열(citext 확장) — 이메일(Foo@x.com = foo@x.com) */
const citext = customType<{ data: string }>({ dataType: () => 'citext' })

const own = (column: string) => sql`${sql.identifier(column)} = app_user_id() OR app_is_admin()`
const adminOnly = sql`app_is_admin()`

export const userRole = pgEnum('user_role', ['user', 'advertiser', 'admin'])
export const authProvider = pgEnum('auth_provider', ['kakao', 'google'])
export const orderProduct = pgEnum('order_product', ['character', 'license_100m', 'license_300m', 'bundle_10'])
export const orderStatus = pgEnum('order_status', ['PENDING', 'PAID', 'FAILED', 'REFUNDED'])

/** 아바타 시리얼 순번 — 시퀀스는 그 자체로 원자적이라 동시 발급에도 겹치지 않는다 */
export const characterSerialSeq = pgSequence('character_serial_seq', { startWith: 1 })

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull().unique('users_email_key'),
    /** 소셜로만 가입한 유저는 비밀번호가 없다 */
    passwordHash: text('password_hash'),
    nickname: varchar('nickname', { length: 32 }).notNull(),
    role: userRole('role').notNull().default('user'),
    /** 리프레시 토큰 일괄 폐기용 — 비밀번호 변경·로그아웃 때 올리면 이미 발급한 리프레시 토큰이 모두 무효가 된다 */
    tokenVersion: integer('token_version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy('users_self_select', { for: 'select', using: own('id') }),
    pgPolicy('users_self_update', { for: 'update', using: own('id') }),
    // 가입은 서버가 한다(로그인 전이라 user_id 컨텍스트가 없다)
    pgPolicy('users_admin_insert', { for: 'insert', withCheck: adminOnly }),
  ],
)

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    productType: orderProduct('product_type').notNull(),
    amountKrw: integer('amount_krw').notNull(),
    status: orderStatus('status').notNull().default('PENDING'),
    pgApprovalNumber: text('pg_approval_number'),
    failReason: text('fail_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** 발급 실패 횟수 — 쌓이면 사람이 봐야 한다는 신호다 */
    fulfillAttempts: integer('fulfill_attempts').notNull().default(0),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  },
  (t) => [
    // 결제 이력은 유저를 지워도 남는다(탈퇴는 삭제가 아니라 비활성 처리)
    foreignKey({ name: 'orders_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('restrict'),
    index('idx_orders_user').on(t.userId),
    // 같은 승인번호로 두 번 결제 처리되지 않는다 — 승인번호가 없는 대기 주문은 여러 건 둘 수 있다
    uniqueIndex('orders_pg_approval_uniq').on(t.pgApprovalNumber).where(sql`pg_approval_number IS NOT NULL`),
    // 지급 워커가 대기 주문을 찾는다
    index('idx_orders_pending_fulfillment')
      .on(t.status, t.createdAt)
      .where(sql`status = 'PAID' AND fulfilled_at IS NULL`),
    pgPolicy('orders_owner_select', { for: 'select', using: own('user_id') }),
    // 주문 생성은 본인 것만, 상태 변경(PAID 등)은 결제 웹훅(admin)만
    pgPolicy('orders_owner_insert', { for: 'insert', withCheck: sql`user_id = app_user_id()` }),
    pgPolicy('orders_admin_update', { for: 'update', using: adminOnly }),
  ],
)

export const characters = pgTable(
  'characters',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    serialNumber: varchar('serial_number', { length: 32 }).notNull().unique('characters_serial_number_key'),
    ownerId: uuid('owner_id').notNull(),
    /** 외형 해시 — UNIQUE라 같은 외형은 두 번 발급되지 않는다 */
    appearanceHash: char('appearance_hash', { length: 64 }).notNull().unique('characters_appearance_hash_key'),
    appearanceData: jsonb('appearance_data').notNull().$type<Record<string, number>>(),
    glbUrl: text('glb_url'),
    isEquipped: boolean('is_equipped').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    orderId: uuid('order_id'),
    /** 주문 안에서 몇 번째 항목인가(묶음 상품) */
    orderSeq: integer('order_seq'),
  },
  (t) => [
    // 2,200원 결제로 발급한 유일한 자산이라 주인이 사라져도 남는다
    foreignKey({ name: 'characters_owner_id_fkey', columns: [t.ownerId], foreignColumns: [users.id] }).onDelete('restrict'),
    foreignKey({ name: 'characters_order_id_fkey', columns: [t.orderId], foreignColumns: [orders.id] }).onDelete('restrict'),
    index('idx_characters_owner').on(t.ownerId),
    // 주문 항목 하나에 캐릭터 하나 — 워커가 두 번 돌아도 두 번째 INSERT는 실패한다
    uniqueIndex('characters_order_item_uniq').on(t.orderId, t.orderSeq).where(sql`order_id IS NOT NULL`),
    pgPolicy('characters_owner_select', { for: 'select', using: own('owner_id') }),
    pgPolicy('characters_owner_update', { for: 'update', using: own('owner_id') }),
    // 발급은 서버(워커)만 한다
    pgPolicy('characters_admin_insert', { for: 'insert', withCheck: adminOnly }),
  ],
)

export const userLicenses = pgTable(
  'user_licenses',
  {
    userId: uuid('user_id').primaryKey(),
    visibilityRadiusM: integer('visibility_radius_m').notNull().default(25),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    foreignKey({ name: 'user_licenses_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
    pgPolicy('licenses_owner_select', { for: 'select', using: own('user_id') }),
    pgPolicy('licenses_admin_write', { for: 'all', using: adminOnly, withCheck: adminOnly }),
  ],
)

/** 로그인 수단 — 한 사람이 카카오·구글을 함께 붙일 수 있어 users와 1:N이다 */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    provider: authProvider('provider').notNull(),
    /** 공급자가 발급한 고유 ID — 이메일은 바뀌거나 아예 없을 수 있어 이것이 신원의 기준이다 */
    providerUserId: text('provider_user_id').notNull(),
    email: citext('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: 'user_identities_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
    // 같은 공급자 계정이 두 유저에 붙으면 계정 탈취가 된다
    unique('user_identities_provider_provider_user_id_key').on(t.provider, t.providerUserId),
    unique('user_identities_user_id_provider_key').on(t.userId, t.provider),
    index('idx_user_identities_user').on(t.userId),
    // 본인이 연결해 둔 계정은 볼 수 있어야 한다(연결 해제 UI)
    pgPolicy('identities_owner_select', { for: 'select', using: own('user_id') }),
    pgPolicy('identities_owner_delete', { for: 'delete', using: own('user_id') }),
    // 연결 생성은 서버만 한다(로그인 시점엔 아직 user_id 컨텍스트가 없다)
    pgPolicy('identities_admin_insert', { for: 'insert', withCheck: adminOnly }),
  ],
)

/** B2B 테넌시 경계 — 광고주는 자기 건물만, 활성 광고는 게임 렌더링에 필요해 누구나 읽는다 */
export const sponsorBuildings = pgTable(
  'sponsor_buildings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    advertiserId: uuid('advertiser_id').notNull(),
    mapboxFeatureId: text('mapbox_feature_id'),
    geom: geometry('geom', { type: 'point', srid: 4326 }).notNull(),
    textureUrl: text('texture_url').notNull(),
    defaultTextureUrl: text('default_texture_url'),
    isActive: boolean('is_active').default(false),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({ name: 'sponsor_buildings_advertiser_id_fkey', columns: [t.advertiserId], foreignColumns: [users.id] }).onDelete(
      'restrict',
    ),
    index('idx_sponsor_buildings_geom').using('gist', t.geom),
    index('idx_sponsor_buildings_advertiser').on(t.advertiserId),
    pgPolicy('sponsor_public_active_select', { for: 'select', using: sql`is_active = true` }),
    pgPolicy('sponsor_owner_select', { for: 'select', using: own('advertiser_id') }),
    pgPolicy('sponsor_owner_write', { for: 'all', using: own('advertiser_id'), withCheck: own('advertiser_id') }),
  ],
)

/** 광고 노출 — 정산 근거라 서버만 남기고 고치지 않는다 */
export const adImpressions = pgTable(
  'ad_impressions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    buildingId: bigint('building_id', { mode: 'number' }).notNull(),
    userId: uuid('user_id').notNull(),
    impressedAt: timestamp('impressed_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    foreignKey({ name: 'ad_impressions_building_id_fkey', columns: [t.buildingId], foreignColumns: [sponsorBuildings.id] }),
    foreignKey({ name: 'ad_impressions_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
    index('idx_ad_impressions_building').on(t.buildingId),
    index('idx_ad_impressions_user').on(t.userId),
    // 광고주는 자기 건물의 노출만 본다
    pgPolicy('impressions_advertiser_select', {
      for: 'select',
      using: sql`app_is_admin() OR EXISTS (
        SELECT 1 FROM sponsor_buildings b WHERE b.id = ad_impressions.building_id AND b.advertiser_id = app_user_id()
      )`,
    }),
    pgPolicy('impressions_admin_insert', { for: 'insert', withCheck: adminOnly }),
  ],
)
