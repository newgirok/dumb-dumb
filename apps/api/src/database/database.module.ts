import { Global, Module } from '@nestjs/common'
import { DatabaseService, pgPoolProvider } from './database.service'

@Global()
@Module({
  providers: [pgPoolProvider, DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
