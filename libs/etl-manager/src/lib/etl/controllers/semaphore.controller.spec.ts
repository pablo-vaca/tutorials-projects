/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import SemaphoreController from './semaphore.controller';
import { SemaphoreService } from '../services/semaphore.service';

describe('SemaphoreController', () => {
    let controller: SemaphoreController;
    let semaphoreService: jest.Mocked<SemaphoreService>;
    let logger: jest.Mocked<Logger>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SemaphoreController],
            providers: [
                {
                    provide: SemaphoreService,
                    useValue: {
                        isLocked: jest.fn(),
                        acquire: jest.fn(),
                        release: jest.fn(),
                        refresh: jest.fn(),
                        forceRelease: jest.fn(),
                    },
                },
                {
                    provide: Logger,
                    useValue: {
                        info: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get<SemaphoreController>(SemaphoreController);
        semaphoreService = module.get(SemaphoreService);
        logger = module.get(Logger);
    });

    const mockData = {
        resource: 'project-123',
        processType: 'etl-sync',
        ownerId: 'user-456',
        token: 'uuid-token-789',
    };

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('isLocked', () => {
        it('should call semaphoreService.isLocked with query params', async () => {
            semaphoreService.isLocked.mockResolvedValue(true as any);

            const result = await controller.isLocked(mockData.resource, mockData.processType);

            expect(logger.info).toHaveBeenCalled();
            expect(semaphoreService.isLocked).toHaveBeenCalledWith(
                mockData.resource,
                mockData.processType
            );
            expect(result).toBe(true);
        });
    });

    describe('acquire', () => {
        it('should call semaphoreService.acquire with body data', async () => {
            const mockResponse = { success: true, token: mockData.token };
            semaphoreService.acquire.mockResolvedValue(mockResponse as any);

            const result = await controller.acquire(
                mockData.resource,
                mockData.processType,
                mockData.ownerId
            );

            expect(semaphoreService.acquire).toHaveBeenCalledWith(
                mockData.resource,
                mockData.processType,
                mockData.ownerId
            );
            expect(result).toEqual(mockResponse);
        });
    });

    describe('release', () => {
        it('should call semaphoreService.release with body data', async () => {
            semaphoreService.release.mockResolvedValue(true as any);

            await controller.release(
                mockData.resource,
                mockData.processType,
                mockData.ownerId,
                mockData.token
            );

            expect(semaphoreService.release).toHaveBeenCalledWith(
                mockData.resource,
                mockData.processType,
                mockData.ownerId,
                mockData.token
            );
        });
    });

    describe('refresh', () => {
        it('should call semaphoreService.refresh with body data', async () => {
            semaphoreService.refresh.mockResolvedValue(true as any);

            await controller.refresh(
                mockData.resource,
                mockData.processType,
                mockData.ownerId,
                mockData.token
            );

            expect(semaphoreService.refresh).toHaveBeenCalledWith(
                mockData.resource,
                mockData.processType,
                mockData.ownerId,
                mockData.token
            );
        });
    });

    describe('forceRelease', () => {
        it('should call semaphoreService.forceRelease with body data', async () => {
            semaphoreService.forceRelease.mockResolvedValue(true as any);

            await controller.forceRelease(mockData.resource, mockData.processType);

            expect(semaphoreService.forceRelease).toHaveBeenCalledWith(
                mockData.resource,
                mockData.processType
            );
        });
    });
});
