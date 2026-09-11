import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { OauthService } from './oauth.service'
import { OauthCallbackDto } from './oauth.dto'
import { isProvider } from './oauth.providers'
import { Public } from '../decorator/public.decorator'
import type { TokenPair } from '../auth.service'

/**
 * 클라이언트 시크릿이 브라우저에 나가면 안 되므로 인가 URL 생성과 코드
 * 교환을 모두 서버에서 한다. 브라우저는 Next 라우트만 호출한다.
 */
@Controller('auth/oauth')
export class OauthController {
  constructor(private readonly oauth: OauthService) {}

  @Public()
  @Get(':provider/url')
  authorizeUrl(
    @Param('provider') provider: string,
    @Query('redirectUri') redirectUri: string,
    @Query('state') state: string,
  ): { url: string } {
    if (!isProvider(provider)) throw new BadRequestException('지원하지 않는 공급자입니다.')
    if (!redirectUri || !state) throw new BadRequestException('redirectUri/state 가 필요합니다.')
    return { url: this.oauth.authorizeUrl(provider, redirectUri, state) }
  }

  @Public()
  @Post(':provider')
  signIn(@Param('provider') provider: string, @Body() dto: OauthCallbackDto): Promise<TokenPair> {
    if (!isProvider(provider)) throw new BadRequestException('지원하지 않는 공급자입니다.')
    return this.oauth.signIn(provider, dto.code, dto.redirectUri)
  }
}
