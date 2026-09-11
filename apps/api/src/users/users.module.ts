import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { MeController } from './me.controller'

@Module({
  controllers: [MeController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
