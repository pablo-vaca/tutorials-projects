
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ProcessingException } from '../exceptions';
import { ChunkDocument, EmbeddingSettings } from '../schemas';
import ChunkMongoService from './chunk-mongo.service';
import EmbeddingsService from './embeddings-client';

/**
 * Strategy service for generating and storing embeddings.
 * Encapsulates all embedding creation and storage logic through a strategy pattern.
 */
@Injectable()
export default class EtlEmbeddingProcessorService {
    private readonly logger = new Logger(EtlEmbeddingProcessorService.name);

    /**
     * @param {import('./embeddings-client').default} embeddingsService Embeddings API client
     * @param {import('./chunk-mongo.service').default} chunkMongoService MongoDB chunk storage service
     * @param {import('@nestjs/config').ConfigService} configService Configuration service
     * @param {import('@nestjs/common').Logger} logger Logger instance
     */
    constructor(
        private readonly embeddingsService: EmbeddingsService,
        private readonly chunkMongoService: ChunkMongoService,
        private readonly configService: ConfigService,) {}

    /**
     * Processes embeddings end-to-end: generates embeddings for chunks and stores them in MongoDB
     * @param {import('../schemas').ChunkDocument[]} chunks The chunk documents to generate embeddings for
     * @param {object} config Embedding generation configuration
     * @returns {Promise<void>}
     */
    async processEmbeddings(chunks: ChunkDocument[], config: EmbeddingSettings): Promise<void> {
        this.logger.debug(
            `Processing embeddings for ${chunks.length} chunks with config: ` +
                `model=${config.model}, deploymentId=${config.deploymentId}`
        );

        // Validate configuration
        EtlEmbeddingProcessorService.validateConfig(config);

        if (chunks.length === 0) {
            this.logger.debug('No chunks to process for embeddings');
            return;
        }

        // Extract chunk content
        const chunkContents = chunks.map((chunk) => chunk.content);

        // Determine batch size
        const batchSize =
            parseInt(this.configService.get<string>('EMBEDDING_BATCH_SIZE'), 10) || 100;

        const embeddingPromises = [];
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunkContents.slice(i, i + batchSize);
            embeddingPromises.push(
                this.embeddingsService.createEmbeddings(
                    batch,
                    config.deploymentId,
                    config.user,
                    config.model
                )
            );
            this.logger.verbose(
                ` > > Queued batch ${Math.floor(i / batchSize) + 1}: ${batch.length} inputs`
            );
        }

        const allEmbeddings = (await Promise.all(embeddingPromises)).flat();

        this.logger.verbose(`Created ${allEmbeddings.length} embeddings`);

        if (chunks.length !== allEmbeddings.length) {
            throw new ProcessingException(
                `Mismatch: ${chunks.length} chunks but ${allEmbeddings.length} embeddings`
            );
        }

        // Update chunks with embeddings
        await this.updateChunksWithEmbeddings(chunks, allEmbeddings);

        this.logger.debug(`Successfully updated ${chunks.length} chunks with embeddings`);
    }

    /**
     * Validates embedding processor configuration
     * @param {object} config Configuration to validate
     * @param {string} config.deploymentId Deployment identifier
     * @param {string} config.user User identifier
     * @param {string} config.model Model identifier
     * @returns {void}
     */
    static validateConfig(config: EmbeddingSettings): void {
        if (!config.deploymentId) {
            throw new ProcessingException('deploymentId is required');
        }

        if (!config.user) {
            throw new ProcessingException('user is required');
        }

        if (!config.model) {
            throw new ProcessingException('model is required');
        }
    }

    /**
     * Updates chunks with their corresponding embeddings
     * @param {import('../schemas').ChunkDocument[]} chunks The chunk documents to update
     * @param {number[][]} embeddings Array of embedding vectors
     * @returns {Promise<void>}
     */
    private async updateChunksWithEmbeddings(
        chunks: ChunkDocument[],
        embeddings: number[][]
    ): Promise<void> {
        const updatePromises = chunks.map((chunk, index) =>
            this.chunkMongoService.updateEmbedding(chunk.id, embeddings[index])
        );

        await Promise.all(updatePromises);
    }
}
