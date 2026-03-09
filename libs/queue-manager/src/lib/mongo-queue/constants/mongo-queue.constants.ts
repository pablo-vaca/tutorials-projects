// Re-exported so any code that previously imported these from mongo-queue is
// not broken. The values are now owned by generic-queue — a single source of truth.
export {
    DEFAULT_MAX_RETRIES,
    DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
} from '../../generic-queue/constants/generic-queue.constants';

export const MONGO_QUEUE_COLLECTION = 'queue_jobs';

export const MONGO_QUEUE_BATCH_COLLECTION = 'queue_batches';

/** Delay before a newly enqueued job becomes visible (seconds). MongoDB-specific. */
export const DEFAULT_DELAY_SECONDS = 0;
