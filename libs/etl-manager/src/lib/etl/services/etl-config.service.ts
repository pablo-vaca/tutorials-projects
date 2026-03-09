
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { EtlConfig, EtlConfigDocument } from '../schemas/etl-config.schema';
import { GlobalCounter, GlobalCounterDocument } from '../schemas/global-counter.schema';

export enum ConfigHistoryActions {
    RESYNC_PROJECT = 'resync_project',
    DELETE_PROJECT = 'delete_project',
}
@Injectable()
export default class EtlConfigService {
    private readonly logger = new Logger(EtlConfigService.name);

    /**
     * @param {Model<EtlConfigDocument>} EtlConfigModel - the Mongoose model for ETL configs
     * @param {Model<GlobalCounterDocument>} GlobalCounterModel - model for global counters
     */
    constructor(
        @InjectModel(EtlConfig.name)
        private readonly EtlConfigModel: Model<EtlConfigDocument>,
        @InjectModel(GlobalCounter.name)
        private readonly GlobalCounterModel: Model<GlobalCounterDocument>
    ) {}

    /**
     * Creates a new vectorstore configuration
     * NOTE: review use of partial and defaults, as some fields are required for the config to be valid
     * @param {Partial<EtlConfig>} configData - the configuration data to create
     * @returns {Promise<EtlConfigDocument>} the created configuration document
     */
    async create(configData: Partial<EtlConfig>): Promise<EtlConfigDocument> {
        const newConfig = new this.EtlConfigModel(configData);
        // correlation id to use in jobs to validate them
        newConfig.correlationId = uuidv4();
        // assign project order if projectId is provided
        if (configData.projectId) {
            try {
                const counter = await this.GlobalCounterModel.findOneAndUpdate(
                    { _id: 'project_order_seq' },
                    { $inc: { seq: 1 } },
                    { upsert: true, new: true }
                )
                    .lean()
                    .exec();

                const seq = counter?.seq ?? 1;
                newConfig.order = seq;
            } catch (err) {
                this.logger.warn('assign project order failed', err);
            }
        }
        return newConfig.save();
    }

    /**
     * Finds a configuration by ID
     * @param {string} id - the configuration ID
     * @returns {Promise<EtlConfigDocument | null>} the configuration document or null
     */
    async findById(id: string): Promise<EtlConfigDocument | null> {
        return this.EtlConfigModel.findById(id).exec();
    }

    /**
     * Finds configurations by project ID
     * @param {string} projectId - the project ID
     * @param {boolean} includeDeleted - allow to use deleted config on the query
     * @returns {Promise<EtlConfigDocument | null>} array of configuration documents
     */
    async findByProjectId(
        projectId: string,
        includeDeleted = false
    ): Promise<EtlConfigDocument | null> {
        const results = await this.findByQuery({ projectId }, includeDeleted);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Finds configurations by a flexible Mongoose query object.
     * @param {FilterQuery<EtlConfig>} query - The Mongoose query object.
     * @param {boolean} includeDeleted - whether to include soft deleted configs (default: false)
     * @returns {Promise<EtlConfigDocument[]>} Array of configuration documents.
     */
    async findByQuery(
        query: FilterQuery<EtlConfig>,
        includeDeleted = false
    ): Promise<EtlConfigDocument[]> {
        const finalQuery = includeDeleted ? query : { ...query, deletedAt: { $exists: false } };
        return this.EtlConfigModel.find(finalQuery).exec();
    }

    /**
     * Finds configurations by a single specific field.
     * This is now just a convenient wrapper for findByQuery.
     * @param {field<string>} field - Field for querying
     * @param {value<EtlConfig[K]>} value - value
     * @returns {Promise<EtlConfigDocument[]>}
     */
    async findByField<K extends keyof EtlConfig>(
        field: K,
        value: EtlConfig[K]
    ): Promise<EtlConfigDocument[]> {
        const query = { [field]: value } as any;
        return this.findByQuery(query);
    }

    /**
     *
     * @param paramObj
     */
    getDefaultConfig(paramObj: object) {
        const defaultObj = {
            projectId: null,
            projectName: null,
            dataScope: null,
            dataSource: null,
            sharepointUrl: '',
            sharepointTenant: '',
            sharepointFolder: '',
            chunksConfig: {
                chunkSize: 800, // Default value
                overlap: 80, // Default value
            },
            embeddingsConfig: {
                deploymentId: 'mmc-tech-text-embedding-3-large',
                user: 'user@example.com',
                model: 'text-embedding-3-large',
            },
            status: 'active',
            webhookConfigured: false,
            history: [{ action: 'default_config_created', timestamp: new Date() }],
        };

        const newModel = { ...defaultObj, ...paramObj };
        return new this.EtlConfigModel(newModel);
    }

    /**
     * Updates a configuration by ID
     * @param {string} id - the configuration ID
     * @param {Partial<EtlConfig>} updateData - the data to update
     * @returns {Promise<EtlConfigDocument | null>} the updated configuration document or null
     */
    async update(id: string, updateData: Partial<EtlConfig>): Promise<EtlConfigDocument | null> {
        const update: Record<string, unknown> = { ...updateData };
        update.$push = {
            history: { action: 'config_updated', timestamp: new Date() },
        };
        return this.EtlConfigModel.findByIdAndUpdate(id, update, {
            new: true,
        }).exec();
    }

    /**
     * Updates the status of a configuration
     * @param {string} id - the configuration ID
     * @param {EtlConfig['status']} status - the new status
     * @param {string} errorMessage - optional error message
     * @returns {Promise<EtlConfigDocument | null>} the updated configuration document or null
     */
    async updateStatus(
        id: string,
        status: EtlConfig['status'],
        errorMessage?: string
    ): Promise<EtlConfigDocument | null> {
        const update: Record<string, unknown> = { status };
        if (errorMessage) {
            update.errorMessage = errorMessage;
        }
        update.$push = {
            history: { action: `status_changed_to_${status}`, timestamp: new Date() },
        };
        return this.EtlConfigModel.findByIdAndUpdate(id, update, {
            new: true,
        }).exec();
    }

    /**
     * Updates the status of a configuration
     * @param {string} id - the configuration ID
     * @param {EtlConfig['status']} status - the new status
     * @param {string} errorMessage - optional error message
     * @returns {Promise<EtlConfigDocument | null>} the updated configuration document or null
     */
    async updateStatusToSyncing(
        id: string,
        errorMessage?: string
    ): Promise<EtlConfigDocument | null> {
        try {
            const update: Record<string, unknown> = { status: 'syncing' };
            if (errorMessage) {
                update.errorMessage = errorMessage;
            }
            update.$push = {
                history: { action: 'status_changed_to_syncing', timestamp: new Date() },
            };
            return await this.EtlConfigModel.findOneAndUpdate(
                { _id: new Types.ObjectId(id), status: 'active' },
                update,
                {
                    new: true,
                }
            ).exec();
        } catch (error) {
            this.logger.warn(error);
        }
        return null;
    }

    /**
     * Soft deletes a configuration by ID (marks as deleted without removing from DB)
     * @param {string} id - the configuration ID
     * @returns {Promise<EtlConfigDocument | null>} the soft deleted configuration document or null
     */
    async softDelete(id: string): Promise<EtlConfigDocument | null> {
        const update: Record<string, unknown> = { deletedAt: new Date(), status: 'deleted' };
        update.$push = {
            history: { action: 'config_soft_deleted', timestamp: new Date() },
        };
        return this.EtlConfigModel.findByIdAndUpdate(id, update, {
            new: true,
        }).exec();
    }

    /**
     * Deletes a configuration by ID
     * @param {string} id - the configuration ID
     * @param {boolean} soft - whether to perform soft delete (default: true)
     * @returns {Promise<EtlConfigDocument | null>} the deleted configuration document or null
     */
    async delete(id: string, soft = true): Promise<EtlConfigDocument | null> {
        if (soft) {
            return this.softDelete(id);
        }
        return this.EtlConfigModel.findByIdAndDelete(id).exec();
    }

    /**
     * Adds a custom history entry to the config.
     * @param id - The config ID.
     * @param action - The action string (e.g., 'resync_project').
     * @returns The updated config document or null.
     */
    async addHistoryEntry(id: string, action: string): Promise<EtlConfigDocument | null> {
        return this.EtlConfigModel.findByIdAndUpdate(
            id,
            { $push: { history: { action, timestamp: new Date() } } },
            { new: true }
        ).exec();
    }

    /**
     * Returns the numeric order assigned to a project, or null if not yet assigned.
     * @param {string} projectId - the project ID
     * @returns {Promise<number | null>} the order number or null
     */
    async getProjectOrder(projectId: string): Promise<number | null> {
        const cfg = await this.findByProjectId(projectId);
        return cfg && typeof cfg.order === 'number' ? cfg.order : null;
    }

    /**
     * Gets the timestamp of the most recent 'resync_project' history entry for the config.
     * @param config - The config.
     * @returns The timestamp or null if no resync has occurred.
     */
    async getLastResyncTimestamp(config: EtlConfig): Promise<Date | null> {
        if (!config) {
            return null;
        }

        const resyncEntries = config.history
            .filter((entry) => entry.action === ConfigHistoryActions.RESYNC_PROJECT)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        return resyncEntries.length > 0 ? resyncEntries[0].timestamp : null;
    }
}
