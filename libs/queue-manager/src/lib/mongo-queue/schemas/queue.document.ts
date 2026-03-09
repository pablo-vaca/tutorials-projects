import { Document } from 'mongoose';

import { QueueMessagePayload } from '../../generic-queue/interfaces/queue-provider.interface';
import { QueuePriorityEnum, QueueStatusEnum } from '../enums/queue-priority-enum';

export interface QueueDocument<TPayload = unknown> extends Document {
    visible: Date;
    priority: QueuePriorityEnum;
    payload: QueueMessagePayload<TPayload>;
    ack?: string | null;
    tries: number;
    deleted?: Date | null;
    createdAt: Date;
    order: number;
    status: QueueStatusEnum;
    producer: string;
}
