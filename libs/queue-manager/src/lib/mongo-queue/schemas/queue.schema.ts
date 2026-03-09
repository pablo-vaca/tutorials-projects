import { Schema } from 'mongoose';

import { MONGO_QUEUE_COLLECTION } from '../constants/mongo-queue.constants';
import { QueuePriorityEnum, QueueStatusEnum } from '../enums/queue-priority-enum';

export const QueueSchema = new Schema(
    {
        visible: { type: Date, required: true },
        priority: {
            type: Number,
            required: true,
            enum: Object.values(QueuePriorityEnum).filter((value) => typeof value === 'number'),
            default: QueuePriorityEnum.LOWEST,
        },
        payload: {
            jobType: { type: String, required: true, index: true },
            payload: { type: Schema.Types.Mixed, required: true },
        },
        ack: { type: String, default: null, index: true },
        tries: { type: Number, default: 0 },
        deleted: { type: Date, default: null },
        createdAt: { type: Date, default: Date.now },
        order: { type: Number, default: 0 },
        status: {
            type: String,
            enum: Object.values(QueueStatusEnum),
            default: QueueStatusEnum.PENDING,
        },
        producer: { type: String, default: 'not-producer' },
    },
    { collection: MONGO_QUEUE_COLLECTION }
);

QueueSchema.index({ deleted: 1, visible: 1, 'payload.jobType': 1, order: 1, priority: -1 });
QueueSchema.index({ visible: 1, 'payload.jobType': 1 });
QueueSchema.index({ ack: 1, visible: 1 });
