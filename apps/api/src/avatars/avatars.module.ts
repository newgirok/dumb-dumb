import { Module } from '@nestjs/common'
import { AvatarsService } from './avatars.service'
import { AvatarsWorker } from './avatars.worker'

@Module({
  providers: [AvatarsService, AvatarsWorker],
  exports: [AvatarsService, AvatarsWorker],
})
export class AvatarsModule {}
