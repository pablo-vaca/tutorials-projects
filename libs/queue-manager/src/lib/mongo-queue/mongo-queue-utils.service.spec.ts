import { Test, TestingModule } from '@nestjs/testing';

import { MongoQueueUtilsService } from './mongo-queue-utils.service';

describe('MongoQueueUtilsService', () => {
    let service: MongoQueueUtilsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [MongoQueueUtilsService],
        }).compile();

        service = module.get<MongoQueueUtilsService>(MongoQueueUtilsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('id', () => {
        it('should create a random id', () => {
            const result = service.id();
            expect(result).toHaveLength(32);
            expect(typeof result).toBe('string');
        });
    });

    describe('now', () => {
        it('should create a new date', () => {
            const result = service.now();
            expect(result).toBeInstanceOf(Date);
        });
    });

    describe('nowPlusSeconds', () => {
        it('should create a new date with extra seconds', () => {
            const result = service.nowPlusSeconds(1);
            expect(result).toBeInstanceOf(Date);
        });
    });
});
