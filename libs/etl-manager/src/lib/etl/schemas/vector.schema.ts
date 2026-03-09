import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'dealroomdocsvectors' })
export class Vector {
    @Prop()
    name?: string;

    @Prop()
    clientId?: string;

    @Prop()
    folder_id?: string;

    @Prop()
    projectId?: string;

    @Prop({ type: SchemaTypes.Mixed })
    result?: any;

    @Prop({ type: SchemaTypes.Mixed })
    folderDetails?: any;

    @Prop({ required: true })
    page_content: string;

    @Prop([Number])
    page_embeddings: number[];

    @Prop()
    web_url?: string;

    @Prop()
    last_review_date?: Date;

    @Prop()
    last_review_status?: boolean;

    @Prop()
    etag?: string;

    @Prop()
    mimeType?: string;

    @Prop()
    fields_odata_context?: string;

    @Prop()
    last_modified_time?: string;

    @Prop()
    chunk_size?: number;

    @Prop()
    chunk_overlap?: number;

    @Prop({ type: Object })
    document_meta?: {
        Created?: string;
        Modified?: string;
        ShortDescription?: string;
        Region?: string;
        DocIcon?: string;
        Disclaimer?: { Label?: string };
        projectId?: string;
        dataScope?: string;
        source?: object;

        filename?: string;
        pageNumber?: number;
    };

    @Prop()
    created_by?: string;

    @Prop()
    modified_by?: string;

    @Prop()
    created_time?: string;

    @Prop()
    doc_id?: string;

    @Prop({ type: Types.ObjectId, ref: 'File', required: true, index: true })
    fileId: Types.ObjectId;

    @Prop({ type: Object })
    __v?: number;
}

export const VectorSchema = SchemaFactory.createForClass(Vector);
export type VectorDocument = HydratedDocument<Vector>;
