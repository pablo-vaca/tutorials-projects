import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import {
    MONGO_QUEUE_COLLECTION,
    MONGO_QUEUE_BATCH_COLLECTION,
} from './constants/mongo-queue.constants';
import { MongoQueueBatchService } from './mongo-queue-batch.service';
import { MongoQueueUtilsService } from './mongo-queue-utils.service';
import { MongoQueueService } from './mongo-queue.service';
import { CronJobsModule, CronJobsService, CronTimeExpression, TimeZone } from '../cron-jobs';
import { BatchSchema } from './schemas/batch.schema';
import { QueueSchema } from './schemas/queue.schema';

@Module({
    imports: [
        CronJobsModule.forRoot({ enablePersistence: true }),
        MongooseModule.forFeature([
            {
                name: MONGO_QUEUE_COLLECTION,
                schema: QueueSchema,
            },
            {
                name: MONGO_QUEUE_BATCH_COLLECTION,
                schema: BatchSchema,
            },
        ]),
    ],
    providers: [MongoQueueService, MongoQueueUtilsService, MongoQueueBatchService],
    exports: [MongoQueueService, MongoQueueUtilsService, MongoQueueBatchService],
})
export class MongoQueueModule {
    private readonly logger = new Logger(MongoQueueModule.name);

    /**
     *
     * @param mongoQueueService
     * @param configService
     * @param cronJobsService
     */
    constructor(
        private readonly mongoQueueService: MongoQueueService,
        private readonly configService: ConfigService,
        private readonly cronJobsService: CronJobsService
    ) {}

    /**
     *
     */
    async onModuleInit() {
        const cronSchedule = this.configService.get<string>('JOB_CLEANER_CRON');
        const isEnabled = !!cronSchedule;

        if (isEnabled) {
            this.logger.log(`Job Cleaner Cron: ENABLED (Schedule: ${cronSchedule})`);
        } else {
            this.logger.log('Job Cleaner Cron: DISABLED');
        }

        await this.cronJobsService.registerCronJob(
            {
                name: 'job-cleaner-sync',
                cronTime: cronSchedule || CronTimeExpression.EVERY_HOUR, // Fallback for registration
                runOnInit: true,
                enabled: isEnabled,
                timeZone: TimeZone.AMERICA_NEW_YORK,
            },
            async (context) => {
                this.mongoQueueService.clean();
                return {
                    message: '[JOB CLEANER] - completed jobs had beed cleaned',
                    executedAt: context.executedAt,
                };
            }
        );
    }
}
