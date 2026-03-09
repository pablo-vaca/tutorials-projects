/**
 * Default number of concurrent workers spawned per registered job type.
 */
export const DEFAULT_CONCURRENCY = 1;

/**
 * Default polling interval (ms) when the queue returns no job.
 */
export const DEFAULT_POLL_INTERVAL_MS = 1_000;

/**
 * Default maximum delivery attempts before a job is dropped.
 *
 * This value is passed to the queue provider's `get()` call, so it is the
 * authoritative retry ceiling across all provider implementations.
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Default visibility window (seconds) — how long a job is hidden from other
 * workers while being processed.
 *
 * ⚠️  30 seconds is intentionally conservative. If your jobs routinely take
 * longer than this, override per job via `defineJob(jobType, handler, { visibilityTimeoutSeconds })`.
 * The MongoDB provider previously defaulted to 300 s at the storage layer, but
 * that value was unreachable because GenericQueueService always supplies this
 * option explicitly. Raise this constant (or the per-job override) for
 * long-running workloads.
 */
export const DEFAULT_VISIBILITY_TIMEOUT_SECONDS = 30;

/**
 * DI token for the IQueueProvider implementation.
 * Use with @Inject(QUEUE_PROVIDER) when injecting the provider directly.
 */
export const QUEUE_PROVIDER = 'QUEUE_PROVIDER';

/**
 * DI token for the IBatchProvider implementation.
 * Use with @Inject(BATCH_PROVIDER) when injecting the provider directly.
 */
export const BATCH_PROVIDER = 'BATCH_PROVIDER';
