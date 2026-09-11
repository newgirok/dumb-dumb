import { Module } from '@nestjs/common'
import { WorldGateway } from './world.gateway'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  providers: [WorldGateway],
})
export class WorldModule {}
