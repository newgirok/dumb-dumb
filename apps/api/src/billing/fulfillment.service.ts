import { Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { AvatarsService } from '../avatars/avatars.service'
import type { ProductType } from './billing.service'

/**
 * 결제된 주문을 실제 지급으로 바꾼다.
 *
 * 지급 방식이 상품마다 다르다 — 아바타는 캐릭터 INSERT, 라이선스는
 * 가시거리 상향. 웹훅은 주문 상태만 바꾸고 끝내고(응답이 빨라야 한다),
 * 실제 지급은 여기서 따로 집어간다.
 */

/** 상품 → 발급할 캐릭터 수 */
const CHARACTER_COUNT: Partial<Record<ProductType, number>> = {
  character: 1,
  bundle_10: 10,
}

/** 상품 → 가시거리(m) */
const LICENSE_RADIUS: Partial<Record<ProductType, number>> = {
  license_100m: 100,
  license_300m: 300,
}

interface PendingOrder {
  orderId: string
  userId: string
  productType: ProductType
}

const MAX_ATTEMPTS = 8

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly avatars: AvatarsService,
  ) {}

  /**
   * 지급 대기 주문을 집어온다.
   *
   * FOR UPDATE SKIP LOCKED 라서 워커를 여러 개 띄워도 같은 주문을 두 번
   * 집지 않는다. 브로커를 따로 두지 않고 DB를 큐로 쓰는 이유다 —
   * 결제와 지급이 같은 DB에 있으니 트랜잭션으로 묶을 수 있다.
   */
  async claimPendingOrders(limit = 5): Promise<PendingOrder[]> {
    return this.db.withAdmin(async (client) => {
      const { rows } = await client.query(
        `SELECT id, user_id, product_type
           FROM orders
          WHERE status = 'PAID'
            AND fulfilled_at IS NULL
            AND fulfill_attempts < $2
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1`,
        [limit, MAX_ATTEMPTS],
      )
      return rows.map((r) => ({
        orderId: r.id,
        userId: r.user_id,
        productType: r.product_type as ProductType,
      }))
    })
  }

  /** 주문 한 건을 지급한다. 이미 지급된 항목은 DB 제약이 걸러낸다 */
  async fulfill(order: PendingOrder): Promise<void> {
    const count = CHARACTER_COUNT[order.productType]
    if (count) {
      for (let seq = 1; seq <= count; seq++) {
        const issued = await this.avatars.issueForOrder(order.orderId, order.userId, seq)
        if (issued) this.logger.log(`발급 ${issued.serialNumber} order=${order.orderId} #${seq}`)
      }
      await this.markFulfilled(order.orderId)
      return
    }

    const radius = LICENSE_RADIUS[order.productType]
    if (radius) {
      await this.db.withAdmin(async (client) => {
        // GREATEST 라서 낮은 등급을 나중에 사도 이미 산 가시거리가 줄지 않고,
        // 워커가 중복 실행돼도 결과가 같다
        await client.query(
          `UPDATE user_licenses
              SET visibility_radius_m = GREATEST(visibility_radius_m, $2), updated_at = now()
            WHERE user_id = $1`,
          [order.userId, radius],
        )
        await client.query(`UPDATE orders SET fulfilled_at = now() WHERE id = $1`, [order.orderId])
      })
      this.logger.log(`가시거리 ${radius}m order=${order.orderId}`)
      return
    }

    // PRODUCTS 에 상품을 추가하고 여기 분기를 빠뜨리면 영원히 대기 상태로
    // 남는다. 조용히 넘기지 않고 남긴다
    this.logger.error(`지급 방법이 없는 상품 ${order.productType} order=${order.orderId}`)
  }

  private async markFulfilled(orderId: string): Promise<void> {
    await this.db.withAdmin((client) =>
      client.query(`UPDATE orders SET fulfilled_at = now() WHERE id = $1`, [orderId]),
    )
  }
}
