import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { S3Config } from './data-source.enum';

@Schema({ _id: false, timestamps: false })
export class S3ConfigEntity implements S3Config {
    @Prop({ type: String, required: true })
    bucket: string;

    @Prop({ type: String, required: true })
    region: string;

    @Prop({ type: String, required: true })
    prefix: string;

    @Prop({ type: String, required: true })
    accessKeyId: string;
}

export const S3ConfigSchema = SchemaFactory.createForClass(S3ConfigEntity);
