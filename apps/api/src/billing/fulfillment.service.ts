import { Injectable, Logger } from '@nestjs/common'
import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import { orders, userLicenses } from '../database/schema'
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
    return this.db.withAdmin((tx) =>
      tx
        .select({ orderId: orders.id, userId: orders.userId, productType: orders.productType })
        .from(orders)
        .where(and(eq(orders.status, 'PAID'), isNull(orders.fulfilledAt), lt(orders.fulfillAttempts, MAX_ATTEMPTS)))
        .orderBy(orders.createdAt)
        .limit(limit)
        .for('update', { skipLocked: true }),
    )
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
      await this.db.withAdmin(async (tx) => {
        // GREATEST 라서 낮은 등급을 나중에 사도 이미 산 가시거리가 줄지 않고,
        // 워커가 중복 실행돼도 결과가 같다
        await tx
          .update(userLicenses)
          .set({ visibilityRadiusM: sql`GREATEST(${userLicenses.visibilityRadiusM}, ${radius})`, updatedAt: sql`now()` })
          .where(eq(userLicenses.userId, order.userId))
        await tx.update(orders).set({ fulfilledAt: sql`now()` }).where(eq(orders.id, order.orderId))
      })
      this.logger.log(`가시거리 ${radius}m order=${order.orderId}`)
      return
    }

    // PRODUCTS 에 상품을 추가하고 여기 분기를 빠뜨리면 영원히 대기 상태로
    // 남는다. 조용히 넘기지 않고 남긴다
    this.logger.error(`지급 방법이 없는 상품 ${order.productType} order=${order.orderId}`)
  }

  private async markFulfilled(orderId: string): Promise<void> {
    await this.db.withAdmin((tx) => tx.update(orders).set({ fulfilledAt: sql`now()` }).where(eq(orders.id, orderId)))
  }
}
