import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { SectorGateway } from './sector.gateway'
import { AccessTokenVerifier } from '../auth/access-token'

@Module({
  imports: [JwtModule.register({})],
  providers: [SectorGateway, AccessTokenVerifier],
})
export class SectorModule {}
