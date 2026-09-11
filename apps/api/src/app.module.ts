import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { DatabaseModule } from './database/database.module'
import { UsersModule } from './users/users.module'
import { AuthModule } from './auth/auth.module'
import { AccessTokenGuard } from './auth/guard/access-token.guard'
import { HealthController } from './health.controller'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    DatabaseModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [HealthController],
  // 기본을 "인증 필요"로 두고 @Public() 으로만 연다.
  // 반대로 하면 가드를 깜빡한 라우트가 그대로 열린 채 배포된다
  providers: [{ provide: APP_GUARD, useClass: AccessTokenGuard }],
})
export class AppModule {}
