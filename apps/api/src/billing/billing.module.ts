import { Module } from '@nestjs/common'
import { BillingService } from './billing.service'
import { BillingController } from './billing.controller'
import { FulfillmentService } from './fulfillment.service'
import { FulfillmentWorker } from './fulfillment.worker'
import { AvatarsModule } from '../avatars/avatars.module'

@Module({
  imports: [AvatarsModule],
  controllers: [BillingController],
  providers: [BillingService, FulfillmentService, FulfillmentWorker],
  exports: [BillingService, FulfillmentService],
})
export class BillingModule {}
