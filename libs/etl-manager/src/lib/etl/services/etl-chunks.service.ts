import { MDocument } from '@mastra/rag';

import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';

import { ExternalApiException, ProcessingException } from '../exceptions';
import { FileDocument, ChunkMetadata, Chunk, ChunkDocument } from '../schemas';
import ChunkMongoService from './chunk-mongo.service';
import DocumentProcessingClient from './document-processing-client';
import { MarkdownUploadData } from './etl-image-markdown.service';

/**
 * Configuration for chunk processing strategy
 */
export interface ChunkProcessorConfig {
    chunkSize: number;
    overlap: number;
    projectId: string;
    dataScope: string;
}

/**
 * Strategy service for processing file chunks.
 * Encapsulates all chunk creation and storage logic through a strategy pattern.
 */
@Injectable()
export default class ChunkProcessorService {
    private readonly logger = new Logger(ChunkProcessorService.name);

    /**
     * @param {import('./document-processing-client').default} documentProcessingService Document processing API client
     * @param {import('./chunk-mongo.service').default} chunkMongoService MongoDB chunk storage service
     * @param {import('@nestjs/common').Logger} logger Logger instance
     */
    constructor(
        private readonly documentProcessingService: DocumentProcessingClient,
        private readonly chunkMongoService: ChunkMongoService,) {}

    /**
     * Processes file chunks end-to-end: retrieves from API and stores in MongoDB
     * @param {import('../schemas').FileDocument} file The file document to process
     * @param {object} config Chunk processing configuration
     * @param {number} config.chunkSize Size of each chunk
     * @param {number} config.overlap Overlap between chunks
     * @param {string} config.projectId Project identifier
     * @param {string} config.dataScope Data scope identifier
     * @param {string} accessToken Authentication token for API access
     * @returns {Promise<string[]>} Array of created chunk IDs
     */
    async processChunks(
        file: FileDocument,
        config: ChunkProcessorConfig,
        accessToken?: string
    ): Promise<ChunkDocument[]> {
        this.logger.debug(
            `Processing chunks for file ${file.id} with config: ` +
                `chunkSize=${config.chunkSize}, overlap=${config.overlap}`
        );

        // Validate configuration
        ChunkProcessorService.validateConfig(config);

        // Retrieve chunks from document processing service
        const chunks = await this.documentProcessingService.getChunks(
            file.remoteId,
            config.chunkSize,
            config.overlap,
            accessToken
        );

        this.logger.debug(`Retrieved ${chunks.length} chunks for file ${file.id}`);

        // Transform and validate chunks
        const chunkData = ChunkProcessorService.transformChunks(file, chunks, config);

        // Batch insert into MongoDB
        const insertedChunks = await this.chunkMongoService.createChunks(chunkData);

        const chunkIds = insertedChunks.map((chunk) => chunk.id);
        this.logger.debug(`Successfully created ${chunkIds.length} chunks in database`);

        return insertedChunks;
    }

    /**
     * Validates chunk processing configuration
     * @param {object} config Configuration to validate
     * @param {number} config.chunkSize Size of each chunk
     * @param {number} config.overlap Overlap between chunks
     * @param {string} config.projectId Project identifier
     * @param {string} config.dataScope Data scope identifier
     * @returns {void}
     */
    static validateConfig(config: ChunkProcessorConfig): void {
        if (config.chunkSize <= 0) {
            throw new ProcessingException('chunkSize must be greater than 0');
        }

        if (config.overlap < 0) {
            throw new ProcessingException('overlap cannot be negative');
        }

        if (config.overlap >= config.chunkSize / 3) {
            throw new ProcessingException('overlap must be less than one third of chunkSize');
        }

        if (!config.projectId) {
            throw new ProcessingException('projectId is required');
        }

        if (!config.dataScope) {
            throw new ProcessingException('dataScope is required');
        }
    }

    /**
     * Transforms chunk content into chunk documents for storage
     * @param {import('../schemas').FileDocument} file The source file document
     * @param {string[]} chunks Array of chunk content strings
     * @param {object} config Chunk processing configuration
     * @param {number} config.chunkSize Size of each chunk
     * @param {number} config.overlap Overlap between chunks
     * @param {string} config.projectId Project identifier
     * @param {string} config.dataScope Data scope identifier
     * @returns {Array<Partial<import('../schemas').Chunk>>} Array of chunk data ready for MongoDB insertion
     */
    static transformChunks(
        file: FileDocument,
        chunks: string[],
        config: ChunkProcessorConfig
    ): Array<Partial<Chunk>> {
        const metadata: ChunkMetadata = {
            projectId: config.projectId,
            dataScope: config.dataScope,
            source: {
                title: file.sourceData.title,
                link: file.sourceData.link,
            },
            chunkSize: config.chunkSize,
            overlap: config.overlap,
            fileId: file.id,
        };

        return chunks.map((content, index) => ({
            fileId: new Types.ObjectId(file.id),
            content,
            chunkIndex: index,
            metadata,
        }));
    }

    /**
     *
     * @param fileId
     * @param fileRemoteId
     * @param etlFile
     * @param config
     * @param pageNumber
     * @param accessToken
     */
    async processMarkdownChunks(
        etlFile: FileDocument,
        config: ChunkProcessorConfig,
        pageNumber: number,
        accessToken?: string
    ): Promise<ChunkDocument[]> {
        this.logger.debug(
            `Processing chunks for file ${etlFile.id} with config: ` +
                `chunkSize=${config.chunkSize}, overlap=${config.overlap}`
        );

        // Validate configuration
        ChunkProcessorService.validateConfig(config);

        // Retrieve chunks from document processing service
        const chunks = await this.documentProcessingService.getChunks(
            etlFile.remoteId,
            config.chunkSize,
            config.overlap,
            accessToken
        );

        this.logger.debug(`Retrieved ${chunks.length} chunks for file ${etlFile.id}`);

        // Transform and validate chunks
        const chunkData = ChunkProcessorService.transformMarkdownChunks(
            etlFile,
            chunks,
            config,
            pageNumber
        );

        // Batch insert into MongoDB
        const insertedChunks = await this.chunkMongoService.createChunks(chunkData);

        const chunkIds = insertedChunks.map((chunk) => chunk.id);
        this.logger.debug(`Successfully created ${chunkIds.length} chunks in database`);

        return insertedChunks;
    }

    /**
     *
     * @param etlFile
     * @param config
     * @param data
     * @param accessToken
     */
    async processNewMarkdownChunks(
        etlFile: FileDocument,
        config: ChunkProcessorConfig,
        data: MarkdownUploadData,
        accessToken?: string
    ): Promise<ChunkDocument[]> {
        this.logger.debug(
            `Processing chunks for file ${etlFile.id} with config: ` +
                `chunkSize=${config.chunkSize}, overlap=${config.overlap}`
        );

        // Validate configuration
        ChunkProcessorService.validateConfig(config);

        // Retrieve chunks from document processing service
        const chunks = await this.documentProcessingService.getNewChunks(
            etlFile.remoteId,
            config.chunkSize,
            config.overlap,
            data,
            accessToken
        );

        this.logger.debug(`Retrieved ${chunks.length} chunks for file ${etlFile.id}`);

        // Transform and validate chunks
        const chunkData = ChunkProcessorService.transformMarkdownChunks(
            etlFile,
            chunks,
            config,
            data.pageNumber
        );

        // Batch insert into MongoDB
        const insertedChunks = await this.chunkMongoService.createChunks(chunkData);

        const chunkIds = insertedChunks.map((chunk) => chunk.id);
        this.logger.debug(`Successfully created ${chunkIds.length} chunks in database`);

        return insertedChunks;
    }

    /**
     *
     * @param etlFile
     * @param config
     * @param data
     */
    async processChunksMarkdownLocally(
        etlFile: FileDocument,
        config: ChunkProcessorConfig,
        data: MarkdownUploadData
    ): Promise<ChunkDocument[]> {
        this.logger.debug(
            `Processing chunks for file ${etlFile.id} with config: ` +
                `chunkSize=${config.chunkSize}, overlap=${config.overlap}`
        );

        // Validate configuration
        ChunkProcessorService.validateConfig(config);

        // generate chunks
        const chunksData = await this.getChunksData(config.chunkSize, config.overlap, data.content);
        const chunks = chunksData.map((item) => item.text);

        this.logger.debug(`Retrieved ${chunks.length} chunks for file ${etlFile.id}`);

        // Transform and validate chunks
        const chunkData = ChunkProcessorService.transformMarkdownChunks(
            etlFile,
            chunks,
            config,
            data.pageNumber
        );

        // Batch insert into MongoDB
        const insertedChunks = await this.chunkMongoService.createChunks(chunkData);

        const chunkIds = insertedChunks.map((chunk) => chunk.id);
        this.logger.debug(`Successfully created ${chunkIds.length} chunks in database`);

        return insertedChunks;
    }

    /**
     *
     * @param fileId
     * @param fileRemoteId
     * @param etlFile
     * @param chunks
     * @param config
     * @param pageNumber
     */
    static transformMarkdownChunks(
        etlFile: FileDocument,
        chunks: string[],
        config: ChunkProcessorConfig,
        pageNumber: number
    ): Array<Partial<Chunk>> {
        const metadata: ChunkMetadata = {
            projectId: config.projectId,
            dataScope: config.dataScope,
            source: {
                title: etlFile.sourceData.title,
                link: etlFile.sourceData.link,
            },
            chunkSize: config.chunkSize,
            overlap: config.overlap,
            fileId: etlFile.id,
            pageNumber,
        };

        return chunks.map((content, index) => ({
            fileId: new Types.ObjectId(etlFile.id),
            content,
            chunkIndex: index,
            metadata,
        }));
    }

    /**
     *
     * @param chunkSize
     * @param overlap
     * @param markdownContent
     */
    async getChunksData(chunkSize: number, overlap: number, markdownContent: string) {
        try {
            const docFromMarkdown = MDocument.fromMarkdown(markdownContent);
            const chunks = await docFromMarkdown.chunk({
                strategy: 'recursive',
                maxSize: chunkSize,
                overlap,
            });
            return chunks;
        } catch (error) {
            this.logger.error('Get chunks failed:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });
            throw new ExternalApiException(
                `Failed to get chunks: ${error.message}`,
                error.response?.status
            );
        }
    }
}
