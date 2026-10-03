import { Controller, Get } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import { characters, userLicenses } from '../database/schema'
import { CurrentUser } from '../auth/decorator/current-user.decorator'
import type { AuthUser } from '../auth/auth.types'

/** 로그인한 본인의 보유 자산 조회 */
@Controller('me')
export class MeController {
  constructor(private readonly db: DatabaseService) {}

  /** 보유 아바타. appearance_data 는 렌더링에 필요하므로 그대로 내려준다 */
  @Get('characters')
  characters(@CurrentUser() user: AuthUser) {
    return this.db.withUser({ userId: user.id, role: user.role }, (tx) =>
      tx
        .select({
          id: characters.id,
          serialNumber: characters.serialNumber,
          appearance: characters.appearanceData,
          isEquipped: characters.isEquipped,
          createdAt: characters.createdAt,
        })
        .from(characters)
        .where(eq(characters.ownerId, user.id))
        .orderBy(characters.createdAt),
    )
  }

  /** 가시거리 라이선스 */
  @Get('license')
  license(@CurrentUser() user: AuthUser) {
    return this.db.withUser({ userId: user.id, role: user.role }, async (tx) => {
      const [license] = await tx
        .select({ visibilityRadiusM: userLicenses.visibilityRadiusM })
        .from(userLicenses)
        .where(eq(userLicenses.userId, user.id))
      // 라이선스 행은 가입 트랜잭션에서 만들어지지만, 없으면 기본값으로 답한다
      return { visibilityRadiusM: license?.visibilityRadiusM ?? 25 }
    })
  }
}
