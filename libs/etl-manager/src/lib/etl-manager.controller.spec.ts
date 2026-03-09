import { Test, TestingModule } from '@nestjs/testing';
import { EtlManagerController } from './etl-manager.controller';
import { EtlManagerService } from './etl-manager.service';

describe('EtlManagerController', () => {
  let controller: EtlManagerController;
  let service: EtlManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EtlManagerController],
      providers: [EtlManagerService],
    }).compile();

    controller = module.get<EtlManagerController>(EtlManagerController);
    service = module.get<EtlManagerService>(EtlManagerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHello', () => {
    it('should return hello message', () => {
      expect(controller.getHello()).toEqual({ message: 'hello from etl-manager' });
    });

    it('should call etlManagerService.getHello', () => {
      const spy = jest.spyOn(service, 'getHello');
      controller.getHello();
      expect(spy).toHaveBeenCalled();
    });
  });
});
