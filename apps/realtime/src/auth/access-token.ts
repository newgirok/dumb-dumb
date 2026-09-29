import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

/** API 서버(apps/api auth.service)가 서명하는 토큰 페이로드 중 여기서 읽는 것 */
interface AccessTokenPayload {
  sub: string
  email: string
  type: 'access' | 'refresh'
}

/**
 * `/sector` 접속 토큰 검증. 토큰은 API 서버가 발급하고, 여기서는 같은 JWT_ACCESS_SECRET으로
 * 서명·만료와 토큰 종류만 확인한다 — API 서버의 액세스 토큰 가드처럼 DB는 보지 않는다.
 * 시크릿이 없으면 던지므로 서버는 뜨고 `/sector` 접속만 거절된다.
 */
@Injectable()
export class AccessTokenVerifier {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  verify(token: string): AccessTokenPayload {
    const payload = this.jwt.verify<AccessTokenPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    })
    if (payload.type !== 'access') throw new Error('액세스 토큰이 아니다')
    return payload
  }
}
