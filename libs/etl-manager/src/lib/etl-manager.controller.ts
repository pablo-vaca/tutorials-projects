import { Controller, Get } from '@nestjs/common';
import { EtlManagerService } from './etl-manager.service';

@Controller('etl-manager')
export class EtlManagerController {
  constructor(private readonly etlManagerService: EtlManagerService) {}

  @Get('hello')
  getHello(): { message: string } {
    return this.etlManagerService.getHello();
  }
}
