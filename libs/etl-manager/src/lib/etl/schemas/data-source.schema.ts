import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { LocalConfig, SharePointConfig, S3Config, DataSourceType } from './data-source.enum';

@Schema({ _id: false, timestamps: false })
export class DataSource {
    @Prop({
        type: String,
        required: true,
        enum: Object.values(DataSourceType),
    })
    type: DataSourceType;

    @Prop({ type: Object, required: true })
    config: SharePointConfig | S3Config | LocalConfig;
}

export const DataSourceSchema = SchemaFactory.createForClass(DataSource);
