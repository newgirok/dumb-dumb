import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthService } from '../auth.service'
import { IS_PUBLIC_KEY } from '../decorator/public.decorator'

/**
 * 액세스 토큰 검증.
 *
 * 참고한 구현은 요청마다 이메일로 유저를 다시 조회했는데, 게임처럼 호출이
 * 잦으면 매 요청이 DB를 한 번씩 때린다. 토큰 페이로드(sub/email/role)만으로
 * 컨텍스트를 채우고, 실제 유저 데이터가 필요한 곳에서만 조회한다.
 * 폐기는 리프레시 시점의 token_version 대조로 처리한다.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const req = context.switchToHttp().getRequest()
    const token = this.auth.extractTokenFromHeader(req.headers['authorization'], true)
    const payload = this.auth.verifyToken(token, 'access')

    req.user = { id: payload.sub, email: payload.email, role: payload.role }
    return true
  }
}
