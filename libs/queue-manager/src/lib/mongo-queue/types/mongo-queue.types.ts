import {
    QueueMessagePayload,
    QueueProviderOptions,
} from '../../generic-queue/interfaces/queue-provider.interface';
import { QueuePriorityEnum, QueueStatusEnum } from '../enums/queue-priority-enum';

export type MongoQueueOptions = QueueProviderOptions;

export interface QueueMessage<TPayload = unknown> {
    visible: Date;
    priority: QueuePriorityEnum;
    payload: QueueMessagePayload<TPayload>;
    ack?: string | null;
    tries?: number;
    deleted?: Date | null;
    order: number;
    status: QueueStatusEnum;
    producer: string;
}
