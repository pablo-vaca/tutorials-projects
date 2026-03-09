/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { Test, TestingModule } from '@nestjs/testing';

import { GenericQueueService } from '@deal-insights/shared-nestjs-utils';

import EtlConfigService from './etl-config.service';
import SharepointSyncOrchestrator from './sharepoint-sync-orchestrator.service';
import SharepointService from './sharepoint.service';
import { EtlJobType } from '../jobs/etl-job.types';

describe('SharepointSyncOrchestrator', () => {
    let service: SharepointSyncOrchestrator;
    let etlConfigService: jest.Mocked<EtlConfigService>;
    let sharepointService: jest.Mocked<SharepointService>;
    let queueService: jest.Mocked<GenericQueueService>;

    const mockConfigId = 'config-123';
    const mockProjectId = 'project-abc';

    // Mock Data Helpers
    const mockSpConfig = {
        driveId: 'drive-1',
        folderId: 'folder-1',
        deltaLink: 'old-link',
    };

    const mockDeltaSyncType: any = {
        id: mockConfigId,
        projectId: mockProjectId,
        projectName: 'Test Project',
        spConfig: mockSpConfig,
        dataScope: 'all',
    };

    beforeEach(async () => {
        const mockEtlConfigService = {
            findByQuery: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            updateStatusToSyncing: jest.fn(),
        };
        const mockSharepointService = {
            getDeltaChanges: jest.fn(),
        };
        const mockQueueService = {
            queueJob: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SharepointSyncOrchestrator,
                { provide: EtlConfigService, useValue: mockEtlConfigService },
                { provide: SharepointService, useValue: mockSharepointService },
                { provide: GenericQueueService, useValue: mockQueueService },
            ],
        }).compile();

        service = module.get<SharepointSyncOrchestrator>(SharepointSyncOrchestrator);
        etlConfigService = module.get(EtlConfigService);
        sharepointService = module.get(SharepointService);
        queueService = module.get(GenericQueueService);
    });

    describe('deltaSyncProject', () => {
        it('should process DELETE changes correctly', async () => {
            // FIX: Use an object for 'deleted' as expected by typical SharePoint types
            const mockChange = {
                id: 'file-1',
                deleted: { state: 'deleted' },
            };

            sharepointService.getDeltaChanges.mockResolvedValue({
                changes: [mockChange] as any,
                newDeltaLink: 'new-link',
            });

            etlConfigService.updateStatusToSyncing.mockResolvedValue({
                status: 'syncing',
            } as any);

            etlConfigService.findById.mockResolvedValue({
                correlationId: 'corr-1',
            } as any);

            await service.deltaSyncProject(mockDeltaSyncType);

            expect(queueService.queueJob).toHaveBeenCalledWith(
                EtlJobType.ETL_SHAREPOINT_DELTA_DELETE,
                expect.objectContaining({ fileOriginId: 'file-1' })
            );
        });

        it('should process FILE (Upsert) changes correctly', async () => {
            // FIX: Ensure 'file' property exists and lastModifiedDateTime is a string
            const mockChange = {
                id: 'file-2',
                name: 'test.pdf',
                webUrl: 'https://sharepoint.com/test.pdf',
                size: 1024,
                createdDateTime: '2025-01-01T00:00:00Z',
                lastModifiedDateTime: '2025-01-01T10:00:00Z',
                file: {}, // Presence of this object triggers the 'else if (change.file)' branch
            };

            sharepointService.getDeltaChanges.mockResolvedValue({
                changes: [mockChange] as any,
                newDeltaLink: 'new-link',
            });

            etlConfigService.updateStatusToSyncing.mockResolvedValue({
                status: 'syncing',
            } as any);

            etlConfigService.findById.mockResolvedValue({
                correlationId: 'corr-2',
            } as any);

            await service.deltaSyncProject(mockDeltaSyncType);

            expect(queueService.queueJob).toHaveBeenCalledWith(
                EtlJobType.ETL_SHAREPOINT_DELTA_UPSERT,
                expect.objectContaining({
                    change: expect.objectContaining({ id: 'file-2', name: 'test.pdf' }),
                })
            );
        });

        it('should calculate the latestModificationDate correctly across multiple changes', async () => {
            const earlyDate = '2025-01-01T10:00:00Z';
            const laterDate = '2025-01-01T12:00:00Z';

            const changes = [
                { id: '1', file: {}, lastModifiedDateTime: earlyDate },
                { id: '2', file: {}, lastModifiedDateTime: laterDate },
            ];

            sharepointService.getDeltaChanges.mockResolvedValue({
                changes: changes as any,
                newDeltaLink: 'new-link',
            });

            etlConfigService.updateStatusToSyncing.mockResolvedValue({
                status: 'syncing',
            } as any);

            etlConfigService.findById.mockResolvedValue({ correlationId: 'corr' } as any);

            await service.deltaSyncProject(mockDeltaSyncType);

            // Verify update was called with the LATER date
            expect(etlConfigService.update).toHaveBeenCalledWith(
                mockConfigId,
                expect.objectContaining({
                    lastSharePointUpdateAt: new Date(laterDate),
                })
            );
        });

        it('should log info for unhandled change types (neither file nor deleted)', async () => {
            const mockChange = { id: 'folder-1' }; // Missing both .file and .deleted

            sharepointService.getDeltaChanges.mockResolvedValue({
                changes: [mockChange] as any,
                newDeltaLink: 'new-link',
            });

            const loggerSpy = jest.spyOn((service as any).logger, 'info');

            etlConfigService.updateStatusToSyncing.mockResolvedValue({
                status: 'syncing',
            } as any);

            await service.deltaSyncProject(mockDeltaSyncType);

            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining('Unhandled change type')
            );
            expect(queueService.queueJob).not.toHaveBeenCalled();
        });

        it('should log warn because other job is syncing the same project', async () => {
            const mockChange = { id: 'folder-1' }; // Missing both .file and .deleted

            sharepointService.getDeltaChanges.mockResolvedValue({
                changes: [mockChange] as any,
                newDeltaLink: 'new-link',
            });

            const loggerSpy = jest.spyOn((service as any).logger, 'warn');

            etlConfigService.updateStatusToSyncing.mockResolvedValue(null);

            await service.deltaSyncProject(mockDeltaSyncType);

            expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('is being synced'));
            expect(queueService.queueJob).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should catch and log errors during the main sync process', async () => {
            sharepointService.getDeltaChanges.mockRejectedValue(new Error('API Timeout'));
            const loggerSpy = jest.spyOn((service as any).logger, 'error');

            etlConfigService.updateStatusToSyncing.mockResolvedValue({
                status: 'syncing',
            } as any);

            await service.deltaSyncProject(mockDeltaSyncType);

            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to sync config'),
                expect.any(String)
            );
        });
    });
});
