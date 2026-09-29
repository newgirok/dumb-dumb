import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health.controller'
import { ProximityModule } from './proximity/proximity.module'
import { RoomModule } from './room/room.module'
import { SectorModule } from './sector/sector.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    RoomModule,
    ProximityModule,
    SectorModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
