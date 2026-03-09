/* eslint-disable jest/no-conditional-expect */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';

import EtlController from './etl.controller';
import { ValidationException } from '../exceptions';
import DocumentProcessingClient from '../services/document-processing-client';
import EtlConfigService from '../services/etl-config.service';
import EtlService from '../services/etl.service';
import FileService from '../services/file.service';
import SharepointService from '../services/sharepoint.service';

describe('EtlController', () => {
    let controller: EtlController;
    let documentProcessingService: jest.Mocked<DocumentProcessingClient>;
    let fileService: jest.Mocked<FileService>;
    let etlConfigService: jest.Mocked<EtlConfigService>;
    let sharepointService: jest.Mocked<SharepointService>;
    let etlService: jest.Mocked<EtlService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [EtlController],
            providers: [
                {
                    provide: DocumentProcessingClient,
                    useValue: { getChunks: jest.fn() },
                },
                {
                    provide: FileService,
                    useValue: { findById: jest.fn() },
                },
                {
                    provide: EtlConfigService,
                    useValue: { create: jest.fn(), delete: jest.fn() },
                },
                {
                    provide: SharepointService,
                    useValue: { getDriveItemFromUrl: jest.fn() },
                },
                {
                    provide: EtlService,
                    useValue: { createEtlProcessForProject: jest.fn(), projectCleanup: jest.fn() },
                },
            ],
        }).compile();

        controller = module.get<EtlController>(EtlController);
        documentProcessingService = module.get(DocumentProcessingClient);
        fileService = module.get(FileService);
        etlConfigService = module.get(EtlConfigService);
        sharepointService = module.get(SharepointService);
        etlService = module.get(EtlService);
    });

    describe('createChunks', () => {
        const mockFileId = '65818987d60517721869e5f4';
        const mockRequest = {
            headers: { authorization: 'Bearer mock-token' },
        } as unknown as Request;
        const mockDto = {
            chunkSize: 100,
            overlap: 10,
            projectId: '',
            deploymentId: '',
            user: '',
            model: '',
        };

        it('should throw ValidationException if fileId is missing or invalid length', async () => {
            await expect(controller.createChunks('', mockRequest, mockDto)).rejects.toThrow(
                ValidationException
            );
            await expect(controller.createChunks('short', mockRequest, mockDto)).rejects.toThrow(
                ValidationException
            );
        });

        it('should throw ValidationException if overlap is >= 1/3 of chunkSize', async () => {
            await expect(
                controller.createChunks(mockFileId, mockRequest, { ...mockDto, overlap: 34 })
            ).rejects.toThrow('overlap must be less than one third of chunkSize');
        });

        it('should return chunks on success', async () => {
            const mockFile = { toObject: () => ({ remoteId: 'remote-123' }) };
            fileService.findById.mockResolvedValue(mockFile as any);
            documentProcessingService.getChunks.mockResolvedValue(['chunk1'] as any);

            const result = await controller.createChunks(mockFileId, mockRequest, mockDto);
            expect(result).toEqual(['chunk1']);
        });

        it('should handle errors from documentProcessingService and extract status', async () => {
            fileService.findById.mockResolvedValue({ toObject: () => ({ remoteId: 'id' }) } as any);
            const error = { response: { status: 404 }, message: 'Not Found' };
            documentProcessingService.getChunks.mockRejectedValue(error);

            try {
                await controller.createChunks(mockFileId, mockRequest, mockDto);
            } catch (e) {
                expect(e).toBeInstanceOf(HttpException);
                expect(e.getStatus()).toBe(404);
            }
        });
    });

    describe('getTokenFromHeader', () => {
        it('should throw 401 if authorization header is missing', async () => {
            const req = { headers: {} } as Request;
            await expect(
                controller.createChunks('65818987d60517721869e5f4', req, {} as any)
            ).rejects.toThrow('Missing or invalid Authorization header');
        });

        it('should throw 401 if authorization header does not start with Bearer', async () => {
            const req = { headers: { authorization: 'Basic 123' } } as unknown as Request;
            await expect(
                controller.createChunks('65818987d60517721869e5f4', req, {} as any)
            ).rejects.toThrow(HttpException);
        });
    });

    describe('createConfig', () => {
        const mockDto = {
            projectId: 'p1',
            sharepointUrl: 'https://test.com',
            sharepointTennantId: 't1',
            sharepointFolder: 'f1',
        };

        it('should create config successfully and use default driveId if missing', async () => {
            process.env.SHAREPOINT_DEFAULT_DRIVE_ID = 'default-drive';
            sharepointService.getDriveItemFromUrl.mockResolvedValue({
                parentReference: { driveId: null }, // Trigger fallback
            } as any);
            etlConfigService.create.mockResolvedValue({ id: 'config-id' } as any);

            const result = await controller.createConfig(mockDto as any);
            expect(result.configId).toBe('config-id');
            expect(etlConfigService.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    dataSource: expect.objectContaining({
                        config: expect.objectContaining({ driveId: 'default-drive' }),
                    }),
                })
            );
        });

        it('should throw HttpException on service failure', async () => {
            sharepointService.getDriveItemFromUrl.mockRejectedValue(new Error('SP Fail'));
            await expect(controller.createConfig(mockDto as any)).rejects.toThrow(HttpException);
        });
    });

    describe('projectDataCleanup', () => {
        it('should queue a cleanup job via etlService and return job details', async () => {
            const mockJob = { id: 'job-123' };
            // El controlador llama a etlService.projectCleanup, no directamente a la queue
            etlService.projectCleanup.mockResolvedValue(mockJob as any);

            const result = await controller.projectDataCleanup('proj-1', 'corr-1');

            expect(etlService.projectCleanup).toHaveBeenCalledWith('proj-1', 'corr-1', 'RESYNC');
            expect(result).toEqual({
                message: 'RESYNC Cleanup queued',
                projectId: 'proj-1',
                correlationId: 'corr-1',
                job: mockJob,
            });
        });
    });

    describe('testNewProject', () => {
        it('should call etlService.createEtlProcessForProject', async () => {
            const body = { projectId: '1', projectName: 'N', sharepointUrl: 'U', dataScope: 'S' };
            etlService.createEtlProcessForProject.mockResolvedValue('ok' as any);

            const result = await controller.testNewProject(body);
            expect(result).toEqual({ response: 'ok' });
            expect(etlService.createEtlProcessForProject).toHaveBeenCalledWith('1', 'N', 'U', 'S');
        });
    });

    describe('deleteConfig', () => {
        // ACTUALIZADO: El controlador ahora delega a etlService.projectCleanup con 'DELETE'
        // Ya no hace soft delete booleano directo aquí.

        it('should queue a delete job via etlService', async () => {
            const mockJob = { id: 'job-delete-1' };
            etlService.projectCleanup.mockResolvedValue(mockJob as any);

            const result = await controller.deleteConfig('config-123', 'corr-123');

            expect(etlService.projectCleanup).toHaveBeenCalledWith(
                'config-123',
                'corr-123',
                'DELETE'
            );
            expect(result).toEqual({
                message: 'Vectorstore clear and delete job queued',
                job: mockJob,
            });
        });

        it('should propagate errors from etlService', async () => {
            etlService.projectCleanup.mockRejectedValue(new Error('Cleanup failed'));

            await expect(controller.deleteConfig('config-123', 'corr-123')).rejects.toThrow(
                'Cleanup failed'
            );
        });
    });
});
