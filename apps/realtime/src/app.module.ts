import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health.controller'
import { SceneModule } from './scene/scene.module'
import { WorldModule } from './world/world.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    SceneModule,
    WorldModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
