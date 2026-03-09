import { Test, TestingModule } from '@nestjs/testing';
import { EtlManagerService } from './etl-manager.service';

describe('EtlManagerService', () => {
  let service: EtlManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EtlManagerService],
    }).compile();

    service = module.get<EtlManagerService>(EtlManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return hello message', () => {
    expect(service.getHello()).toEqual({ message: 'hello from etl-manager' });
  });
});
