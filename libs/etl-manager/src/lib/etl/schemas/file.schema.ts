import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { SharePointFileSource } from './data-source.enum';
import { FileProcessingStrategy } from '../types/config-strategy.types';

export type FileDocument = HydratedDocument<File>;

@Schema({ timestamps: true, collection: 'etl.file' })
export class File {
    @Prop({ required: true })
    fileName: string;

    @Prop({ required: true })
    fileOriginId: string;

    /**
     * This is for the coreaApi uuid you get when a file is uploaded
     */
    @Prop()
    remoteId?: string;

    @Prop()
    fileSource?: string;

    @Prop({ type: Object })
    sourceData: SharePointFileSource; // This would evolve to a union type

    @Prop()
    fileSize?: number;

    @Prop()
    mimeType?: string;

    @Prop()
    projectId: string;

    @Prop()
    configId: string;

    @Prop()
    storageFilename?: string;

    @Prop({
        default: FileProcessingStrategy.BASE,
    })
    processingStrategy: string;

    @Prop({ type: Object })
    pagesToProcess: {
        total: number;
        processed: number;
    };

    @Prop({
        type: String,
        enum: [
            'uploaded',
            'processing',
            'completed',
            'failed',

            'created', // new-flow
            'downloaded',
            'download_failed',
            'analyzed',
            'split',
            'markdown-creating',
            'markdown-created',
            'chunking',
            'chunked',
            'embeddings-creating',
            'embeddings-created',
        ],
        default: 'uploaded',
    })
    processingStatus:
        | 'uploaded'
        | 'processing'
        | 'completed'
        | 'failed'
        | 'created' // new-flow
        | 'downloaded'
        | 'download_failed'
        | 'analyzed'
        | 'split'
        | 'markdown-creating'
        | 'markdown-created'
        | 'chunking'
        | 'chunked'
        | 'embeddings-creating'
        | 'embeddings-created';

    @Prop()
    errorMessage?: string;

    @Prop([{ type: Types.ObjectId }])
    chunks: Types.ObjectId[];

    @Prop({ default: false })
    embeddingsStored: boolean;

    @Prop()
    userId?: string;

    @Prop([{ action: String, timestamp: { type: Date, default: Date.now } }])
    history: { action: string; timestamp: Date }[];
}

export const FileSchema = SchemaFactory.createForClass(File);
FileSchema.index({ fileOriginId: 1, projectId: 1 }, { unique: true });
FileSchema.index(
    { remoteId: 1, projectId: 1 },
    { unique: true, partialFilterExpression: { remoteId: { $exists: true } } }
);
