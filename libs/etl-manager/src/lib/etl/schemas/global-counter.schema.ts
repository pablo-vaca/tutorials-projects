import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * A simple global counter document used to generate monotonic sequences.
 * We store counters in a small collection; a single document per sequence key.
 */
@Schema({ collection: 'global_counters' })
export class GlobalCounter {
    @Prop({ type: String, required: true })
    _id: string; // sequence name, e.g. 'project_order_seq'

    @Prop({ required: true, default: 0 })
    seq: number;
}

export type GlobalCounterDocument = HydratedDocument<GlobalCounter>;

export const GlobalCounterSchema = SchemaFactory.createForClass(GlobalCounter);
