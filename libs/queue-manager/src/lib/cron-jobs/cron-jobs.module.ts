import { Module, DynamicModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

import {
    CRON_JOB_CONFIG_COLLECTION,
    CRON_JOB_EXECUTION_COLLECTION,
} from './constants/cron-jobs.constants';
import { CronJobsController } from './controller/cron-jobs.controller';
import { CronJobConfigSchema } from './schemas/cron-job-config.schema';
import { CronJobExecutionSchema } from './schemas/cron-job-execution.schema';
import { CronJobsService } from './services/cron-jobs.service';

export interface CronJobsModuleOptions {
    /**
     * Enable MongoDB persistence for cron job configs and execution history
     * @default false
     */
    enablePersistence?: boolean;
}

@Module({})
export class CronJobsModule {
    /**
     * Register the cron Jobs module with optional MongoDB persistence
     * This will make CronJobsService available globally
     * @param options
     */
    static forRoot(options: CronJobsModuleOptions = {}): DynamicModule {
        const { enablePersistence = false } = options;

        const imports = [ScheduleModule.forRoot()];
        const providers = [CronJobsService];

        if (enablePersistence) {
            imports.push(
                MongooseModule.forFeature([
                    {
                        name: CRON_JOB_CONFIG_COLLECTION,
                        schema: CronJobConfigSchema,
                    },
                    {
                        name: CRON_JOB_EXECUTION_COLLECTION,
                        schema: CronJobExecutionSchema,
                    },
                ])
            );
        }

        return {
            module: CronJobsModule,
            imports,
            controllers: [CronJobsController],
            providers,
            exports: [CronJobsService],
            global: true,
        };
    }

    /**
     * Register the cron Jobs module for feature modules
     * Use this if you don't want the module to be global
     * @param options
     */
    static forFeature(options: CronJobsModuleOptions = {}): DynamicModule {
        const { enablePersistence = false } = options;

        const imports = [ScheduleModule.forRoot()];
        const providers = [CronJobsService];

        if (enablePersistence) {
            imports.push(
                MongooseModule.forFeature([
                    {
                        name: CRON_JOB_CONFIG_COLLECTION,
                        schema: CronJobConfigSchema,
                    },
                    {
                        name: CRON_JOB_EXECUTION_COLLECTION,
                        schema: CronJobExecutionSchema,
                    },
                ])
            );
        }

        return {
            module: CronJobsModule,
            imports,
            controllers: [CronJobsController],
            providers,
            exports: [CronJobsService],
        };
    }
}
