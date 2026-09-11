import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { BillingService, PRODUCTS, type ProductType } from './billing.service'
import { AvatarsService } from '../avatars/avatars.service'
import { CurrentUser } from '../auth/decorator/current-user.decorator'
import { Public } from '../auth/decorator/public.decorator'
import type { AuthUser } from '../auth/auth.types'

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly avatars: AvatarsService,
  ) {}

  @Post('orders')
  createOrder(@CurrentUser() user: AuthUser, @Body() body: { productType?: string }) {
    const productType = body?.productType as ProductType
    if (!productType || !(productType in PRODUCTS)) {
      throw new BadRequestException('알 수 없는 상품입니다.')
    }
    return this.billing.createOrder(user, productType)
  }

  /**
   * PG 웹훅.
   *
   * 인증 토큰이 없는 외부 호출이라 @Public 이지만, 서명으로 검증한다.
   * 서명은 원본 바이트에 대해 계산되므로 파싱된 객체가 아니라 rawBody 를
   * 써야 한다 — JSON.stringify 로 되돌리면 키 순서·공백이 달라진다.
   */
  @Public()
  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-pg-signature') signature: string,
  ) {
    const raw = req.rawBody?.toString('utf8')
    if (!raw) throw new BadRequestException('본문이 없습니다.')
    if (!this.billing.verifySignature(raw, signature)) {
      throw new UnauthorizedException('서명 검증에 실패했습니다.')
    }

    const payload = JSON.parse(raw) as {
      orderId?: string
      approvalNumber?: string
      amountKrw?: number
    }
    if (!payload.orderId || !payload.approvalNumber || typeof payload.amountKrw !== 'number') {
      throw new BadRequestException('필수 필드가 없습니다.')
    }

    const { applied } = await this.billing.applyPayment({
      orderId: payload.orderId,
      approvalNumber: payload.approvalNumber,
      amountKrw: payload.amountKrw,
    })

    // 재시도로 들어온 중복 웹훅도 200으로 답해야 PG가 재시도를 멈춘다
    return { ok: true, applied }
  }
}
