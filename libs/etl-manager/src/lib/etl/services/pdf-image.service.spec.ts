/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import * as fs from 'fs';

import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Poppler } from 'node-poppler';
import sharp from 'sharp';

import EtlSharedService from './etl-shared.service';
import PdfImagesService from './pdf-images.service';
import { FeatureFlagService } from '../../feature-flag/feature-flag.service';

// Mock the external dependencies
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    rmSync: jest.fn(),
    promises: {
        writeFile: jest.fn(),
        readdir: jest.fn(),
    },
}));

jest.mock('node-poppler');
jest.mock('sharp');

describe('PdfImagesService', () => {
    let service: PdfImagesService;
    let logger: Logger;

    const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
    };

    const mockEtlSharedService = {
        getLocation: jest.fn().mockReturnValue('/base/path'),
        getFolderFromMongoFileId_WithValidation: jest.fn().mockReturnValue('/base/path/folder123'),
        getFullfilename_WithValidation: jest.fn().mockReturnValue('/base/path/folder123/test.pdf'),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PdfImagesService,
                { provide: Logger, useValue: mockLogger },
                { provide: EtlSharedService, useValue: mockEtlSharedService },
                {
                    provide: FeatureFlagService,
                    useValue: {
                        isActive: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<PdfImagesService>(PdfImagesService);
        logger = module.get<Logger>(Logger);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('storeFile', () => {
        it('should sanitize filename and write file to disk', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            const filename = 'My Test File @ 2024.pdf';
            const fileData = Buffer.from('test data');

            const result = await service.storeFile(filename, 'folder123', fileData);

            // Verify filename sanitization (My-Test-File-2024.pdf)
            expect(result).toContain('my-test-file-2024.pdf');
            expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
            expect(fs.promises.writeFile).toHaveBeenCalledWith(result, fileData);
            expect(logger.info).toHaveBeenCalled();
        });
    });

    describe('splitFileIntoPagesFromFileDocument', () => {
        it('should split PDF into pages and optimize them', async () => {
            const mockFileDoc = { id: 'mongo-id', storageFilename: 'test.pdf' } as any;

            // Mock FS behaviors
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.promises.readdir as jest.Mock)
                .mockResolvedValueOnce(['pages-1.png', 'pages-2.png']) // For pages folder
                .mockResolvedValueOnce(['pages-1.png', 'pages-2.png']); // For optimized folder

            // Mock Poppler
            const mockPdfToCairo = jest.fn().mockResolvedValue('success');
            (Poppler as jest.Mock).mockImplementation(() => ({
                pdfToCairo: mockPdfToCairo,
            }));

            // Mock Sharp chaining
            const mockSharpChain = {
                png: jest.fn().mockReturnThis(),
                toFile: jest.fn().mockResolvedValue(true),
            };
            (sharp as unknown as jest.Mock).mockReturnValue(mockSharpChain);

            const result = await service.splitFileIntoPagesFromFileDocument(mockFileDoc);

            const normalizedResult = result.map((path) => path.replace(/\\/g, '/'));

            // Assertions
            expect(fs.rmSync).toHaveBeenCalledTimes(2); // Clears pages and optimized folders
            expect(mockPdfToCairo).toHaveBeenCalledWith(
                expect.stringContaining('test.pdf'),
                expect.stringContaining('pages/pages'),
                { pngFile: true }
            );
            expect(mockSharpChain.png).toHaveBeenCalledWith({ compressionLevel: 9, palette: true });
            expect(mockSharpChain.toFile).toHaveBeenCalledTimes(2); // One per "page"
            expect(normalizedResult).toEqual(['optimized/pages-1.png', 'optimized/pages-2.png']);
        });
    });

    describe('sanitizeFilename', () => {
        it('should handle special characters and casing', () => {
            // Accessing private method for granular testing
            const result = (service as any).sanitizeFilename('!@#Upper Case_File.PDF');
            expect(result).toBe('upper-case-file.pdf');
        });
    });
});
