import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PdfFileDocument = HydratedDocument<PdfFile>;

@Schema({ timestamps: true, collection: 'pdffile' })
export class PdfFile {
    @Prop({ required: true })
    filename: string;

    @Prop({
        type: String,
        enum: ['created', 'split', 'optimized', 'parsed', 'completed', 'error'],
        default: 'created',
    })
    status:
        | 'created' // added to filestorage
        | 'split' // split into images/pages
        | 'optimized' // optimized images/pages for small filesize
        | 'parsed' // converted to markdown
        | 'completed'; // embedded

    @Prop()
    hasErrors?: boolean;

    @Prop()
    errorMessage?: string;

    @Prop({ required: true })
    folderId: string;
}

export const PdfFileSchema = SchemaFactory.createForClass(PdfFile);
