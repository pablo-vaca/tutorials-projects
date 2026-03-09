import { Schema } from 'mongoose';

import { CRON_JOB_CONFIG_COLLECTION } from '../constants/cron-jobs.constants';

export const CronJobConfigSchema = new Schema(
    {
        name: { type: String, required: true, unique: true, index: true },
        cronTime: { type: String, required: true },
        enabled: { type: Boolean, default: true, index: true },
        runOnInit: { type: Boolean, default: false },
        timeZone: { type: String, default: 'America/New_York' },
        lastExecution: { type: Date, default: null },
        nextExecution: { type: Date, default: null },
        executionCount: { type: Number, default: 0 },
        failureCount: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
    },
    {
        collection: CRON_JOB_CONFIG_COLLECTION,
        timestamps: true,
    }
);

// Indexes for efficient queries
CronJobConfigSchema.index({ enabled: 1, nextExecution: 1 });
CronJobConfigSchema.index({ createdAt: -1 });
