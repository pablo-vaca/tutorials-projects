import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Metadata associated with a chunk
 */
@Schema({ _id: false })
export class DocumentClassification {
    @Prop()
    category: string;

    @Prop()
    confidence: number;

    @Prop()
    reasoning: string;

    @Prop()
    needsReview: boolean;

    @Prop()
    chunksAnalyzed: number;

    @Prop()
    totalChunks: number;
}

export const DocumentClassificationSchema = SchemaFactory.createForClass(DocumentClassification);
