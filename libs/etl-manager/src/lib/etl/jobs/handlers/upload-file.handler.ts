
import { Injectable, Logger } from '@nestjs/common';

import { GenericQueueService, IJobResult, QueueJob } from '@deal-insights/shared-nestjs-utils';

import { ProcessingException } from '../../exceptions';
import { DataSourceType, EtlConfigDocument, SharePointConfig } from '../../schemas';
import EtlSharedService from '../../services/etl-shared.service';
import EtlService from '../../services/etl.service';
import FileService from '../../services/file.service';
import SharepointService from '../../services/sharepoint.service';
import {
    EtlCreateChunksJobData,
    EtlJobData,
    EtlJobType,
    EtlUploadFileJobData,
} from '../etl-job.types';
import { ISingleEtlHandler } from '../single-etl-handler.interface';

@Injectable()
export class UploadFileHandler implements ISingleEtlHandler<EtlUploadFileJobData> {
    private readonly logger = new Logger(UploadFileHandler.name);

    /**
     * Not used yet
     * @param fileService
     * @param etlService
     * @param logger
     * @param etlSharedService
     * @param sharepointService
     * @param queueService
     */
    constructor(
        private readonly fileService: FileService,
        private readonly etlService: EtlService,private readonly etlSharedService: EtlSharedService,
        private readonly sharepointService: SharepointService,
        private readonly queueService: GenericQueueService
    ) {}

    /**
     *
     * @param jobType
     * @param payload
     */
    private async queueNextJob<T extends EtlJobData>(
        jobType: EtlJobType,
        payload: T
    ): Promise<string> {
        this.logger.debug(` > next ${jobType} :: ${JSON.stringify(payload)}`);
        return this.queueService.queueJob(jobType, payload);
    }

    /**
     *
     * @param job
     * @param etlConfig
     */
    async handle(
        job: QueueJob<EtlUploadFileJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        this.logger.log(`[UPLOAD] Starting file upload: ${job.payload.mongoFileId}`);
        const { mongoFileId } = job.payload;

        const mongoFile = await this.fileService.findById(mongoFileId);

        if (!mongoFile) {
            throw new Error(`ETL mongo file not found (mongoFileId=${mongoFileId ?? 'n/a'}`);
        }

        this.logger.log(
            `[UPLOAD] Uploading file '${mongoFile.fileName}' (origin ${mongoFile.fileOriginId})`
        );

        // Resolve config
        const resolvedConfigId = this.etlService.getConfigId(etlConfig);
        const resolvedProjectId = etlConfig.projectId;
        const chunkSettings = this.etlSharedService.resolveChunkSettings(etlConfig, mongoFile);

        await this.sharepointService.initialize(etlConfig);

        let fileBuffer = null;
        if (mongoFile.fileSource === DataSourceType.SharePoint) {
            const sourceConfig = etlConfig.dataSource.config as SharePointConfig;
            fileBuffer = await this.sharepointService.downloadFile(
                sourceConfig.driveId,
                mongoFile.fileOriginId
            );
        } else {
            throw new ProcessingException(` > file source not supported [${mongoFile.fileSource}]`);
        }

        const uploaderId = 'queue-worker';

        this.logger.log(
            `[UPLOAD] Uploading file '${mongoFile.fileName}' (origin ${mongoFile.fileOriginId}) for user ${uploaderId}`
        );

        try {
            await this.etlService.uploadFileFromBuffer({
                mongoFileId,
                buffer: fileBuffer,
                fileName: mongoFile.fileName,
                mimeType: mongoFile.mimeType,
            });

            await this.fileService.updateProjectId(mongoFileId, resolvedProjectId);

            let nextJobId: string | undefined;

            if (chunkSettings) {
                nextJobId = await this.queueNextJob<EtlCreateChunksJobData>(
                    EtlJobType.ETL_CREATE_CHUNKS,
                    {
                        projectId: resolvedProjectId,
                        correlationId: etlConfig.correlationId,
                        mongoFileId,
                        configId: resolvedConfigId,
                    }
                );
                await this.fileService.updateStatus(mongoFileId, 'processing');
            } else {
                this.logger.warn(
                    `[UPLOAD] Missing chunk configuration in ETL config ${resolvedConfigId}; skipping automatic chunk job enqueue`
                );
                await this.fileService.updateStatus(mongoFileId, 'uploaded');
            }

            return {
                success: true,
                data: {
                    message: 'File uploaded successfully',
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'failed', err.message);
            }
            throw err;
        }
    }
}
