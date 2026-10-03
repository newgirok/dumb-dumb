import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { desc, eq, sql } from 'drizzle-orm'
import { DatabaseService, uniqueViolation } from '../database/database.service'
import { orders } from '../database/schema'
import type { AuthUser } from '../auth/auth.types'

/**
 * 원화 직행 결제 (ADR 003).
 * 가상 화폐를 두지 않으므로 충전·소모·환불 로직이 없고, 주문 하나가 곧
 * 상품 하나다.
 */
export const PRODUCTS = {
  character: { amountKrw: 2200, label: '3D 아바타 외형권' },
  license_100m: { amountKrw: 4900, label: '가시거리 100m' },
  license_300m: { amountKrw: 9900, label: '가시거리 300m' },
  bundle_10: { amountKrw: 19800, label: '아바타 10종 묶음' },
} as const

export type ProductType = keyof typeof PRODUCTS

export interface Order {
  id: string
  productType: ProductType
  amountKrw: number
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  /** 주문서 발행. 금액은 서버가 정한다 — 클라이언트가 보낸 값을 믿으면 안 된다 */
  async createOrder(user: AuthUser, productType: ProductType): Promise<Order> {
    const product = PRODUCTS[productType]
    if (!product) throw new BadRequestException('알 수 없는 상품입니다.')

    return this.db.withUser({ userId: user.id, role: user.role }, async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({ userId: user.id, productType, amountKrw: product.amountKrw, status: 'PENDING' })
        .returning({
          id: orders.id,
          productType: orders.productType,
          amountKrw: orders.amountKrw,
          status: orders.status,
        })
      return order
    })
  }

  /** 내 주문 내역. RLS 가 남의 주문을 걸러준다 */
  async listOrders(user: AuthUser): Promise<(Order & { fulfilledAt: Date | null })[]> {
    return this.db.withUser({ userId: user.id, role: user.role }, (tx) =>
      tx
        .select({
          id: orders.id,
          productType: orders.productType,
          amountKrw: orders.amountKrw,
          status: orders.status,
          fulfilledAt: orders.fulfilledAt,
        })
        .from(orders)
        .where(eq(orders.userId, user.id))
        .orderBy(desc(orders.createdAt))
        .limit(50),
    )
  }

  /**
   * PG 웹훅 서명 검증.
   * 검증 없이 처리하면 누구나 결제 완료를 위조할 수 있다.
   * 길이가 다르면 timingSafeEqual 이 던지므로 먼저 걸러낸다.
   */
  verifySignature(rawBody: string, signature: string | undefined): boolean {
    const secret = this.config.get<string>('PG_WEBHOOK_SECRET')
    if (!secret || !signature) return false

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  /**
   * 결제 승인 반영.
   *
   * PG는 같은 웹훅을 여러 번 보낸다(재시도). pg_approval_number 에 UNIQUE
   * 부분 인덱스가 걸려 있어서 두 번째 시도는 DB가 거절한다. 애플리케이션
   * if 문으로 막으면 동시에 두 건이 들어올 때 둘 다 통과한다.
   *
   * @returns 실제로 상태가 바뀌었는지 (false = 이미 처리된 건)
   */
  async applyPayment(input: {
    orderId: string
    approvalNumber: string
    amountKrw: number
  }): Promise<{ applied: boolean }> {
    return this.db.withAdmin(async (tx) => {
      const [order] = await tx
        .select({ amountKrw: orders.amountKrw, status: orders.status })
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .for('update')
      if (!order) throw new BadRequestException('존재하지 않는 주문입니다.')

      if (order.status === 'PAID') return { applied: false }

      // 금액이 다르면 위조이거나 우리 쪽 버그다. 어느 쪽이든 처리하면 안 된다
      if (order.amountKrw !== input.amountKrw) {
        this.logger.error(
          `결제 금액 불일치 order=${input.orderId} 기대=${order.amountKrw} 수신=${input.amountKrw}`,
        )
        throw new BadRequestException('결제 금액이 일치하지 않습니다.')
      }

      try {
        await tx
          .update(orders)
          .set({ status: 'PAID', pgApprovalNumber: input.approvalNumber, completedAt: sql`now()` })
          .where(eq(orders.id, input.orderId))
      } catch (error) {
        // 23505 = unique_violation. 같은 승인번호가 이미 반영됐다는 뜻인데,
        // 다른 주문에 붙은 승인번호라면 PG 버그이거나 승인 재사용 시도다.
        // 어느 쪽이든 반영하지 않되, 조용히 넘기지 않고 남긴다
        if (uniqueViolation(error)) {
          this.logger.warn(
            `이미 사용된 승인번호 order=${input.orderId} approval=${input.approvalNumber}`,
          )
          return { applied: false }
        }
        throw error
      }

      return { applied: true }
    })
  }
}
