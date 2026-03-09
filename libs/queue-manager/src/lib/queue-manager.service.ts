import { Injectable } from '@nestjs/common';

@Injectable()
export class QueueManagerService {
  getHello(): { message: string } {
    return { message: 'hello from queue-manager' };
  }
}