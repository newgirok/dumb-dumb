import { Injectable, Logger } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { DatabaseService } from '../database/database.service'

/**
 * 아바타 발급 (PRD: 전 세계 단 1종, 고유 시리얼).
 *
 * "절대 중복이 안 나온다"를 애플리케이션에서 보장하려 들면 동시 발급에서
 * 뚫린다. appearance_hash 에 UNIQUE 가 걸려 있으니 충돌하면 INSERT 가
 * 실패하고, 실패하면 다시 뽑으면 된다. 분산 락도 조율도 필요 없다.
 */

/** 외형 구성 요소 — 조합 수가 충분히 커야 충돌이 드물다 */
const PALETTE = {
  skin: 4,
  hair: 12,
  hairColor: 16,
  top: 20,
  topColor: 24,
  bottom: 14,
  bottomColor: 24,
  shoes: 10,
  accessory: 18,
} as const

export interface AppearanceData {
  [part: string]: number
}

export interface IssuedCharacter {
  id: number
  serialNumber: string
  appearanceHash: string
}

/** 조합이 겹쳐도 재시도로 풀리지만, 계속 겹치면 조합 공간이 포화된 것이다 */
const MAX_ATTEMPTS = 8

@Injectable()
export class AvatarsService {
  private readonly logger = new Logger(AvatarsService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * 외형을 뽑는다.
   *
   * 나중에 생성형 AI로 교체될 자리다. 지금은 팔레트 조합 + 난수 시드로
   * 만드는데, 어느 쪽이든 결과를 해시해서 UNIQUE 에 걸리는 구조는 같다.
   */
  private rollAppearance(): { data: AppearanceData; hash: string } {
    const data: AppearanceData = {}
    for (const [part, count] of Object.entries(PALETTE)) {
      data[part] = randomBytes(2).readUInt16BE(0) % count
    }
    // 같은 조합이라도 시드가 다르면 미세 차이를 줄 수 있게 남겨둔다
    data.seed = randomBytes(4).readUInt32BE(0)

    const canonical = JSON.stringify(data, Object.keys(data).sort())
    return { data, hash: createHash('sha256').update(canonical).digest('hex') }
  }

  /**
   * 결제된 주문 하나를 캐릭터로 바꾼다.
   *
   * characters.order_id 에도 UNIQUE 가 있어서 워커가 중복 실행돼도
   * 두 번째는 DB가 거절한다.
   */
  async issueForOrder(orderId: string, ownerId: string): Promise<IssuedCharacter | null> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { data, hash } = this.rollAppearance()

      try {
        return await this.db.withAdmin(async (client) => {
          const { rows } = await client.query(
            `INSERT INTO characters
               (serial_number, owner_id, appearance_hash, appearance_data, order_id)
             VALUES ('OW-' || lpad(nextval('character_serial_seq')::text, 8, '0'),
                     $1, $2, $3, $4)
             RETURNING id, serial_number, appearance_hash`,
            [ownerId, hash, JSON.stringify(data), orderId],
          )
          await client.query(
            `UPDATE orders SET fulfilled_at = now() WHERE id = $1`,
            [orderId],
          )
          return {
            id: rows[0].id,
            serialNumber: rows[0].serial_number,
            appearanceHash: rows[0].appearance_hash,
          }
        })
      } catch (error) {
        const code = (error as { code?: string; constraint?: string }).code
        const constraint = (error as { constraint?: string }).constraint

        if (code !== '23505') throw error

        // 이 주문은 이미 발급됐다 — 워커 중복 실행. 재시도할 일이 아니다
        if (constraint === 'characters_order_uniq') {
          this.logger.warn(`이미 발급된 주문 order=${orderId}`)
          return null
        }

        // 외형이 겹쳤다 — 다시 뽑는다
        this.logger.debug(`외형 충돌, 재시도 ${attempt}/${MAX_ATTEMPTS}`)
        await this.db.withAdmin((client) =>
          client.query(
            `UPDATE orders SET fulfill_attempts = fulfill_attempts + 1 WHERE id = $1`,
            [orderId],
          ),
        )
      }
    }

    // 여기까지 왔으면 조합 공간이 포화됐다는 뜻이다. 사람이 봐야 한다
    this.logger.error(`외형 생성 ${MAX_ATTEMPTS}회 실패 order=${orderId}`)
    throw new Error('유니크한 외형을 생성하지 못했습니다.')
  }

  /**
   * 발급 대기 주문을 집어온다.
   *
   * FOR UPDATE SKIP LOCKED 라서 워커를 여러 개 띄워도 같은 주문을 두 번
   * 집지 않는다. 브로커를 따로 두지 않고 DB를 큐로 쓰는 이유다 —
   * 결제와 발급이 같은 DB에 있으니 트랜잭션으로 묶을 수 있다.
   */
  async claimPendingOrders(limit = 5): Promise<{ orderId: string; userId: string }[]> {
    return this.db.withAdmin(async (client) => {
      const { rows } = await client.query(
        `SELECT o.id, o.user_id
           FROM orders o
          WHERE o.status = 'PAID'
            AND o.product_type = 'character'
            AND o.fulfilled_at IS NULL
            AND o.fulfill_attempts < $2
          ORDER BY o.created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1`,
        [limit, MAX_ATTEMPTS],
      )
      return rows.map((r) => ({ orderId: r.id, userId: r.user_id }))
    })
  }
}
