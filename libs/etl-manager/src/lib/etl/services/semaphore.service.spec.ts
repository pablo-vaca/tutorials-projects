/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as uuid from 'uuid';

import { SemaphoreService } from './semaphore.service';
import { RandomFloat } from '../../shared/utils/random.utils';
import { Semaphore } from '../schemas/semaphore.schema';

// Mock external utilities
jest.mock('uuid');
jest.mock('../../shared/utils/random.utils');

describe('SemaphoreService', () => {
    let service: SemaphoreService;
    let model: any;

    const mockToken = 'test-uuid-token';
    const mockDate = new Date('2025-01-01T00:00:00Z');
    const mockOwner = 'owner-123';
    const mockResource = 'resource-abc';
    const mockProcess = 'process-xyz';

    // Helper to mock Mongoose chain: model.find().lean()
    const mockMongooseChain = (val: any) => ({
        lean: jest.fn().mockResolvedValue(val),
    });

    beforeEach(async () => {
        // Mock UUID
        (uuid.v4 as jest.Mock).mockReturnValue(mockToken);
        // Mock Random for sleep jitter
        (RandomFloat.getRandomFloat as jest.Mock).mockReturnValue(0.5);

        // Mock Date.now and new Date()
        jest.useFakeTimers();
        jest.setSystemTime(mockDate);

        const mockModel = {
            findOneAndUpdate: jest.fn(),
            findOne: jest.fn(),
            findOneAndDelete: jest.fn(),
            deleteOne: jest.fn(),
        };

        const mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SemaphoreService,
                {
                    provide: getModelToken(Semaphore.name),
                    useValue: mockModel,
                },
                {
                    provide: Logger,
                    useValue: mockLogger,
                },
            ],
        }).compile();

        service = module.get<SemaphoreService>(SemaphoreService);
        model = module.get(getModelToken(Semaphore.name));

        // Bypass real delays in sleep
        jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('acquire', () => {
        it('should successfully acquire a lock on the first attempt', async () => {
            const mockResult = { token: mockToken, ownerId: mockOwner };
            model.findOneAndUpdate.mockReturnValue(mockMongooseChain(mockResult));

            const result = await service.acquire(mockResource, mockProcess, mockOwner);

            expect(result.acquired).toBe(true);
            expect(result.token).toBe(mockToken);
            expect(model.findOneAndUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ resource: mockResource }),
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('should return failure if locked by another owner', async () => {
            const otherOwner = 'other-owner';
            const existingLock = {
                ownerId: otherOwner,
                expiresAt: new Date(),
                token: 'other-token',
            };

            // First findOneAndUpdate returns an existing doc owned by someone else
            model.findOneAndUpdate.mockReturnValue(mockMongooseChain(existingLock));

            const result = await service.acquire(mockResource, mockProcess, mockOwner);

            expect(result.acquired).toBe(false);
            expect(result.reason).toBe('locked_by_other');
            expect(result.ownerId).toBe(otherOwner);
        });

        it('should retry on duplicate key error (11000) and eventually succeed', async () => {
            const error11000 = { code: 11000 };
            const successDoc = { token: mockToken, ownerId: mockOwner };

            // Fail first, succeed second
            model.findOneAndUpdate
                .mockReturnValueOnce({ lean: jest.fn().mockRejectedValue(error11000) })
                .mockReturnValueOnce(mockMongooseChain(successDoc));

            const result = await service.acquire(mockResource, mockProcess, mockOwner);

            expect(result.acquired).toBe(true);
            expect(model.findOneAndUpdate).toHaveBeenCalledTimes(2);
        });

        it('should return error reason on unexpected exceptions', async () => {
            model.findOneAndUpdate.mockReturnValue({
                lean: jest.fn().mockRejectedValue(new Error('DB Crash')),
            });

            const result = await service.acquire(mockResource, mockProcess, mockOwner);

            expect(result.acquired).toBe(false);
            expect(result.reason).toContain('error:DB Crash');
        });

        it('should return locked_by_other if findOneAndUpdate returns null and findOne finds owner', async () => {
            model.findOneAndUpdate.mockReturnValue(mockMongooseChain(null));
            model.findOne.mockReturnValue(mockMongooseChain({ ownerId: 'someone-else' }));

            const result = await service.acquire(mockResource, mockProcess, mockOwner);

            expect(result.acquired).toBe(false);
            expect(result.reason).toBe('locked_by_other');
        });
    });

    describe('release', () => {
        it('should release the lock successfully', async () => {
            model.findOneAndDelete.mockReturnValue(mockMongooseChain({ resource: mockResource }));

            const result = await service.release(mockResource, mockProcess, mockOwner, mockToken);

            expect(result.released).toBe(true);
        });

        it('should return no_lock_present if lock does not exist during release', async () => {
            model.findOneAndDelete.mockReturnValue(mockMongooseChain(null));
            model.findOne.mockReturnValue(mockMongooseChain(null));

            const result = await service.release(mockResource, mockProcess, mockOwner, mockToken);

            expect(result.released).toBe(false);
            expect(result.reason).toBe('no_lock_present');
        });

        it('should return not_owner if current lock owner differs', async () => {
            model.findOneAndDelete.mockReturnValue(mockMongooseChain(null));
            model.findOne.mockReturnValue(
                mockMongooseChain({ ownerId: 'wrong-owner', token: 'wrong-token' })
            );

            const result = await service.release(mockResource, mockProcess, mockOwner, mockToken);

            expect(result.released).toBe(false);
            expect(result.reason).toBe('not_owner');
        });

        it('should return error if deletion fails', async () => {
            model.findOneAndDelete.mockReturnValue({
                lean: jest.fn().mockRejectedValue(new Error('Delete Error')),
            });

            const result = await service.release(mockResource, mockProcess, mockOwner, mockToken);

            expect(result.released).toBe(false);
            expect(result.reason).toBe('error:Delete Error');
        });
    });

    describe('isLocked', () => {
        it('should return locked true if a valid lock exists', async () => {
            model.findOne.mockReturnValue(
                mockMongooseChain({ ownerId: mockOwner, expiresAt: mockDate })
            );

            const result = await service.isLocked(mockResource, mockProcess);

            expect(result.locked).toBe(true);
            expect(result.ownerId).toBe(mockOwner);
        });

        it('should return locked false if no lock exists', async () => {
            model.findOne.mockReturnValue(mockMongooseChain(null));

            const result = await service.isLocked(mockResource, mockProcess);

            expect(result.locked).toBe(false);
        });
    });

    describe('forceRelease', () => {
        it('should call deleteOne and return forced true', async () => {
            model.deleteOne.mockResolvedValue({ deletedCount: 1 });

            const result = await service.forceRelease(mockResource, mockProcess);

            expect(result.forced).toBe(true);
            expect(model.deleteOne).toHaveBeenCalledWith({
                resource: mockResource,
                processType: mockProcess,
            });
        });
    });

    describe('refresh', () => {
        it('should successfully refresh the lock', async () => {
            const updatedDoc = { expiresAt: new Date(mockDate.getTime() + 120000) };
            model.findOneAndUpdate.mockReturnValue(mockMongooseChain(updatedDoc));

            const result = await service.refresh(mockResource, mockProcess, mockOwner, mockToken);

            expect(result.refreshed).toBe(true);
            expect(result.expiresAt).toEqual(updatedDoc.expiresAt);
        });

        it('should fail refresh if lock expired or owner mismatch', async () => {
            model.findOneAndUpdate.mockReturnValue(mockMongooseChain(null));
            model.findOne.mockReturnValue(
                mockMongooseChain({ ownerId: mockOwner, token: mockToken })
            ); // owner matches but query failed -> implies expiration

            const result = await service.refresh(mockResource, mockProcess, mockOwner, mockToken);

            expect(result.refreshed).toBe(false);
            expect(result.reason).toBe('expired');
        });

        it('should fail refresh with no_lock_present if doc is missing', async () => {
            model.findOneAndUpdate.mockReturnValue(mockMongooseChain(null));
            model.findOne.mockReturnValue(mockMongooseChain(null));

            const result = await service.refresh(mockResource, mockProcess, mockOwner, mockToken);

            expect(result.refreshed).toBe(false);
            expect(result.reason).toBe('no_lock_present');
        });
    });
});
