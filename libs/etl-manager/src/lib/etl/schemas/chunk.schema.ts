import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, HydratedDocument } from 'mongoose';

import { ChunkMetadata, ChunkMetadataSchema } from './chunk-metadata.schema';

@Schema({ timestamps: true, collection: 'etl.chunk' })
export class Chunk {
    @Prop({ type: Types.ObjectId, ref: 'File', required: true })
    fileId: Types.ObjectId;

    @Prop({ required: true })
    content: string;

    @Prop({ required: true })
    chunkIndex: number;

    @Prop([Number])
    embedding?: number[];

    @Prop({ type: ChunkMetadataSchema })
    metadata?: ChunkMetadata;
}

export const ChunkSchema = SchemaFactory.createForClass(Chunk);
export type ChunkDocument = HydratedDocument<Chunk>;
