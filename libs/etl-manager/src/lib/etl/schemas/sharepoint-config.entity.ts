import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { SharePointConfig } from './data-source.enum';

@Schema({ _id: false, timestamps: false })
export class SharePointConfigEntity implements SharePointConfig {
    @Prop({ type: String, required: true })
    url: string;

    @Prop({ type: String, required: true })
    tenantId: string;

    @Prop({ type: String, required: true })
    driveId: string;

    @Prop({ type: String, require: false })
    folderId?: string;

    @Prop({ type: String, require: false })
    siteId?: string;

    @Prop({ type: String, require: false })
    listId?: string;

    @Prop({ type: String, require: false })
    deltaLink?: string;

    @Prop({ type: String, require: false })
    cronSchedule?: string;
}

export const SharePointConfigSchema = SchemaFactory.createForClass(SharePointConfigEntity);
