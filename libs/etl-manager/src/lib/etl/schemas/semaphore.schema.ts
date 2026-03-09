import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SemaphoreDocument = HydratedDocument<Semaphore>;

@Schema({ timestamps: true, collection: 'semaphore' })
export class Semaphore {
    @Prop({ required: true })
    resource: string;

    @Prop({ required: true })
    processType: string;

    @Prop({ required: true })
    ownerId: string;

    @Prop({ required: true })
    token: string;

    @Prop({ required: true })
    lockedAt: Date;

    @Prop({ required: true })
    expiresAt: Date;
}

export const SemaphoreSchema = SchemaFactory.createForClass(Semaphore);

SemaphoreSchema.index(
    // The index definition object: field: sort_order
    { resource: 1, processType: 1 },
    // Optional options object (e.g., unique, partialFilterExpression)
    { unique: true }
);
