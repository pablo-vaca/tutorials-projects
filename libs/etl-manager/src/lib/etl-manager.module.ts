import { Module } from '@nestjs/common';
import { EtlManagerController } from './etl-manager.controller';
import { EtlManagerService } from './etl-manager.service';

@Module({
  controllers: [EtlManagerController],
  providers: [EtlManagerService],
  exports: [EtlManagerService],
})
export class EtlManagerModule {}
