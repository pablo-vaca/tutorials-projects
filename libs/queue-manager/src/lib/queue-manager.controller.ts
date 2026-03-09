import { Controller, Get } from '@nestjs/common';
import { QueueManagerService } from './queue-manager.service';

@Controller('queue-manager')
export class QueueManagerController {
  constructor(private readonly queueManagerService: QueueManagerService) {}

  @Get('hello')
  getHello(): { message: string } {
    return this.queueManagerService.getHello();
  }
}