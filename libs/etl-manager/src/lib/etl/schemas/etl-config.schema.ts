import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { DataSource, DataSourceSchema } from './data-source.schema';

export type EtlConfigDocument = HydratedDocument<EtlConfig>;

export type ChunkSettings = {
    chunkSize: number;
    overlap: number;
};

export type EmbeddingSettings = {
    deploymentId: string;
    user: string;
    model: string;
};

@Schema({ timestamps: true, collection: 'etl.config' })
export class EtlConfig {
    @Prop({ required: true })
    projectId: string;

    // TODO: REQUIERED TRUE - set as false until migrations for mongo
    @Prop({ required: false })
    correlationId: string;

    @Prop({ required: true })
    projectName: string;

    @Prop({ required: true })
    dataScope: string;

    @Prop({ type: DataSourceSchema, required: true })
    dataSource: DataSource;

    /**
     * Chunk processing configuration
     * @type {import('../services/etl-chunks-service').ChunkProcessorConfig}
     */
    @Prop({
        type: Object,
        required: true,
        _id: false,
    })
    chunksConfig: ChunkSettings;

    /**
     * Embeddings processing configuration
     * @type {import('../services/etl-embeddings-service').EmbeddingProcessorConfig}
     */
    @Prop({
        type: Object,
        required: true,
        _id: false,
    })
    embeddingsConfig: EmbeddingSettings;

    @Prop({ type: String, enum: ['active', 'inactive', 'error', 'syncing'], default: 'active' })
    status: 'active' | 'inactive' | 'error' | 'syncing';

    @Prop()
    errorMessage?: string;

    @Prop()
    webhookUrl?: string;

    @Prop({ default: false })
    webhookConfigured: boolean;

    @Prop()
    userId?: string;

    @Prop()
    lastSyncAt?: Date;

    @Prop()
    lastSharePointUpdateAt?: Date;

    @Prop()
    deletedAt?: Date;

    @Prop({ type: Number })
    order?: number;

    @Prop([{ action: String, timestamp: { type: Date, default: Date.now } }])
    history: { action: string; timestamp: Date }[];
}

export const EtlConfigSchema = SchemaFactory.createForClass(EtlConfig);
