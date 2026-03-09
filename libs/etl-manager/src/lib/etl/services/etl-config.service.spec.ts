/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';

import EtlConfigService, { ConfigHistoryActions } from './etl-config.service';
import { EtlConfig, EtlConfigDocument } from '../schemas/etl-config.schema';
import { GlobalCounter } from '../schemas/global-counter.schema';

describe('EtlConfigService', () => {
    let service: EtlConfigService;
    let model: Model<EtlConfigDocument>;

    // Mock Data
    const mockConfigId = '6582f1e2c1';
    const mockProjectId = 'project-abc';
    const mockConfig = {
        _id: mockConfigId,
        projectId: mockProjectId,
        correlationId: 'some-uuid',
        history: [],
        save: jest.fn().mockReturnThis(),
    };

    let capturedInstance: any;

    // 2. The Mock Model Factory
    const mockModelFactory = jest.fn().mockImplementation((dto) => {
        // Every time 'new EtlConfigModel()' is called, we create this object
        capturedInstance = {
            ...dto,
            // eslint-disable-next-line func-names
            save: jest.fn().mockImplementation(function () {
                // Return this object itself to simulate the saved document
                return Promise.resolve(this);
            }),
        };
        return capturedInstance;
    });

    // Static/Model methods
    const mockModelMethods = {
        findById: jest.fn(),
        find: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findByIdAndDelete: jest.fn(),
    };
    Object.assign(mockModelFactory, mockModelMethods);

    // GlobalCounter mock
    const mockGlobalCounterModel = {
        findOneAndUpdate: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue({ _id: 'project_order_seq', seq: 1 }),
            }),
        }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EtlConfigService,
                {
                    provide: getModelToken(EtlConfig.name),
                    useValue: mockModelFactory,
                },
                {
                    provide: getModelToken(GlobalCounter.name),
                    useValue: mockGlobalCounterModel,
                },
            ],
        }).compile();

        service = module.get<EtlConfigService>(EtlConfigService);
        model = module.get<Model<EtlConfigDocument>>(getModelToken(EtlConfig.name));
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create a config and assign a correlationId', async () => {
            const dto = { projectId: 'project-123' };

            const result = await service.create(dto);

            // Now result will contain the correlationId assigned in the service
            expect(result.correlationId).toBeDefined();
            expect(result.correlationId).toHaveLength(36); // UUID v4 length
            expect(result.projectId).toBe('project-123');

            // Verify that save was actually called
            expect(capturedInstance.save).toHaveBeenCalled();
        });

        it('should assign order from global counter when projectId is provided', async () => {
            mockGlobalCounterModel.findOneAndUpdate.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({ _id: 'project_order_seq', seq: 42 }),
                }),
            });

            const dto = { projectId: 'project-456' };
            const result = await service.create(dto);

            expect(mockGlobalCounterModel.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: 'project_order_seq' },
                { $inc: { seq: 1 } },
                { upsert: true, new: true }
            );
            expect(result.order).toBe(42);
        });

        it('should still save config if global counter fails', async () => {
            mockGlobalCounterModel.findOneAndUpdate.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockRejectedValue(new Error('DB down')),
                }),
            });

            const dto = { projectId: 'project-789' };
            const result = await service.create(dto);

            expect(result.projectId).toBe('project-789');
            expect(result.order).toBeUndefined();
            expect(capturedInstance.save).toHaveBeenCalled();
        });
    });

    describe('findByProjectId', () => {
        it('should return the first match from findByQuery', async () => {
            const mockResults = [mockConfig];
            mockModelMethods.find.mockReturnValue({
                exec: jest.fn().mockResolvedValueOnce(mockResults),
            });

            const result = await service.findByProjectId(mockProjectId);

            expect(model.find).toHaveBeenCalledWith({
                projectId: mockProjectId,
                deletedAt: { $exists: false },
            });

            // eslint-disable-next-line no-underscore-dangle
            expect(result?._id).toBe(mockConfigId);
        });

        it('should return null if no results found', async () => {
            mockModelMethods.find.mockReturnValue({
                exec: jest.fn().mockResolvedValueOnce([]),
            });
            const result = await service.findByProjectId('invalid');
            expect(result).toBeNull();
        });
    });

    describe('updateStatus', () => {
        it('should update status and push to history', async () => {
            mockModelMethods.findByIdAndUpdate.mockReturnValue({
                exec: jest.fn().mockResolvedValueOnce({ ...mockConfig, status: 'failed' }),
            });

            const result = await service.updateStatus(
                mockConfigId,
                'failed' as any,
                'Error occurred'
            );

            expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
                mockConfigId,
                expect.objectContaining({
                    status: 'failed',
                    errorMessage: 'Error occurred',
                    $push: expect.objectContaining({
                        history: expect.objectContaining({ action: 'status_changed_to_failed' }),
                    }),
                }),
                { new: true }
            );
            expect(result?.status).toBe('failed');
        });
    });

    describe('getDefaultConfig', () => {
        it('should merge params with default values', () => {
            const customParam = { projectName: 'Custom Name' };
            const result = service.getDefaultConfig(customParam);

            // result is an instance of the mock model
            expect(result.projectName).toBe('Custom Name');
            expect(result.chunksConfig.chunkSize).toBe(800); // Default
        });
    });

    describe('getLastResyncTimestamp', () => {
        it('should return the most recent resync timestamp', async () => {
            const dateOld = new Date('2023-01-01');
            const dateNew = new Date('2023-01-02');

            const configWithHistory = {
                history: [
                    { action: ConfigHistoryActions.RESYNC_PROJECT, timestamp: dateOld },
                    { action: ConfigHistoryActions.RESYNC_PROJECT, timestamp: dateNew },
                    { action: 'other_action', timestamp: new Date() },
                ],
            } as EtlConfig;

            const result = await service.getLastResyncTimestamp(configWithHistory);
            expect(result).toEqual(dateNew);
        });

        it('should return null if no resync entries exist', async () => {
            const configWithHistory = { history: [] } as EtlConfig;
            const result = await service.getLastResyncTimestamp(configWithHistory);
            expect(result).toBeNull();
        });
    });
});
