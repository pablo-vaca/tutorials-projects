import { CronExpression } from '@nestjs/schedule';

/**
 * Common cron time expressions enum
 * Provides predefined schedules for common use cases
 */
export enum CronTimeExpression {
    /** Every second */
    EVERY_SECOND = '* * * * * *',
    /** Every 5 seconds */
    EVERY_5_SECONDS = '*/5 * * * * *',
    /** Every 10 seconds */
    EVERY_10_SECONDS = '*/10 * * * * *',
    /** Every 30 seconds */
    EVERY_30_SECONDS = '*/30 * * * * *',
    /** Every minute */
    EVERY_MINUTE = '* * * * *',
    /** Every 5 minutes */
    EVERY_5_MINUTES = '*/5 * * * *',
    /** Every 10 minutes */
    EVERY_10_MINUTES = '*/10 * * * *',
    /** Every 15 minutes */
    EVERY_15_MINUTES = '*/15 * * * *',
    /** Every 30 minutes */
    EVERY_30_MINUTES = '*/30 * * * *',
    /** Every hour at minute 0 */
    EVERY_HOUR = '0 * * * *',
    /** Every 2 hours */
    EVERY_2_HOURS = '0 */2 * * *',
    /** Every 3 hours */
    EVERY_3_HOURS = '0 */3 * * *',
    /** Every 6 hours */
    EVERY_6_HOURS = '0 */6 * * *',
    /** Every 12 hours */
    EVERY_12_HOURS = '0 */12 * * *',
    /** Daily at midnight (00:00) */
    EVERY_DAY_AT_MIDNIGHT = '0 0 * * *',
    /** Daily at 1 AM */
    EVERY_DAY_AT_1AM = '0 1 * * *',
    /** Daily at 2 AM */
    EVERY_DAY_AT_2AM = '0 2 * * *',
    /** Daily at 3 AM */
    EVERY_DAY_AT_3AM = '0 3 * * *',
    /** Daily at noon (12:00 PM) */
    EVERY_DAY_AT_NOON = '0 12 * * *',
    /** Every weekday (Mon-Fri) at 9 AM */
    EVERY_WEEKDAY_AT_9AM = '0 9 * * 1-5',
    /** Every weekday (Mon-Fri) at midnight */
    EVERY_WEEKDAY_AT_MIDNIGHT = '0 0 * * 1-5',
    /** Every week on Sunday at midnight */
    EVERY_WEEK_ON_SUNDAY = '0 0 * * 0',
    /** Every week on Monday at midnight */
    EVERY_WEEK_ON_MONDAY = '0 0 * * 1',
    /** Every month on the 1st at midnight */
    EVERY_MONTH_ON_FIRST = '0 0 1 * *',
    /** Every month on the 15th at midnight */
    EVERY_MONTH_ON_FIFTEENTH = '0 0 15 * *',
    /** Every year on January 1st at midnight */
    EVERY_YEAR_ON_JAN_FIRST = '0 0 1 1 *',
}

/**
 * Common timezone enum
 * Provides commonly used timezone identifiers
 */
export enum TimeZone {
    /** UTC - Coordinated Universal Time */
    UTC = 'UTC',
    /** Eastern Time (US & Canada) */
    AMERICA_NEW_YORK = 'America/New_York',
    /** Central Time (US & Canada) */
    AMERICA_CHICAGO = 'America/Chicago',
    /** Mountain Time (US & Canada) */
    AMERICA_DENVER = 'America/Denver',
    /** Pacific Time (US & Canada) */
    AMERICA_LOS_ANGELES = 'America/Los_Angeles',
    /** Alaska Time */
    AMERICA_ANCHORAGE = 'America/Anchorage',
    /** Hawaii Time */
    PACIFIC_HONOLULU = 'Pacific/Honolulu',
    /** London */
    EUROPE_LONDON = 'Europe/London',
    /** Paris, Berlin, Rome */
    EUROPE_PARIS = 'Europe/Paris',
    /** Athens, Istanbul */
    EUROPE_ATHENS = 'Europe/Athens',
    /** Moscow */
    EUROPE_MOSCOW = 'Europe/Moscow',
    /** Dubai */
    ASIA_DUBAI = 'Asia/Dubai',
    /** India Standard Time */
    ASIA_KOLKATA = 'Asia/Kolkata',
    /** Bangkok, Hanoi, Jakarta */
    ASIA_BANGKOK = 'Asia/Bangkok',
    /** Singapore, Kuala Lumpur */
    ASIA_SINGAPORE = 'Asia/Singapore',
    /** Hong Kong */
    ASIA_HONG_KONG = 'Asia/Hong_Kong',
    /** Shanghai, Beijing */
    ASIA_SHANGHAI = 'Asia/Shanghai',
    /** Tokyo, Osaka */
    ASIA_TOKYO = 'Asia/Tokyo',
    /** Seoul */
    ASIA_SEOUL = 'Asia/Seoul',
    /** Sydney, Melbourne */
    AUSTRALIA_SYDNEY = 'Australia/Sydney',
    /** Auckland */
    PACIFIC_AUCKLAND = 'Pacific/Auckland',
    /** Sao Paulo */
    AMERICA_SAO_PAULO = 'America/Sao_Paulo',
    /** Buenos Aires */
    AMERICA_ARGENTINA_BUENOS_AIRES = 'America/Argentina/Buenos_Aires',
    /** Mexico City */
    AMERICA_MEXICO_CITY = 'America/Mexico_City',
    /** Toronto */
    AMERICA_TORONTO = 'America/Toronto',
}

/**
 * Supported cron time expressions
 */
export type CronTime = string | Date | CronExpression | CronTimeExpression;

/**
 * Cron job configuration options
 */
export interface CronJobConfig {
    /**
     * Unique name for the cron job
     */
    name: string;

    /**
     * Cron expression or schedule
     * @example
     * ```
     * '0 0 * * *' - daily at midnight
     * '* /5 * * * *' - every 5 minutes
     * ```
     */
    cronTime: CronTime;

    /**
     * Whether the job should start immediately
     * @default false
     */
    runOnInit?: boolean;

    /**
     * Timezone for the cron job
     * @default TimeZone.AMERICA_NEW_YORK
     */
    timeZone?: TimeZone | string;

    /**
     * Whether the job is enabled
     * @default true
     */
    enabled?: boolean;
}

/**
 * Cron job execution context
 */
export interface CronJobContext {
    /**
     * Job name
     */
    jobName: string;

    /**
     * Execution timestamp
     */
    executedAt: Date;

    /**
     * Previous execution timestamp
     */
    previousExecution?: Date;

    /**
     * Next scheduled execution
     */
    nextExecution?: Date;
}

/**
 * Cron job execution result
 */
export interface CronJobResult<T = unknown> {
    /**
     * Whether the job executed successfully
     */
    success: boolean;

    /**
     * Result data from the job
     */
    data?: T;

    /**
     * Error if the job failed
     */
    error?: Error;

    /**
     * Execution context
     */
    context: CronJobContext;

    /**
     * Execution duration in milliseconds
     */
    duration: number;
}

/**
 * Cron job handler function type
 */
export type CronJobHandler<T = unknown> = (context: CronJobContext) => Promise<T> | T;

/**
 * Cron job metadata
 */
export interface CronJobMetadata {
    name: string;
    cronTime: CronTime;
    enabled: boolean;
    runOnInit: boolean;
    timeZone: TimeZone | string;
    lastExecution?: Date;
    nextExecution?: Date;
    executionCount: number;
    failureCount: number;
}
