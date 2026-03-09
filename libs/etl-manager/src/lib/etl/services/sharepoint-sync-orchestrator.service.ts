
import { Injectable, Logger } from '@nestjs/common';

import { GenericQueueService, JobType } from '@deal-insights/shared-nestjs-utils';

import EtlConfigService from './etl-config.service';
import SharepointService from './sharepoint.service';
import {
    DeltaSyncProjectType,
    EtlJobType,
    EtlSharePointDeltaDeleteJobData,
    EtlSharePointDeltaUpsertJobData,
} from '../jobs/etl-job.types';
import { DataSourceType, EtlConfig, SharePointConfig } from '../schemas';

@Injectable()
export default class SharepointSyncOrchestrator {
    private readonly logger = new Logger(SharepointSyncOrchestrator.name);

    /**
     *
     * @param etlConfigService
     * @param sharepointService
     * @param queueService
     */
    constructor(
        private readonly etlConfigService: EtlConfigService,
        private readonly sharepointService: SharepointService,
        private readonly queueService: GenericQueueService
    ) {}

    /**
     *
     * @param ms
     */
    private sleep(ms: number) {
        return new Promise((res) => {
            setTimeout(res, ms);
        });
    }

    /**
     *
     * @param ownerId
     */
    async triggerTest(ownerId: string) {
        await this.queueService.queueJob<any>(JobType.TEST, {
            testName: ownerId,
        });
    }

    /**
     *
     * @param coreApiToken
     */
    async triggerDeltaSyncForAllActiveProjects() {
        try {
            this.logger.log('delta sync triggered: Searching for active projects...');
            const query = {
                status: 'active',
                'dataSource.type': DataSourceType.SharePoint,
            };

            const activeConfigs = await this.etlConfigService.findByQuery(query);

            this.logger.log(`Found ${activeConfigs.length} active SharePoint projects.`);

            return activeConfigs;
        } catch (error) {
            this.logger.error(`Failed to orchestrate delta sync: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     *
     * @param coreApiToken
     * @param config
     */
    async deltaSyncProject(config: DeltaSyncProjectType) {
        this.logger.log(`[DELTA SYNC PROJECT] - projectId: ${config.projectId}`);
        try {
            this.logger.debug(`Processing config: ${config.id} (${config.projectName})`);
            const updatedConfig = await this.etlConfigService.updateStatusToSyncing(
                config.id,
                null
            );

            if (!updatedConfig || updatedConfig.status !== 'syncing') {
                this.logger.warn(
                    `[DELTA SYNC PROJECT]: The config: ${config.id} for the project: ${config.projectId} is being synced`
                );
                return;
            }

            const spConfig = config.spConfig as SharePointConfig;

            const { driveId, folderId } = spConfig;

            const { changes, newDeltaLink } = await this.sharepointService.getDeltaChanges(
                spConfig.deltaLink,
                driveId,
                folderId
            );

            if (newDeltaLink === null) {
                this.logger.log(
                    `Delta link expired for ${config.id}. Clearing link for full re-sync.`
                );
                await this.updateConfigDeltaLink(config.id, spConfig, null);
                await this.etlConfigService.updateStatus(config.id, 'active', null);
                return;
            }

            let latestModificationDate: Date | null = null;

            const changeProcessingPromises = changes.map(async (change) => {
                const configId = config.id;

                try {
                    const etlConfig = await this.etlConfigService.findById(configId);
                    // Case 1: The item was DELETED
                    if (change.deleted) {
                        this.logger.log(
                            `[DELETE] Config id: ${configId}. Item ID: ${change.id} will be add to the delete delta queue`
                        );

                        // Track deletion time as a modification
                        const deletionDate = new Date();
                        if (!latestModificationDate || deletionDate > latestModificationDate) {
                            latestModificationDate = deletionDate;
                        }

                        await this.queueService.queueJob<EtlSharePointDeltaDeleteJobData>(
                            EtlJobType.ETL_SHAREPOINT_DELTA_DELETE,
                            {
                                correlationId: etlConfig.correlationId,
                                fileOriginId: change.id,
                                configId,
                                projectId: config.projectId,
                                dataScope: config.dataScope,
                            }
                        );

                        // Case 2: The item is a FILE (Added or Updated)
                    } else if (change.file) {
                        this.logger.log(
                            `[UPSERT] File changed for config ${configId}. File: ${change.name} (ID: ${change.id})`
                        );

                        // Track file modification time
                        if (change.lastModifiedDateTime) {
                            const modDate = new Date(change.lastModifiedDateTime);
                            if (!latestModificationDate || modDate > latestModificationDate) {
                                latestModificationDate = modDate;
                            }
                        }

                        await this.queueService.queueJob<EtlSharePointDeltaUpsertJobData>(
                            EtlJobType.ETL_SHAREPOINT_DELTA_UPSERT,
                            {
                                configId,
                                projectId: config.projectId,
                                correlationId: etlConfig.correlationId,
                                dataScope: config.dataScope,
                                driveId,
                                change: {
                                    id: change.id,
                                    name: change.name,
                                    webUrl: change.webUrl,
                                    size: change.size,
                                    createdDateTime: change.createdDateTime,
                                    lastModifiedDateTime: change.lastModifiedDateTime,
                                    file: change.file,
                                },
                            }
                        );
                    } else {
                        this.logger.log(
                            `[INFO] Unhandled change type for config ${configId}. Item ID: ${change.id}.`
                        );
                    }
                } catch (error) {
                    await this.etlConfigService.updateStatus(config.id, 'active', null);
                    // Log the error for this specific change, but don't stop other changes
                    this.logger.error(
                        `Failed to process change ${change.id} for config ${configId}: ${error.message}`,
                        error.stack
                    );
                    // Re-throw if you want Promise.all to fail fast, or just log and continue
                    throw error; // This will cause Promise.all to reject
                }
            });

            // Now, wait for all changes to be processed
            const results = await Promise.allSettled(changeProcessingPromises);

            const failedChanges = results.filter((r) => r.status === 'rejected');

            if (failedChanges.length > 0) {
                await this.etlConfigService.updateStatus(config.id, 'active', null);
                // If ANY change failed, log the errors and throw.
                // This will be caught by the outer try/catch block
                // and prevent the delta link from being updated.
                failedChanges.forEach((failure) => {
                    this.logger.error(
                        `Failed to process a change for config ${config.id}:`,
                        (failure as PromiseRejectedResult).reason
                    );
                });

                throw new Error(
                    `Failed to process ${failedChanges.length} file(s). Delta link will not be updated.`
                );
            }

            await this.updateConfigDeltaLink(
                config.id,
                spConfig,
                newDeltaLink,
                latestModificationDate
            );
            await this.etlConfigService.updateStatus(config.id, 'active', null);
        } catch (error) {
            this.logger.error(`Failed to sync config ${config.id}: ${error.message}`, error.stack);
        }
    }

    /**
     * Helper to update the EtlConfig with the new deltaLink
     * @param configId
     * @param oldSpConfig
     * @param newDeltaLink
     * @param latestModificationDate
     */
    private async updateConfigDeltaLink(
        configId: string,
        oldSpConfig: SharePointConfig,
        newDeltaLink: string | null,
        latestModificationDate: Date | null = null
    ) {
        const newSpConfig = { ...oldSpConfig, deltaLink: newDeltaLink };
        const updateData: Partial<EtlConfig> = {
            dataSource: {
                type: DataSourceType.SharePoint,
                config: newSpConfig,
            },
            status: 'active',
            errorMessage: null,
            lastSyncAt: new Date(),
        };

        if (latestModificationDate) {
            updateData.lastSharePointUpdateAt = latestModificationDate;
        }

        await this.etlConfigService.update(configId, updateData);
    }
}
