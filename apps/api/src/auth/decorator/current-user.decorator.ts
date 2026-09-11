import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AuthUser } from '../auth.types'

/** 가드가 넣어둔 요청 유저를 꺼낸다 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest().user,
)
