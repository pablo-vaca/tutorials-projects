import { Module } from '@nestjs/common';
import { QueueManagerController } from './queue-manager.controller';
import { QueueManagerService } from './queue-manager.service';

@Module({
  controllers: [QueueManagerController],
  providers: [QueueManagerService],
  exports: [QueueManagerService],
})
export class QueueManagerModule {}