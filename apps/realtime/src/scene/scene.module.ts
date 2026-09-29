import { Module } from '@nestjs/common'
import { NeighborhoodGateway } from './neighborhood.gateway'
import { SceneGateway } from './scene.gateway'

@Module({
  providers: [SceneGateway, NeighborhoodGateway],
})
export class SceneModule {}
