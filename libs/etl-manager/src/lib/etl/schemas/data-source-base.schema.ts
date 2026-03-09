// data-source-base.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { DataSourceType } from './data-source.enum';

@Schema({
    _id: false,
    timestamps: false,
    // The discriminator key is the field that Mongoose uses to differentiate sub-schemas.
    // In this case, it is 'type'.
    discriminatorKey: 'type',
})
export class DataSourceBase {
    @Prop({
        type: String,
        required: true,
        enum: Object.values(DataSourceType),
    })
    type: DataSourceType;
}

// We export the base schema, NOT the model, so that discriminators can use it
export const DataSourceBaseSchema = SchemaFactory.createForClass(DataSourceBase);
