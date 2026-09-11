import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { UsersService } from '../users/users.service'
import type { User } from '../users/user.entity'

/**
 * 토큰 수명.
 *
 * 참고한 기존 구현(node-sns-nest)은 access 300초 / refresh 3,600초였는데,
 * 리프레시가 1시간이면 게임을 한 시간 하면 로그아웃된다. 액세스는 짧게
 * 유지하되 리프레시는 30일로 늘렸다.
 */
const ACCESS_TTL = '15m'
const REFRESH_TTL = '30d'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

interface TokenPayload {
  sub: string
  email: string
  role: User['role']
  type: 'access' | 'refresh'
  /** 리프레시 토큰에만 담긴다. users.token_version 과 다르면 폐기된 토큰 */
  ver?: number
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  /** 'Bearer {token}' / 'Basic {base64}' 에서 토큰만 떼어낸다 */
  extractTokenFromHeader(header: string | undefined, isBearer: boolean): string {
    const prefix = isBearer ? 'Bearer' : 'Basic'
    const parts = header?.split(' ') ?? []
    if (parts.length !== 2 || parts[0] !== prefix) {
      throw new UnauthorizedException('잘못된 형식의 토큰입니다.')
    }
    return parts[1]
  }

  /** Basic 토큰은 '이메일:비밀번호'를 Base64로 인코딩한 값이다 */
  decodeBasicToken(base64: string): { email: string; password: string } {
    const decoded = Buffer.from(base64, 'base64').toString('utf8')
    const sep = decoded.indexOf(':')
    // 비밀번호에 ':' 가 들어갈 수 있으므로 첫 구분자만 기준으로 자른다
    if (sep < 1) throw new UnauthorizedException('잘못된 형식의 토큰입니다.')
    return { email: decoded.slice(0, sep), password: decoded.slice(sep + 1) }
  }

  private secretFor(type: 'access' | 'refresh'): string {
    // 액세스와 리프레시 시크릿을 나눠 둔다. 하나가 새도 다른 쪽은 살아 있다
    return this.config.getOrThrow<string>(
      type === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET',
    )
  }

  verifyToken(token: string, type: 'access' | 'refresh'): TokenPayload {
    let payload: TokenPayload
    try {
      payload = this.jwt.verify<TokenPayload>(token, { secret: this.secretFor(type) })
    } catch {
      throw new UnauthorizedException('토큰이 만료됐거나 잘못된 토큰입니다.')
    }
    if (payload.type !== type) {
      throw new UnauthorizedException(`${type} 토큰이 아닙니다.`)
    }
    return payload
  }

  signToken(user: User, type: 'access' | 'refresh'): string {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type,
      ...(type === 'refresh' ? { ver: user.tokenVersion } : {}),
    }
    return this.jwt.sign(payload, {
      secret: this.secretFor(type),
      expiresIn: type === 'access' ? ACCESS_TTL : REFRESH_TTL,
    })
  }

  issueTokens(user: User): TokenPair {
    return {
      accessToken: this.signToken(user, 'access'),
      refreshToken: this.signToken(user, 'refresh'),
    }
  }

  /**
   * 리프레시 토큰으로 새 토큰 쌍을 발급한다.
   *
   * 기존 구현은 페이로드를 그대로 다시 서명했는데, 그러면 탈취된 토큰이
   * 만료까지 계속 살아 있고 폐기할 방법이 없다. DB의 token_version 과
   * 대조해서 로그아웃·비밀번호 변경 시 무효화되도록 했다.
   */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const payload = this.verifyToken(refreshToken, 'refresh')
    const user = await this.users.findById(payload.sub)
    if (!user) throw new UnauthorizedException('존재하지 않는 사용자입니다.')
    if (payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException('폐기된 토큰입니다. 다시 로그인해 주세요.')
    }
    return this.issueTokens(user)
  }

  async register(input: {
    email: string
    password: string
    nickname: string
  }): Promise<TokenPair> {
    const rounds = Number(this.config.get('HASH_ROUNDS') ?? 10)
    const passwordHash = await bcrypt.hash(input.password, rounds)
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      nickname: input.nickname,
    })
    return this.issueTokens(user)
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.users.findByEmailWithSecret(email)
    // 존재하지 않는 이메일과 틀린 비밀번호를 같은 메시지로 응답한다.
    // 구분해서 알려주면 가입 여부를 캐낼 수 있다
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false
    if (!user || !ok) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.')
    }
    return this.issueTokens(user)
  }

  /** 모든 기기에서 로그아웃 */
  async logout(userId: string): Promise<void> {
    await this.users.bumpTokenVersion(userId)
  }
}
