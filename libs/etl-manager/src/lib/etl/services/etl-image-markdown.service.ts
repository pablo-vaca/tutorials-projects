/* eslint-disable max-lines-per-function */
import * as fs from 'fs';
import * as path from 'path';

import { Agent } from '@mastra/core/agent';

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'mime-types';

import { MastraService } from '../../mastra/mastra.service';
import { FileDocument } from '../schemas';
import EtlSharedService from './etl-shared.service';

const TEST_FORMAT_INSTRUCTIONS_AGENT = `
Your task is to convert the png file provide into a full complete markdown text.
- Do not miss anything.
- Do not invent anything.
- Just to generate a markdown well done. Take care with tables specially.
- To add the line number at the en of each line of the markdown separted by a | symbol, to use this format [#line <line number>].
- To include to page number provided.
`;

export interface ImageMarkdownData {
    sourceFile: string;
    content: string;
    pageNumber: number;
}

export interface MarkdownUploadData {
    sourceFile: string;
    content: string;
    pageNumber: number;
}

@Injectable()
export default class EtlImageMarkdownService implements OnModuleInit {
    private readonly logger = new Logger(EtlImageMarkdownService.name);

    private agent: Agent;

    /**
     *
     * @param {Logger} logger
     * @param {MastraService} mastraService
     * @param {EtlSharedService} etlSharedService
     * @param {ConfigService} configService
     */
    constructor(private readonly mastraService: MastraService,
        private readonly etlSharedService: EtlSharedService,
        private readonly configService: ConfigService
    ) {}

    /**
     *
     */
    async onModuleInit() {
        const etlModel = this.configService.get<string>('ETL_MODEL');

        const agentConfig = {
            name: 'basicAgent',
            instructions: TEST_FORMAT_INSTRUCTIONS_AGENT,
            model: this.mastraService.getMastraSupportedModel(etlModel),
        };

        this.agent = this.mastraService.createBasicAgent(agentConfig);
    }

    /**
     *
     * @param {FileDocument} mongoFile
     * @param {string} pageFile
     * @returns {Promise<string>}
     */
    async convertImageFileToMarkdownFromFileDocument(
        mongoFile: FileDocument,
        pageFile: string
    ): Promise<string> {
        this.logger.log(`[MARKDOWN CREATOR] - page: ${pageFile} start`);
        const folderPath = this.etlSharedService.getFolderFromMongoFileId_WithValidation(
            mongoFile.id
        );

        const sourceFile = this.etlSharedService.getFullfilename_WithValidation(
            folderPath,
            pageFile
        );

        const markdownFolder = path.resolve(folderPath, 'markdown');
        if (!fs.existsSync(markdownFolder)) {
            fs.mkdirSync(markdownFolder);
        }

        const markdownFile = path.join(markdownFolder, `${path.parse(sourceFile).name}.md`);
        if (fs.existsSync(markdownFile)) {
            fs.rmSync(markdownFile);
        }

        const base64Content = fs.readFileSync(sourceFile, {
            encoding: 'base64',
        });

        const pageNumber = this.etlSharedService.getPageNumber(
            `${path.parse(sourceFile).name}.md`,
            'pages',
            'md'
        );
        const options: {
            modelSettings?: {
                temperature: number;
            };
        } = {};
        if (this.configService.get<boolean>('ETL_IS_MODEL_5')) {
            options.modelSettings = {
                temperature: 1,
            };
        }

        const response = await this.agent.generate(
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `This is a text to convert. To insert the label [Page#: ${pageNumber}] into the first line and a breakline`,
                    },
                    {
                        type: 'image',
                        image: `data:image/png;base64,${base64Content}`,
                        mimeType: lookup(sourceFile),
                    },
                ],
            },
            options
        );
        fs.writeFileSync(markdownFile, response.text);
        this.logger.log(`[MARKDOWN CREATOR] - page: ${pageFile} end`);
        return path.join('markdown', path.parse(markdownFile).base);
    }

    /**
     *
     * @param {FileDocument} mongoFile
     * @param {string} pageFile
     * @returns {Promise<string>}
     */
    async getImageToConvertData(
        mongoFile: FileDocument,
        pageFile: string
    ): Promise<ImageMarkdownData> {
        this.logger.verbose(`[IMAGE MARKDOWN DATA] - page: ${pageFile} start`);
        const folderPath = this.etlSharedService.getFolderFromMongoFileId_WithValidation(
            mongoFile.id
        );

        const sourceFile = this.etlSharedService.getFullfilename_WithValidation(
            folderPath,
            pageFile
        );

        const base64Content = fs.readFileSync(sourceFile, {
            encoding: 'base64',
        });

        const pageNumber = this.etlSharedService.getPageNumber(
            `${path.parse(sourceFile).name}.md`,
            'pages',
            'md'
        );

        return { sourceFile, content: base64Content, pageNumber };
    }

    /**
     *
     * @param {FileDocument} mongoFile
     * @param {string} pageFile
     * @param data
     * @returns {Promise<string>}
     */
    async convertImageContentToMarkdown(data: ImageMarkdownData): Promise<string> {
        this.logger.debug(`[MARKDOWN GENERATOR] - page: ${data.sourceFile} start`);

        const options: {
            modelSettings?: {
                temperature: number;
            };
        } = {};
        if (this.configService.get<boolean>('ETL_IS_MODEL_5')) {
            options.modelSettings = {
                temperature: 1,
            };
        }

        const response = await this.agent.generate(
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `This is a text to convert. To insert the label [Page#: ${data.pageNumber}] into the first line and a breakline`,
                    },
                    {
                        type: 'image',
                        image: `data:image/png;base64,${data.content}`,
                        mimeType: lookup(data.sourceFile),
                    },
                ],
            },
            options
        );

        this.logger.debug(`[MARKDOWN GENERATOR] - page: ${data.sourceFile} end`);
        return response.text;
    }
}
