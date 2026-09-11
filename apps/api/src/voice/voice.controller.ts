import { BadRequestException, Body, Controller, Post } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AccessToken } from 'livekit-server-sdk'
import { CurrentUser } from '../auth/decorator/current-user.decorator'
import type { AuthUser } from '../auth/auth.types'

/**
 * LiveKit 참가 토큰 발급.
 *
 * 예전엔 Supabase Edge Function이 발급했다. identity 는 클라이언트가 보내는
 * 값이 아니라 액세스 토큰에서 꺼낸다 — 안 그러면 남을 사칭해 룸에 들어간다.
 */
@Controller('voice')
export class VoiceController {
  constructor(private readonly config: ConfigService) {}

  @Post('token')
  async token(
    @CurrentUser() user: AuthUser,
    @Body() body: { roomName?: string },
  ): Promise<{ token: string }> {
    const roomName = body?.roomName
    // 섹터 룸 이름만 허용한다. 임의 문자열을 받으면 남의 룸에 낄 수 있다
    if (!roomName || !/^voice-sector--?\d+--?\d+$/.test(roomName)) {
      throw new BadRequestException('올바른 룸 이름이 아닙니다.')
    }

    const at = new AccessToken(
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
      { identity: user.id, ttl: '1h' },
    )
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true })

    return { token: await at.toJwt() }
  }
}
