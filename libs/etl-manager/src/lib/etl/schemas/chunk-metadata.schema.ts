import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { SharePointFileSource } from './data-source.enum';
import { DocumentClassification } from './document-classification.schema';

/**
 * Metadata associated with a chunk
 */
@Schema({ _id: false })
export class ChunkMetadata {
    @Prop()
    projectId: string;

    @Prop()
    dataScope: string;

    @Prop({ type: Object })
    source: SharePointFileSource;

    @Prop()
    chunkSize?: number;

    @Prop()
    overlap?: number;

    @Prop()
    fileId?: string;

    @Prop()
    pageNumber?: number;

    @Prop()
    classification?: DocumentClassification;
}

export const ChunkMetadataSchema = SchemaFactory.createForClass(ChunkMetadata);
