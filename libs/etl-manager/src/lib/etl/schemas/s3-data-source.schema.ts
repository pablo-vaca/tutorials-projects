import { Prop, SchemaFactory } from '@nestjs/mongoose';

import { DataSourceBase } from './data-source-base.schema';
import { S3Config } from './data-source.enum';
import { S3ConfigSchema } from './s3-config.entity';

export class S3DataSource extends DataSourceBase {
    @Prop({
        type: S3ConfigSchema, // <- ¡Validación específica para S3!
        required: true,
    })
    config: S3Config;
}

export const S3DataSourceSchema = SchemaFactory.createForClass(S3DataSource);
