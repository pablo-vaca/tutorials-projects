// sharepoint-data-source.schema.ts

import { Prop, SchemaFactory } from '@nestjs/mongoose';

import { DataSourceBase } from './data-source-base.schema';
import { SharePointConfigEntity, SharePointConfigSchema } from './sharepoint-config.entity';

export class SharePointDataSource extends DataSourceBase {
    @Prop({
        type: SharePointConfigSchema,
        required: true,
    })
    config: SharePointConfigEntity;
}

export const SharePointDataSourceSchema = SchemaFactory.createForClass(SharePointDataSource);
