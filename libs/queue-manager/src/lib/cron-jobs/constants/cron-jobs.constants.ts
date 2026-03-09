export const CRON_JOB_CONFIG_COLLECTION = 'cron_job_configs';

export const CRON_JOB_EXECUTION_COLLECTION = 'cron_job_executions';

/**
 * Number of days to retain execution history
 * MongoDB TTL index will automatically delete documents older than this value
 *
 * TTL cleanup process runs once every 60 seconds, so there may be a slight delay
 * between when a document expires and when it's actually deleted.
 * @default 30 days
 *
 * To change this value:
 * 1. Update this constant
 * 2. Drop the existing TTL index: db.cron_job_executions.dropIndex("ttl_executedAt")
 * 3. Restart the application to recreate the index with new value
 */
export const EXECUTION_HISTORY_RETENTION_DAYS = 30;
