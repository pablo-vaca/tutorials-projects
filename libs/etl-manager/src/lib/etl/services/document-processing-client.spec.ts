/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import FileService from './file.service';
import AuthApiService from '../../auth/auth-api.service';
import { ExternalApiException } from '../exceptions';
import DocumentProcessingClient from './document-processing-client';

describe('DocumentProcessingClient', () => {
    let service: DocumentProcessingClient;
    let fileService: FileService;
    let authApiService: AuthApiService;
    let logger: Logger;

    const mockAxiosRef = {
        post: jest.fn(),
        get: jest.fn(),
    };

    const mockConfig = {
        CORE_API_URL: 'https://api.test.com',
        X_API_KEY: 'test-api-key',
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DocumentProcessingClient,
                {
                    provide: HttpService,
                    useValue: { axiosRef: mockAxiosRef },
                },
                {
                    provide: ConfigService,
                    useValue: { get: jest.fn((key: string) => mockConfig[key]) },
                },
                {
                    provide: FileService,
                    useValue: { updateRemoteId: jest.fn().mockResolvedValue(true) },
                },
                {
                    provide: AuthApiService,
                    useValue: { getMachineToken: jest.fn().mockResolvedValue('mock-token') },
                },
                {
                    provide: Logger,
                    useValue: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
                },
            ],
        }).compile();

        service = module.get<DocumentProcessingClient>(DocumentProcessingClient);
        fileService = module.get<FileService>(FileService);
        authApiService = module.get<AuthApiService>(AuthApiService);
        logger = module.get<Logger>(Logger);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('uploadFile', () => {
        const mongoFileId = 'mongo-123';
        const fileBuffer = Buffer.from('test content');
        const fileName = 'test.pdf';
        const mimeType = 'application/pdf';

        it('should successfully upload a file and update the local database', async () => {
            const remoteId = 'remote-xyz';
            mockAxiosRef.post.mockResolvedValueOnce({ data: { id: remoteId } });

            const result = await service.uploadFile(mongoFileId, fileBuffer, fileName, mimeType);

            expect(authApiService.getMachineToken).toHaveBeenCalled();
            expect(mockAxiosRef.post).toHaveBeenCalledWith(
                expect.stringContaining('/document-processing/v1/files'),
                expect.any(Object), // FormData
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer mock-token',
                        'X-Api-Key': 'test-api-key',
                    }),
                })
            );
            expect(fileService.updateRemoteId).toHaveBeenCalledWith(mongoFileId, remoteId);
            expect(result).toBe(mongoFileId);
        });

        it('should throw ExternalApiException if the upload fails', async () => {
            const errorResponse = {
                message: 'Network Error',
                response: { status: 500, data: 'Internal Server Error' },
            };
            mockAxiosRef.post.mockRejectedValueOnce(errorResponse);

            await expect(
                service.uploadFile(mongoFileId, fileBuffer, fileName, mimeType)
            ).rejects.toThrow(ExternalApiException);

            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('getChunks', () => {
        const remoteFileId = 'remote-123';
        const chunkSize = 1000;
        const overlap = 100;

        it('should get chunks using a provided access token', async () => {
            const mockChunks = ['chunk1', 'chunk2'];
            const customToken = 'custom-token';
            mockAxiosRef.get.mockResolvedValueOnce({ data: mockChunks });

            const result = await service.getChunks(remoteFileId, chunkSize, overlap, customToken);

            expect(authApiService.getMachineToken).not.toHaveBeenCalled();
            expect(mockAxiosRef.get).toHaveBeenCalledWith(
                expect.stringContaining(`${remoteFileId}/chunks/${chunkSize}/${overlap}`),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${customToken}`,
                    }),
                })
            );
            expect(result).toEqual(mockChunks);
        });

        it('should fetch machine token if no accessToken is provided', async () => {
            mockAxiosRef.get.mockResolvedValueOnce({ data: [] });

            await service.getChunks(remoteFileId, chunkSize, overlap);

            expect(authApiService.getMachineToken).toHaveBeenCalled();
        });
    });

    describe('uploadMarkdownFile', () => {
        it('should upload markdown file and return the remote ID', async () => {
            const remoteId = 'new-markdown-id';
            const customToken = 'md-token';
            mockAxiosRef.post.mockResolvedValueOnce({ data: { id: remoteId } });

            const result = await service.uploadMarkdownFile(
                Buffer.from('# Header'),
                'doc.md',
                'text/markdown',
                customToken
            );

            expect(result).toBe(remoteId);
            expect(fileService.updateRemoteId).not.toHaveBeenCalled(); // Ensure db isn't updated for this method
        });
    });
});
