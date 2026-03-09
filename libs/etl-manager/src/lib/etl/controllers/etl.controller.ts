import { Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    HttpException,
    Param,
    Post,
    Query,
    Req,
    UseInterceptors,
    UsePipes,
    ValidationPipe, Logger } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { SiemEvent } from '../../app/common/siem/siem-event.decorator';
import { CreateFileEmbeddingsDto, CreateEtlConfigDto } from '../dtos';
import { ValidationException } from '../exceptions';
import { DataSourceType, SharePointConfigEntity } from '../schemas';
import DocumentProcessingClient from '../services/document-processing-client';
import EtlConfigService from '../services/etl-config.service';
import EtlService from '../services/etl.service';
import FileService from '../services/file.service';
import SharepointService from '../services/sharepoint.service';

@Controller('etl')
@ApiTags('ETL')
@ApiBearerAuth('access-token')
@UseInterceptors(ClassSerializerInterceptor)
export default class EtlController {
    /**
     * @param {DocumentProcessingClient} documentProcessingService - The document processing service instance
     * @param {FileService} fileService - The file service instance
     * @param {EtlConfigService} etlConfigService - The vectorstore config service instance
     * @param {SharepointService} sharepointService - The SharePoint service instance
     * @param {EtlService} etlService - The ETL service instance
     */
    constructor(
        private readonly documentProcessingService: DocumentProcessingClient,
        private readonly fileService: FileService,
        private readonly etlConfigService: EtlConfigService,
        private readonly sharepointService: SharepointService,
        private readonly etlService: EtlService
    ) {}

    /**
     * Creates chunks from an uploaded file.
     * @param {string} fileId - The MongoDB ID of the file
     * @param {Request} request - The Express request object
     * @param {CreateFileEmbeddingsDto} body - Request body with processing parameters
     * @returns {Promise<{message: string}>} Success message
     */
    @Post('files/:fileId/chunks')
    @UsePipes(ValidationPipe)
    async createChunks(
        @Param('fileId') fileId: string,
        @Req() request: Request,
        @Body() body: CreateFileEmbeddingsDto
    ) {
        // Validate fileId format
        if (!fileId || fileId.length !== 24) {
            throw new ValidationException('Invalid fileId');
        }

        // Validate overlap constraint (can't be done with class-validator easily)
        if (body.overlap >= body.chunkSize / 3) {
            throw new ValidationException('overlap must be less than one third of chunkSize');
        }

        try {
            const token = EtlController.getTokenFromHeader(request.headers);

            const file = (await this.fileService.findById(fileId)).toObject();
            // TODO: update file status if 404 (expired) returned in getChunks

            return await this.documentProcessingService.getChunks(
                file.remoteId,
                body.chunkSize,
                body.overlap,
                token
            );
        } catch (error) {
            const status = error.response?.status || error.status || 500;
            throw new HttpException(error.message || 'Processing failed', status);
        }
    }

    /**
     * Creates a new vectorstore configuration.
     * @param {CreateEtlConfigDto} body - Request body with vectorstore configuration
     * @returns {Promise<{configId: string, message: string}>} The created configuration ID and success message
     */
    @Post('configs')
    @UsePipes(ValidationPipe)
    @SiemEvent('APPLICATION_CONFIGURATION_CHANGE')
    async createConfig(@Body() body: CreateEtlConfigDto) {
        try {
            // 1. Map the flat DTO to the new nested DataSource structure

            const driveItem = await this.sharepointService.getDriveItemFromUrl(body.sharepointUrl);
            const { driveId } = driveItem.parentReference;

            const dataSource = {
                type: DataSourceType.SharePoint,
                config: {
                    url: body.sharepointUrl,
                    tenantId: body.sharepointTennantId,
                    folderId: body.sharepointFolder,
                    driveId: driveId || process.env.SHAREPOINT_DEFAULT_DRIVE_ID,
                } as SharePointConfigEntity,
            };

            // 2. Call the create service with the new schema
            const config = await this.etlConfigService.create({
                projectId: body.projectId,
                projectName: body.projectName,
                dataScope: body.dataScope,
                dataSource,
                chunksConfig: body.chunksConfig,
                embeddingsConfig: body.embeddingsConfig,
                status: 'active',
                webhookConfigured: false,
                history: [{ action: 'config_created', timestamp: new Date() }],
            });

            return {
                configId: config.id,
                message: 'Vectorstore configuration created successfully',
            };
        } catch (error) {
            const status = error.response?.status || error.status || 500;
            throw new HttpException(
                error.message || 'Failed to create vectorstore configuration',
                status
            );
        }
    }

    /**
     *
     * @param configId
     * @param correlationId
     */
    @Delete('/configs/:configId/:correlationId')
    @SiemEvent('APPLICATION_CONFIGURATION_CHANGE')
    async deleteConfig(@Param('configId') configId: string, correlationId: string) {
        const job = await this.etlService.projectCleanup(configId, correlationId, 'DELETE');
        return { message: 'Vectorstore clear and delete job queued', job };
    }

    /**
     *
     * @param body
     */
    @Post('/new-project-sync')
    async testNewProject(@Body() body: any) {
        const some = await this.etlService.createEtlProcessForProject(
            body.projectId,
            body.projectName,
            body.sharepointUrl,
            body.dataScope
        );
        return { response: some };
    }

    /**
     * Extracts the Bearer token from request headers
     * @param headers - The request headers containing authorization
     * @param headers.authorization
     * @returns {string} The extracted token
     */
    private static getTokenFromHeader(headers: { authorization?: string }): string {
        const authHeader = headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new HttpException('Missing or invalid Authorization header', 401);
        }
        return authHeader.replace('Bearer ', '');
    }

    /**
     *
     * @param projectId
     * @param correlationId
     */
    @Post('/clear-project-data')
    async projectDataCleanup(
        @Query('projectId') projectId: string,
        @Query('correlationId') correlationId: string
    ) {
        const job = await this.etlService.projectCleanup(projectId, correlationId, 'RESYNC');
        return {
            message: 'RESYNC Cleanup queued',
            projectId,
            correlationId,
            job,
        };
    }
}
