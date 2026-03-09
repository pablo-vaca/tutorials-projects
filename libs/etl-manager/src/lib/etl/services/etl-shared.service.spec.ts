/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import * as fs from 'fs';
import * as path from 'path';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import EtlSharedService from './etl-shared.service'; // Adjust path
import { ChunkingStrategy } from '../types/config-strategy.types';

// Mock fs to avoid actual file system interactions
jest.mock('fs');

describe('EtlSharedService', () => {
    let service: EtlSharedService;
    let configService: ConfigService;

    let mockLogger: {
        info: jest.Mock;
        debug: jest.Mock;
        error: jest.Mock;
        warn: jest.Mock;
        verbose: jest.Mock;
    };

    const mockPdfLocation = '/tmp/pdf-storage';

    beforeEach(async () => {
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            verbose: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EtlSharedService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string) => {
                            if (key === 'PDF_LOCATION') return mockPdfLocation;
                            return null;
                        }),
                    },
                },
                { provide: Logger, useValue: mockLogger },
            ],
        }).compile();

        service = module.get<EtlSharedService>(EtlSharedService);
        configService = module.get<ConfigService>(ConfigService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getLocation', () => {
        it('should return the location from config', () => {
            expect(service.getLocation()).toBe(mockPdfLocation);
        });

        it('should throw an error and log if PDF_LOCATION is missing', () => {
            jest.spyOn(configService, 'get').mockReturnValue(undefined);

            expect(() => service.getLocation()).toThrow(
                'PDF_LOCATION environment variable is not set.'
            );
        });
    });

    describe('getFolderFromMongoFileId_WithValidation', () => {
        it('should return resolved path if folder exists', () => {
            const mongoId = 'file123';
            const expectedPath = path.resolve(mockPdfLocation, mongoId);
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            const result = service.getFolderFromMongoFileId_WithValidation(mongoId);

            expect(result).toBe(expectedPath);
            expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
        });

        it('should throw error if folder does not exist', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            expect(() => service.getFolderFromMongoFileId_WithValidation('invalid')).toThrow();
        });
    });

    describe('resolveChunkSettings', () => {
        const mockFile = (strategy: ChunkingStrategy) => ({ processingStrategy: strategy }) as any;
        const mockConfig = {
            chunksConfig: { chunkSize: 500, overlap: 50 },
        } as any;

        it('should return fixed settings for PBP_SPLIT_FILE strategy', () => {
            const result = service.resolveChunkSettings(
                mockConfig,
                mockFile(ChunkingStrategy.PBP_SPLIT_FILE)
            );
            expect(result).toEqual({ chunkSize: 8000, overlap: 30 });
        });

        it('should return settings from config for BASE strategy', () => {
            const result = service.resolveChunkSettings(
                mockConfig,
                mockFile(ChunkingStrategy.BASE)
            );
            expect(result).toEqual({ chunkSize: 500, overlap: 50 });
        });

        it('should return null if config is invalid for BASE strategy', () => {
            const badConfig = { chunksConfig: {} } as any;
            const result = service.resolveChunkSettings(badConfig, mockFile(ChunkingStrategy.BASE));
            expect(result).toBeNull();
        });
    });

    describe('resolveEmbeddingSettings', () => {
        it('should return settings if config is valid', () => {
            const config = {
                embeddingsConfig: { deploymentId: 'dep-1', user: 'u1', model: 'm1' },
            } as any;
            expect(service.resolveEmbeddingSettings(config)).toEqual(config.embeddingsConfig);
        });

        it('should return null if any field is missing', () => {
            const incompleteConfig = {
                embeddingsConfig: { deploymentId: 'dep-1' }, // user and model missing
            } as any;
            expect(service.resolveEmbeddingSettings(incompleteConfig)).toBeNull();
        });
    });

    describe('getPageNumber', () => {
        it('should extract page number correctly from valid filename', () => {
            const result = service.getPageNumber('prefix-42.pdf', 'prefix', 'pdf');
            expect(result).toBe(42);
        });

        it('should return -1 if filename does not match pattern', () => {
            const result = service.getPageNumber('wrong-name.txt', 'prefix', 'pdf');
            expect(result).toBe(-1);
        });
    });
});
