/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

// Adjust path
import AuthApiService from '../../auth/auth-api.service';
import { ExternalApiException, ProcessingException } from '../exceptions';
import EmbeddingsClient from './embeddings-client';

describe('EmbeddingsClient', () => {
    let service: EmbeddingsClient;
    let configService: ConfigService;
    let authApiService: AuthApiService;
    let logger: Logger;

    const mockAxiosRef = {
        post: jest.fn(),
    };

    const mockConfig = {
        CORE_API_URL: 'https://api.test.com',
        X_API_KEY: 'test-api-key',
        EMBEDDING_BATCH_SIZE: '5',
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmbeddingsClient,
                {
                    provide: HttpService,
                    useValue: { axiosRef: mockAxiosRef },
                },
                {
                    provide: ConfigService,
                    useValue: { get: jest.fn((key: string) => mockConfig[key]) },
                },
                {
                    provide: AuthApiService,
                    useValue: { getMachineToken: jest.fn().mockResolvedValue('mock-token') },
                },
                {
                    provide: Logger,
                    useValue: { error: jest.fn() },
                },
            ],
        }).compile();

        service = module.get<EmbeddingsClient>(EmbeddingsClient);
        configService = module.get<ConfigService>(ConfigService);
        authApiService = module.get<AuthApiService>(AuthApiService);
        logger = module.get<Logger>(Logger);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createEmbeddings', () => {
        const inputs = ['text1', 'text2'];
        const deploymentId = 'deploy-123';
        const user = 'test-user';
        const model = 'text-embedding-ada-002';

        it('should successfully create embeddings and return an array of number arrays', async () => {
            const mockApiResponse = {
                data: {
                    data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
                },
            };
            mockAxiosRef.post.mockResolvedValueOnce(mockApiResponse);

            const result = await service.createEmbeddings(inputs, deploymentId, user, model);

            expect(mockAxiosRef.post).toHaveBeenCalledWith(
                `https://api.test.com/llm/embeddings/v1/${deploymentId}`,
                expect.objectContaining({
                    input: inputs,
                    user,
                    model,
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer mock-token',
                        'x-api-key': 'test-api-key',
                    }),
                })
            );
            expect(result).toEqual([
                [0.1, 0.2],
                [0.3, 0.4],
            ]);
        });

        it('should throw ProcessingException if input length exceeds batch size', async () => {
            const largeInput = ['1', '2', '3', '4', '5', '6']; // Batch size is 5 in mockConfig

            await expect(
                service.createEmbeddings(largeInput, deploymentId, user, model)
            ).rejects.toThrow(ProcessingException);

            expect(mockAxiosRef.post).not.toHaveBeenCalled();
        });

        it('should use provided accessToken instead of fetching a machine token', async () => {
            const customToken = 'provided-token';
            mockAxiosRef.post.mockResolvedValueOnce({ data: { data: [] } });

            await service.createEmbeddings(inputs, deploymentId, user, model, customToken);

            expect(authApiService.getMachineToken).not.toHaveBeenCalled();
            expect(mockAxiosRef.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${customToken}`,
                    }),
                })
            );
        });

        it('should throw ExternalApiException and log error when the API call fails', async () => {
            const errorResponse = {
                message: 'Request failed',
                response: { status: 401, data: 'Unauthorized' },
            };
            mockAxiosRef.post.mockRejectedValueOnce(errorResponse);

            await expect(
                service.createEmbeddings(inputs, deploymentId, user, model)
            ).rejects.toThrow(ExternalApiException);

            expect(logger.error).toHaveBeenCalled();
        });

        it('should default batch size to 100 if config returns undefined', async () => {
            // Temporarily override config mock for this test
            jest.spyOn(configService, 'get').mockImplementation((key) => {
                if (key === 'EMBEDDING_BATCH_SIZE') return undefined;
                return mockConfig[key];
            });

            const input99 = Array(99).fill('test');
            mockAxiosRef.post.mockResolvedValueOnce({ data: { data: [] } });

            await expect(
                service.createEmbeddings(input99, deploymentId, user, model)
            ).resolves.toBeDefined();
        });
    });
});
