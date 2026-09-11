import { Controller, Get } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser } from '../auth/decorator/current-user.decorator'
import type { AuthUser } from '../auth/auth.types'

/** 로그인한 본인의 보유 자산 조회 */
@Controller('me')
export class MeController {
  constructor(private readonly db: DatabaseService) {}

  /** 보유 아바타. appearance_data 는 렌더링에 필요하므로 그대로 내려준다 */
  @Get('characters')
  characters(@CurrentUser() user: AuthUser) {
    return this.db.withUser({ userId: user.id, role: user.role }, async (client) => {
      const { rows } = await client.query(
        `SELECT id, serial_number, appearance_data, is_equipped, created_at
           FROM characters WHERE owner_id = $1 ORDER BY created_at`,
        [user.id],
      )
      return rows.map((r) => ({
        id: Number(r.id),
        serialNumber: r.serial_number,
        appearance: r.appearance_data,
        isEquipped: r.is_equipped,
        createdAt: r.created_at,
      }))
    })
  }

  /** 가시거리 라이선스 */
  @Get('license')
  license(@CurrentUser() user: AuthUser) {
    return this.db.withUser({ userId: user.id, role: user.role }, async (client) => {
      const { rows } = await client.query(
        `SELECT visibility_radius_m FROM user_licenses WHERE user_id = $1`,
        [user.id],
      )
      // 라이선스 행은 가입 트랜잭션에서 만들어지지만, 없으면 기본값으로 답한다
      return { visibilityRadiusM: rows[0]?.visibility_radius_m ?? 25 }
    })
  }
}
