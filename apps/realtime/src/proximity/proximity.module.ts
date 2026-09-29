import { Module } from '@nestjs/common'
import { ProximityGateway } from './proximity.gateway'

@Module({
  providers: [ProximityGateway],
})
export class ProximityModule {}
