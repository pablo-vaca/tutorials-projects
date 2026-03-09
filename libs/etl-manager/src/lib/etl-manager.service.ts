import { Injectable } from '@nestjs/common';

@Injectable()
export class EtlManagerService {
  getHello(): { message: string } {
    return { message: 'hello from etl-manager' };
  }
}
