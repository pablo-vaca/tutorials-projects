/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import * as fs from 'fs';
import * as path from 'path';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import EtlImageMarkdownService from './etl-image-markdown.service';
import EtlSharedService from './etl-shared.service';
import { MastraService } from '../../mastra/mastra.service';

// Mock fs module
jest.mock('fs');

describe('EtlImageMarkdownService', () => {
    let service: EtlImageMarkdownService;
    let mastraService: jest.Mocked<MastraService>;
    let etlSharedService: jest.Mocked<EtlSharedService>;

    // Mock Agent object
    const mockAgent = {
        generate: jest.fn(),
    };

    const mockMongoFile = { id: 'file-123' } as any;
    const mockPageFile = 'page1.png';
    const mockFolderPath = '/tmp/project/file-123';
    const mockSourceFile = '/tmp/project/file-123/page1.png';

    beforeEach(async () => {
        const mockMastraService = {
            createBasicAgent: jest.fn().mockReturnValue(mockAgent),
            getMastraSupportedModel: jest.fn(),
        };
        const mockEtlSharedService = {
            getFolderFromMongoFileId_WithValidation: jest.fn(),
            getFullfilename_WithValidation: jest.fn(),
            getPageNumber: jest.fn(),
        };
        const mockLogger = { info: jest.fn(), debug: jest.fn() };
        const mockConfigService = { get: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EtlImageMarkdownService,
                { provide: MastraService, useValue: mockMastraService },
                { provide: EtlSharedService, useValue: mockEtlSharedService },
                { provide: Logger, useValue: mockLogger },
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<EtlImageMarkdownService>(EtlImageMarkdownService);
        mastraService = module.get(MastraService);
        etlSharedService = module.get(EtlSharedService);

        // Manually trigger initialization to set up the agent
        await service.onModuleInit();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('onModuleInit', () => {
        it('should initialize the agent with correct instructions', () => {
            expect(mastraService.createBasicAgent).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'basicAgent',
                    instructions: expect.stringContaining('convert the png file'),
                })
            );
        });
    });

    describe('convertImageFileToMarkdownFromFileDocument', () => {
        it('should process image and return markdown path', async () => {
            // 1. Setup Shared Service Mocks
            etlSharedService.getFolderFromMongoFileId_WithValidation.mockReturnValue(
                mockFolderPath
            );
            etlSharedService.getFullfilename_WithValidation.mockReturnValue(mockSourceFile);
            etlSharedService.getPageNumber.mockReturnValue(1);

            // 2. Setup fs Mocks
            (fs.existsSync as jest.Mock).mockReturnValue(false); // markdown folder doesn't exist
            (fs.readFileSync as jest.Mock).mockReturnValue('base64-dummy-data');

            // 3. Setup Agent Mock
            mockAgent.generate.mockResolvedValue({ text: '# Mocked Markdown Content' });

            // Execute
            const result = await service.convertImageFileToMarkdownFromFileDocument(
                mockMongoFile,
                mockPageFile
            );

            // Assertions
            expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('markdown'));
            expect(fs.readFileSync).toHaveBeenCalledWith(mockSourceFile, { encoding: 'base64' });

            expect(mockAgent.generate).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.arrayContaining([
                        expect.objectContaining({ text: expect.stringContaining('[Page#: 1]') }),
                        expect.objectContaining({ type: 'image' }),
                    ]),
                }),
                expect.anything()
            );

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('page1.md'),
                '# Mocked Markdown Content'
            );

            expect(result).toBe(path.join('markdown', 'page1.md'));
        });

        it('should delete existing markdown file if it exists', async () => {
            etlSharedService.getFolderFromMongoFileId_WithValidation.mockReturnValue(
                mockFolderPath
            );
            etlSharedService.getFullfilename_WithValidation.mockReturnValue(mockSourceFile);

            // Mock that the markdown file already exists
            // eslint-disable-next-line @typescript-eslint/no-shadow
            (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
                if (path.endsWith('.md')) return true;
                return true; // folder exists too
            });

            mockAgent.generate.mockResolvedValue({ text: 'content' });

            await service.convertImageFileToMarkdownFromFileDocument(mockMongoFile, mockPageFile);

            expect(fs.rmSync).toHaveBeenCalled();
        });
    });
});
