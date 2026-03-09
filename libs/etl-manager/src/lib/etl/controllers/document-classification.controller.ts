/* eslint-disable max-classes-per-file */

import { Controller, Post, Body, Param, HttpCode, HttpStatus, Logger } from '@nestjs/common';

import AllowControllerWithNoBearer from '../../app/common/allowControllerWithNoBearer';
import {
    DocumentClassifierService,
    ClassificationConfig,
    ClassificationResult,
} from '../services/document-classification.service';

/**
 * DTO for classification request with optional configuration
 */
class ClassifyFileDto {
    fileId: string;

    config?: ClassificationConfig;
}

/**
 * Controller for testing and manually triggering document classification.
 * These endpoints are for testing/admin purposes and should be secured appropriately.
 */
@Controller('etl/classification')
export class DocumentClassificationController {
    private readonly logger = new Logger(DocumentClassificationController.name);

    /**
     *
     * @param classifierService
     * @param logger
     */
    constructor(
        private readonly classifierService: DocumentClassifierService,) {}

    /**
     * Classify a single document by file ID.
     * The file must already have chunks created.
     * @param dto
     * @example
     * POST /etl/classification/classify
     * {
     *   "fileId": "507f1f77bcf86cd799439011",
     *   "config": {
     *     "headChunks": 5,
     *     "confidenceThreshold": 0.85
     *   }
     * }
     */
    @Post('classify')
    @HttpCode(HttpStatus.OK)
    @AllowControllerWithNoBearer()
    async classifyDocument(@Body() dto: ClassifyFileDto): Promise<ClassificationResult> {
        this.logger.log(`Classification request for file: ${dto.fileId}`);

        try {
            const result = await this.classifierService.classifyAndTagFile(dto.fileId, dto.config);

            this.logger.log(`Classification completed for file: ${dto.fileId}`, {
                category: result.category,
                confidence: result.confidence,
                needsReview: result.needsReview,
            });

            return result;
        } catch (error) {
            this.logger.error(`Classification failed for file: ${dto.fileId}`, error);
            throw error;
        }
    }

    /**
     * Classify a single document by file ID (path parameter version).
     * Useful for simple testing.
     * @param fileId
     * @example
     * POST /etl/classification/507f1f77bcf86cd799439011
     */
    @Post(':fileId')
    @HttpCode(HttpStatus.OK)
    async classifyDocumentByParam(@Param('fileId') fileId: string): Promise<ClassificationResult> {
        this.logger.log(`Classification request for file: ${fileId}`);
        return this.classifierService.classifyAndTagFile(fileId);
    }
}
