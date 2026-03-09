import * as fs from 'fs';
import path from 'path';


import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChunkSettings, EmbeddingSettings, EtlConfigDocument, FileDocument } from '../schemas';
import { ChunkingStrategy } from '../types/config-strategy.types';

export enum EtlAnalyzeNextStep {
    DOWNLOAD = 'download',
    CHUNK = 'chunk',
    SKIP = 'skip',
}

export type EtlAnalyzeResponse = {
    mongoFileId: string;
    nextStep: EtlAnalyzeNextStep;
};

// etl flow orchestrator
@Injectable()
export default class EtlSharedService {
    private readonly logger = new Logger(EtlSharedService.name);

    /**
     *
     * @param configService
     * @param logger
     */
    constructor(
        private readonly configService: ConfigService,) {}

    /**
     *
     * @param {string} mongoFileId
     * @returns {string}
     */
    getFolderFromMongoFileId_WithValidation(mongoFileId: string): string {
        const location = this.getLocation();

        const folderPath = path.resolve(location, mongoFileId);
        if (!fs.existsSync(folderPath)) {
            const m = `"${mongoFileId}" folder not found`;
            this.logger.error(m);
            throw new Error(m);
        }
        return folderPath;
    }

    /**
     * @returns {string}
     */
    getLocation(): string {
        const location = this.configService.get<string>('PDF_LOCATION');

        if (!location) {
            const m = 'PDF_LOCATION environment variable is not set.';
            this.logger.error(m);
            throw new Error(m);
        }
        return location;
    }

    /**
     *
     * @param {sring} folder
     * @param {PdfFileDocument} pdfFile
     * @param filename
     * @returns {Promise<string>}
     */
    getFullfilename_WithValidation(folder: string, filename: string): string {
        const filenameFullpath = path.resolve(folder, filename);
        if (!fs.existsSync(filenameFullpath)) {
            const m = `"${filename}" file not found`;
            this.logger.error(m);
            throw new Error(m);
        }
        return filenameFullpath;
    }

    /**
     *
     * @param config
     * @param file
     */
    resolveChunkSettings(config: EtlConfigDocument, file: FileDocument): ChunkSettings | null {
        let chunkSettings = null;

        switch (file.processingStrategy) {
            // chunk per page using just a big chunkSize for page by page process
            case ChunkingStrategy.PBP_SPLIT_FILE:
                chunkSettings = {
                    chunkSize: 8000,
                    overlap: 30,
                };
                break;
            case ChunkingStrategy.BASE:
            default: {
                const primary = config.chunksConfig;
                if (
                    primary &&
                    typeof primary.chunkSize === 'number' &&
                    typeof primary.overlap === 'number'
                ) {
                    chunkSettings = {
                        chunkSize: primary.chunkSize,
                        overlap: primary.overlap,
                    };
                }
            }
        }

        this.logger.verbose(` > Chunk config loaded: ${file.processingStrategy}`);

        return chunkSettings;
    }

    /**
     *
     * @param config
     */
    resolveEmbeddingSettings(config: EtlConfigDocument): EmbeddingSettings | null {
        const primary = config.embeddingsConfig;
        if (
            primary &&
            typeof primary.deploymentId === 'string' &&
            typeof primary.user === 'string' &&
            typeof primary.model === 'string'
        ) {
            return {
                deploymentId: primary.deploymentId,
                user: primary.user,
                model: primary.model,
            };
        }

        return null;
    }

    /**
     *
     * @param fileName
     * @param prefix
     * @param extension
     */
    getPageNumber(fileName: string, prefix: string, extension: string): number {
        const regex = new RegExp(`^${prefix}-(\\d+)\\.${extension}$`);
        const match = fileName.match(regex);
        if (!match) {
            return -1;
        }
        return Number(match[1]);
    }
}
