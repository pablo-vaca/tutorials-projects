/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { TestHandler } from './test.handler';
import { SemaphoreService } from '../../services/semaphore.service';

describe('TestHandler', () => {
    let handler: TestHandler;
    let semaphoreService: jest.Mocked<SemaphoreService>;

    const mockJob = {
        id: 'job-999',
        payload: { testName: 'unit-test-run', status: 'success' },
    } as any;

    beforeEach(async () => {
        // Use modern fake timers to handle the 30s wait
        jest.useFakeTimers();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TestHandler,
                {
                    provide: SemaphoreService,
                    // Mocking the responses for semaphore
                    useValue: { acquire: jest.fn(), release: jest.fn() },
                },
                {
                    provide: Logger,
                    useValue: { info: jest.fn(), error: jest.fn() },
                },
            ],
        }).compile();

        handler = module.get<TestHandler>(TestHandler);
        semaphoreService = module.get(SemaphoreService);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('should complete successfully when lock is acquired', async () => {
        semaphoreService.acquire.mockResolvedValue({
            acquired: true,
            token: 'success-token',
            expiresAt: 12345,
        } as any);

        // 1. Start the handler (don't await yet)
        const handlerPromise = handler.handle(mockJob);

        // 2. Advance timers so the internal 30s promise resolves
        await jest.advanceTimersByTimeAsync(30000);

        // 3. Now await the final result
        const result = await handlerPromise;

        expect(result.success).toBe(true);
        expect(semaphoreService.release).toHaveBeenCalledWith(
            'TEST',
            'TEST',
            'unit-test-run',
            'success-token'
        );
    });

    it('should return failure result immediately if lock is not acquired', async () => {
        semaphoreService.acquire.mockResolvedValue({ acquired: false } as any);

        const result = await handler.handle(mockJob);

        expect(result.success).toBe(false);
        // Code still calls release in finally block even if not acquired
        expect(semaphoreService.release).toHaveBeenCalled();
    });
});
