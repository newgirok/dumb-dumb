import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { WorldGateway } from './world.gateway'
import { AccessTokenVerifier } from '../auth/access-token'

@Module({
  imports: [JwtModule.register({})],
  providers: [WorldGateway, AccessTokenVerifier],
})
export class WorldModule {}
