import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common'
import { AuthService, type TokenPair } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { RefreshDto } from './dto/refresh.dto'
import { Public } from './decorator/public.decorator'
import { CurrentUser } from './decorator/current-user.decorator'
import { AccessTokenGuard } from './guard/access-token.guard'
import type { AuthUser } from './auth.types'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<TokenPair> {
    return this.auth.register(dto)
  }

  /** Basic 토큰('이메일:비밀번호' Base64)으로 로그인 */
  @Public()
  @Post('login')
  login(@Headers('authorization') header: string): Promise<TokenPair> {
    const { email, password } = this.auth.decodeBasicToken(
      this.auth.extractTokenFromHeader(header, false),
    )
    return this.auth.login(email, password)
  }

  @Public()
  @Post('token/refresh')
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.auth.rotate(dto.refreshToken)
  }

  /** 모든 기기에서 로그아웃 (token_version 증가) */
  @UseGuards(AccessTokenGuard)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    await this.auth.logout(user.id)
    return { ok: true }
  }
}
