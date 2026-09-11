import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FulfillmentService } from './fulfillment.service'

/**
 * 지급 워커.
 *
 * 생성형 AI 호출과 .glb 굽기는 초 단위가 걸릴 수 있어 결제 웹훅 응답 안에서
 * 처리하면 안 된다. 웹훅은 주문 상태만 바꾸고 끝내고, 여기서 따로 집어간다.
 *
 * 브로커(RabbitMQ/Redis)를 두지 않고 DB를 큐로 쓴다. 결제와 지급이 같은
 * DB에 있어 FOR UPDATE SKIP LOCKED 로 중복 없이 집을 수 있고, 컨테이너를
 * 하나 덜 운영해도 된다. 처리량이 부족해지면 그때 브로커를 넣으면 된다.
 */
@Injectable()
export class FulfillmentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FulfillmentWorker.name)
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly fulfillment: FulfillmentService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // 테스트에서는 직접 tick() 을 불러 검증하므로 자동 폴링을 끈다
    if (this.config.get('AVATAR_WORKER') === 'off') return
    const intervalMs = Number(this.config.get('AVATAR_WORKER_INTERVAL_MS') ?? 2000)
    this.timer = setInterval(() => void this.tick(), intervalMs)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /** 한 번 돌면서 대기 주문을 처리한다 */
  async tick(): Promise<number> {
    // 이전 tick이 아직 안 끝났으면 건너뛴다. 겹쳐 돌 이유가 없다
    if (this.running) return 0
    this.running = true
    let done = 0

    try {
      for (const order of await this.fulfillment.claimPendingOrders()) {
        try {
          await this.fulfillment.fulfill(order)
          done++
        } catch (error) {
          // 한 건이 실패해도 나머지는 계속 처리한다
          this.logger.error(`지급 실패 order=${order.orderId}`, error as Error)
        }
      }
    } catch (error) {
      this.logger.error('워커 tick 실패', error as Error)
    } finally {
      this.running = false
    }

    return done
  }
}
