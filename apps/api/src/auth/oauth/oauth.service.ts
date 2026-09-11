import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UsersService } from '../../users/users.service'
import { AuthService, type TokenPair } from '../auth.service'
import { PROVIDERS, type Provider, type SocialProfile } from './oauth.providers'

@Injectable()
export class OauthService {
  private readonly logger = new Logger(OauthService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  private credentials(provider: Provider): { clientId: string; clientSecret: string } {
    const prefix = provider.toUpperCase()
    const clientId = this.config.get<string>(`${prefix}_CLIENT_ID`)
    if (!clientId) {
      throw new BadRequestException(`${provider} 로그인이 설정되지 않았습니다.`)
    }
    // 카카오는 시크릿이 선택 사항이라 빈 값을 허용한다
    return { clientId, clientSecret: this.config.get<string>(`${prefix}_CLIENT_SECRET`) ?? '' }
  }

  /** 브라우저를 보낼 공급자 동의 화면 주소 */
  authorizeUrl(provider: Provider, redirectUri: string, state: string): string {
    const { clientId } = this.credentials(provider)
    const config = PROVIDERS[provider]
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scope,
      state,
    })
    return `${config.authorizeUrl}?${params}`
  }

  /** 인가 코드를 액세스 토큰으로 바꾼다 */
  private async exchangeCode(
    provider: Provider,
    code: string,
    redirectUri: string,
  ): Promise<string> {
    const { clientId, clientSecret } = this.credentials(provider)
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
    })
    if (clientSecret) body.set('client_secret', clientSecret)

    const res = await fetch(PROVIDERS[provider].tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const json = (await res.json()) as { access_token?: string; error_description?: string }

    if (!res.ok || !json.access_token) {
      // 공급자 에러 본문을 그대로 클라이언트에 넘기지 않는다 — 설정값이 샌다
      this.logger.warn(`${provider} 코드 교환 실패: ${res.status} ${json.error_description ?? ''}`)
      throw new UnauthorizedException('소셜 로그인에 실패했습니다.')
    }
    return json.access_token
  }

  private async fetchProfile(provider: Provider, accessToken: string): Promise<SocialProfile> {
    const res = await fetch(PROVIDERS[provider].profileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      this.logger.warn(`${provider} 프로필 조회 실패: ${res.status}`)
      throw new UnauthorizedException('소셜 로그인에 실패했습니다.')
    }
    return PROVIDERS[provider].parseProfile((await res.json()) as Record<string, any>)
  }

  /**
   * 인가 코드 하나로 로그인까지 끝낸다.
   *
   * 계정 연결 규칙:
   *  1. 이미 연결된 소셜 계정이면 그 유저로 로그인.
   *  2. 아니고, 공급자가 '확인된' 이메일을 주고 같은 이메일의 계정이 있으면 연결.
   *  3. 아니면 신규 가입.
   *
   * 2번에서 확인 여부를 따지는 게 핵심이다. 미확인 이메일로 연결해 주면
   * 공격자가 남의 이메일을 자기 소셜 계정에 적어두고 그 계정을 통째로
   * 가져갈 수 있다.
   */
  async signIn(provider: Provider, code: string, redirectUri: string): Promise<TokenPair> {
    const providerToken = await this.exchangeCode(provider, code, redirectUri)
    const profile = await this.fetchProfile(provider, providerToken)

    const linked = await this.users.findBySocial(provider, profile.providerUserId)
    if (linked) return this.auth.issueTokens(linked)

    if (profile.email && profile.emailVerified) {
      const existing = await this.users.findByEmail(profile.email)
      if (existing) {
        await this.users.linkIdentity({
          userId: existing.id,
          provider,
          providerUserId: profile.providerUserId,
          email: profile.email,
        })
        return this.auth.issueTokens(existing)
      }
    }

    // 이메일 동의를 거부했거나 미확인이면 계정 식별용 대체 주소를 만든다.
    // 실제로 메일이 가지 않도록 예약 도메인(.invalid)을 쓴다
    const email =
      profile.email && profile.emailVerified
        ? profile.email
        : `${provider}_${profile.providerUserId}@users.noreply.invalid`

    const created = await this.users.createFromSocial({
      email,
      nickname: profile.nickname?.slice(0, 32) || `${provider}유저`,
      provider,
      providerUserId: profile.providerUserId,
      providerEmail: profile.email,
    })
    return this.auth.issueTokens(created)
  }
}
