import { Test, TestingModule } from '@nestjs/testing';
import { QueueManagerController } from './queue-manager.controller';
import { QueueManagerService } from './queue-manager.service';

describe('QueueManagerController', () => {
  let controller: QueueManagerController;
  let service: QueueManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueManagerController],
      providers: [QueueManagerService],
    }).compile();

    controller = module.get<QueueManagerController>(QueueManagerController);
    service = module.get<QueueManagerService>(QueueManagerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHello', () => {
    it('should return hello message', () => {
      expect(controller.getHello()).toEqual({ message: 'hello from queue-manager' });
    });

    it('should call queueManagerService.getHello', () => {
      const spy = jest.spyOn(service, 'getHello');
      controller.getHello();
      expect(spy).toHaveBeenCalled();
    });
  });
});