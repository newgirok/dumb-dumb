import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { AccessTokenGuard } from './guard/access-token.guard'
import { UsersModule } from '../users/users.module'
import { OauthService } from './oauth/oauth.service'
import { OauthController } from './oauth/oauth.controller'

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController, OauthController],
  providers: [AuthService, AccessTokenGuard, OauthService],
  exports: [AuthService, AccessTokenGuard],
})
export class AuthModule {}
