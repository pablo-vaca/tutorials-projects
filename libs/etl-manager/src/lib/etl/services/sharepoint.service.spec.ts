/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';

import SharepointService from './sharepoint.service';
import { ProcessingException } from '../exceptions';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SharepointService', () => {
    let service: SharepointService;

    let mockAxiosInstance: any;

    const mockTenantId = 'tenant-123';
    const mockClientId = 'client-123';
    const mockClientSecret = 'secret-123';

    beforeEach(async () => {
        // Clear all mock call history before each test
        jest.clearAllMocks();

        mockAxiosInstance = {
            get: jest.fn(),
            post: jest.fn(),
            defaults: { headers: { common: {} } },
        };

        mockedAxios.create.mockReturnValue(mockAxiosInstance);

        // Mock the token response
        mockedAxios.post.mockResolvedValue({
            data: { access_token: 'mock-token', expires_in: 3600 },
        });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SharepointService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string) => {
                            if (key === 'AZURE_TENANT_ID') return mockTenantId;
                            if (key === 'AZURE_CLIENT_ID') return mockClientId;
                            if (key === 'AZURE_CLIENT_SECRET') return mockClientSecret;
                            return null;
                        }),
                    },
                },
            ],
        }).compile();

        service = module.get<SharepointService>(SharepointService);
    });

    describe('Initialization & Auth', () => {
        it('should use cached token if not expired', async () => {
            const config: any = { dataSource: { config: { tenantId: mockTenantId } } };

            // 1. Initial call to set the cache
            await service.initialize(config);
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);

            // 2. Clear call history so we start from zero for the second call
            mockedAxios.post.mockClear();

            // 3. Second call should use cache and NOT call axios.post
            await service.initialize(config);
            expect(mockedAxios.post).toHaveBeenCalledTimes(0);
        });

        it('should refresh token if expired', async () => {
            const config: any = { dataSource: { config: { tenantId: mockTenantId } } };
            const now = 1700000000000;

            // Mock Date.now to control time
            const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

            await service.initialize(config);
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);

            // Fast forward time by 2 hours (well past 3600s expiry)
            dateSpy.mockReturnValue(now + 7200 * 1000);

            await service.initialize(config);

            // Should have been called twice in total
            expect(mockedAxios.post).toHaveBeenCalledTimes(2);
            dateSpy.mockRestore();
        });
    });

    describe('Delta Changes', () => {
        beforeEach(async () => {
            // Setup a ready client for these methods
            await (service as any).setupClient(mockTenantId);
        });

        it('should handle pagination and return delta link', async () => {
            mockAxiosInstance.get
                .mockResolvedValueOnce({
                    data: {
                        value: [{ id: 'item1' }],
                        '@odata.nextLink': '/next-page',
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        value: [{ id: 'item2' }],
                        '@odata.deltaLink': 'new-delta-link',
                    },
                });

            const result = await service.getDeltaChanges(undefined, 'drive', 'folder');
            expect(result.changes).toHaveLength(2);
            expect(result.newDeltaLink).toBe('new-delta-link');
            expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
        });

        it('should return null delta link on 410 Gone (expired)', async () => {
            mockAxiosInstance.get.mockRejectedValue({
                response: { status: 410 },
            });

            const result = await service.getDeltaChanges('expired-link', 'drive', 'folder');
            expect(result.newDeltaLink).toBeNull();
            expect(result.changes).toHaveLength(0);
        });

        it('should throw other errors during delta query', async () => {
            mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));
            await expect(service.getDeltaChanges(undefined, 'd', 'f')).rejects.toThrow(
                'Network error'
            );
        });
    });

    describe('Recursion Logic', () => {
        it('should skip files with non-allowed extensions', async () => {
            await (service as any).setupClient(mockTenantId);
            mockAxiosInstance.get.mockResolvedValue({
                data: {
                    value: [
                        { id: '1', name: 'data.txt' },
                        { id: '2', name: 'manual.pdf' },
                    ],
                },
            });

            const files = await service.getFilesRecursively('drive-id', 'root', ['.pdf']);
            expect(files).toHaveLength(1);
            expect(files[0].name).toBe('manual.pdf');
        });
    });

    describe('Encoding & Resolution', () => {
        it('should correctly encode sharepoint URLs', () => {
            const url = 'https://test.com/path';
            const encoded = (service as any).encodeSharepointUrl(url);
            expect(encoded).toContain('u!');
            expect(encoded).not.toContain('='); // Should remove padding
        });

        it('validateAndResolveFolder: should return uniqueId and canonicalUrl', async () => {
            await (service as any).setupClient(mockTenantId);
            mockAxiosInstance.get.mockResolvedValue({
                data: { id: 'unique-id', webUrl: 'canonical-url' },
            });

            const res = await service.validateAndResolveFolder('host', '/path');
            expect(res.uniqueId).toBe('unique-id');
        });

        it('validateAndResolveFolder: should throw ProcessingException on failure', async () => {
            await (service as any).setupClient(mockTenantId);
            mockAxiosInstance.get.mockRejectedValue({
                response: { data: { error: { message: 'Not Found' } } },
            });

            await expect(service.validateAndResolveFolder('host', '/path')).rejects.toThrow(
                ProcessingException
            );
        });
    });
});
