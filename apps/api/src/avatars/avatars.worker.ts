import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AvatarsService } from './avatars.service'

/**
 * 발급 워커.
 *
 * 생성형 AI 호출과 .glb 굽기는 초 단위가 걸릴 수 있어 결제 웹훅 응답 안에서
 * 처리하면 안 된다. 웹훅은 주문 상태만 바꾸고 끝내고, 여기서 따로 집어간다.
 *
 * 브로커(RabbitMQ/Redis)를 두지 않고 DB를 큐로 쓴다. 결제와 발급이 같은
 * DB에 있어 FOR UPDATE SKIP LOCKED 로 중복 없이 집을 수 있고, 컨테이너를
 * 하나 덜 운영해도 된다. 처리량이 부족해지면 그때 브로커를 넣으면 된다.
 */
@Injectable()
export class AvatarsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AvatarsWorker.name)
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly avatars: AvatarsService,
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
    let issued = 0

    try {
      const pending = await this.avatars.claimPendingOrders()
      for (const { orderId, userId } of pending) {
        try {
          const character = await this.avatars.issueForOrder(orderId, userId)
          if (character) {
            issued++
            this.logger.log(`발급 완료 ${character.serialNumber} order=${orderId}`)
          }
        } catch (error) {
          // 한 건이 실패해도 나머지는 계속 처리한다
          this.logger.error(`발급 실패 order=${orderId}`, error as Error)
        }
      }
    } catch (error) {
      this.logger.error('워커 tick 실패', error as Error)
    } finally {
      this.running = false
    }

    return issued
  }
}
