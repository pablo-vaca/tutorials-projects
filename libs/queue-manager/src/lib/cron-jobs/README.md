# Cron Utils

Generic cron utilities for NestJS applications using `@nestjs/schedule`.

## Features

- **Dynamic Cron Job Registration**: Register cron jobs at runtime
- **Job Management**: Start, stop, enable, disable, and update cron jobs
- **Execution Tracking**: Track execution count, failures, and metadata
- **Manual Execution**: Execute cron jobs on demand
- **Flexible Scheduling**: Support for cron expressions, predefined schedules, and custom timezones
- **Error Handling**: Built-in error handling and logging
- **Type-Safe**: Fully typed with TypeScript
- **MongoDB Persistence** (Optional):
  - Persistent job configurations across restarts
  - Complete execution history tracking
  - Job statistics and analytics
  - Execution auditing

## Installation

The module is part of the `@deal-insights/nestjs-utils` package. Make sure you have
`@nestjs/schedule` installed:

```bash
npm install @nestjs/schedule
```

## Setup

### 1. Import the Module (Basic - In-Memory Mode)

Import `CronUtilsModule` in your application module:

```typescript
import { Module } from '@nestjs/common';
import { CronUtilsModule } from '@deal-insights/nestjs-utils';

@Module({
  imports: [
    CronUtilsModule.forRoot(), // Global registration (in-memory only)
  ],
})
export class AppModule {}
```

### 1b. Import with MongoDB Persistence (Optional)

For persistent job configs and execution history:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CronUtilsModule } from '@deal-insights/nestjs-utils';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/your-database'),
    CronUtilsModule.forRoot({ enablePersistence: true }),
  ],
})
export class AppModule {}
```

**See [MONGODB_USAGE.md](./MONGODB_USAGE.md) for detailed MongoDB setup and features.**

### 2. Inject the Service

Inject `CronUtilsService` into your services:

```typescript
import { Injectable } from '@nestjs/common';
import { CronUtilsService } from '@deal-insights/nestjs-utils';

@Injectable()
export class MyService {
  constructor(private readonly cronUtilsService: CronUtilsService) {}
}
```

## Usage

### Basic Cron Job Registration

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { CronUtilsService } from '@deal-insights/nestjs-utils';

@Injectable()
export class MyService implements OnModuleInit {
  constructor(private readonly cronUtilsService: CronUtilsService) {}

  async onModuleInit() {
    await this.cronUtilsService.registerCronJob(
      {
        name: 'my-job',
        cronTime: CronExpression.EVERY_5_MINUTES,
        runOnInit: false,
        enabled: true,
        timeZone: 'America/New_York',
      },
      async (context) => {
        console.log('Job executed at:', context.executedAt);
        // Your job logic here
        return { success: true };
      }
    );
  }
}
```

### Custom Cron Expression

```typescript
await this.cronUtilsService.registerCronJob(
  {
    name: 'daily-cleanup',
    cronTime: '0 2 * * *', // Every day at 2 AM
    timeZone: 'America/New_York',
  },
  async (context) => {
    // Cleanup logic
  }
);
```

### Managing Cron Jobs

```typescript
// Start a job
this.cronUtilsService.startCronJob('my-job');

// Stop a job
this.cronUtilsService.stopCronJob('my-job');

// Enable a job
this.cronUtilsService.enableCronJob('my-job');

// Disable a job
this.cronUtilsService.disableCronJob('my-job');

// Remove a job
await this.cronUtilsService.removeCronJob('my-job');
```

### Update Cron Schedule

```typescript
// Change the schedule of an existing job
this.cronUtilsService.updateCronSchedule('my-job', CronExpression.EVERY_HOUR);
```

### Manual Execution

```typescript
// Execute a job manually
const result = await this.cronUtilsService.executeCronJob('my-job');

if (result.success) {
  console.log('Job completed:', result.data);
  console.log('Duration:', result.duration, 'ms');
} else {
  console.error('Job failed:', result.error);
}
```

### Get Job Metadata

```typescript
// Get metadata for a specific job
const metadata = this.cronUtilsService.getJobMetadata('my-job');
console.log('Execution count:', metadata.executionCount);
console.log('Failure count:', metadata.failureCount);
console.log('Last execution:', metadata.lastExecution);
console.log('Next execution:', metadata.nextExecution);

// Get all job metadata
const allJobs = this.cronUtilsService.getAllJobMetadata();
allJobs.forEach((metadata, name) => {
  console.log(`Job: ${name}`, metadata);
});

// Get all job names
const jobNames = this.cronUtilsService.getAllJobNames();
console.log('Registered jobs:', jobNames);
```

### Check Job Existence

```typescript
if (this.cronUtilsService.jobExists('my-job')) {
  console.log('Job exists');
}
```

### Get Next Execution Time

```typescript
const nextExecution = this.cronUtilsService.getNextExecution('my-job');
console.log('Next execution:', nextExecution);
```

## MongoDB Persistence Features

When persistence is enabled, you get access to additional methods:

### View Execution History

```typescript
// Get last 100 executions for a job
const history = await this.cronUtilsService.getExecutionHistory('my-job', 100);

history.forEach((execution) => {
  console.log(`
    Executed: ${execution.executedAt}
    Duration: ${execution.duration}ms
    Success: ${execution.success}
  `);
});
```

### Get Job Statistics

```typescript
const stats = await this.cronUtilsService.getExecutionStats('my-job');

if (stats) {
  console.log('Total Executions:', stats.totalExecutions);
  console.log('Successful:', stats.successfulExecutions);
  console.log('Failed:', stats.failedExecutions);
  console.log('Average Duration:', stats.averageDuration, 'ms');
}
```

### Load Saved Jobs on Startup

```typescript
async onModuleInit() {
  const savedConfigs = await this.cronUtilsService.loadJobConfigsFromDatabase();

  for (const config of savedConfigs) {
    await this.cronUtilsService.registerCronJob(
      config,
      this.getHandlerForJob(config.name),
    );
  }
}
```

### Cleanup Old History

```typescript
// Clean up execution records older than 30 days
const deletedCount = await this.cronUtilsService.cleanupExecutionHistory(undefined, 30);
console.log(`Cleaned up ${deletedCount} old records`);
```

**For complete MongoDB documentation, see [MONGODB_USAGE.md](./MONGODB_USAGE.md)**

## Predefined Cron Expressions

The `@nestjs/schedule` package provides predefined expressions:

- `CronExpression.EVERY_SECOND` - Every second
- `CronExpression.EVERY_5_SECONDS` - Every 5 seconds
- `CronExpression.EVERY_10_SECONDS` - Every 10 seconds
- `CronExpression.EVERY_30_SECONDS` - Every 30 seconds
- `CronExpression.EVERY_MINUTE` - Every minute
- `CronExpression.EVERY_5_MINUTES` - Every 5 minutes
- `CronExpression.EVERY_10_MINUTES` - Every 10 minutes
- `CronExpression.EVERY_30_MINUTES` - Every 30 minutes
- `CronExpression.EVERY_HOUR` - Every hour
- `CronExpression.EVERY_DAY_AT_MIDNIGHT` - Every day at midnight
- `CronExpression.EVERY_DAY_AT_NOON` - Every day at noon
- `CronExpression.EVERY_WEEK` - Every week
- `CronExpression.EVERY_WEEKDAY` - Every weekday
- `CronExpression.EVERY_WEEKEND` - Every weekend
- `CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT` - First day of month at midnight
- `CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_NOON` - First day of month at noon

## Cron Expression Format

```
* * * * * *
│ │ │ │ │ │
│ │ │ │ │ └── day of week (0-7) (0 or 7 is Sunday)
│ │ │ │ └──── month (1-12)
│ │ │ └────── day of month (1-31)
│ │ └──────── hour (0-23)
│ └────────── minute (0-59)
└──────────── second (0-59, optional)
```

### Examples

- `0 0 * * *` - Every day at midnight
- `0 */2 * * *` - Every 2 hours
- `0 9 * * 1-5` - Every weekday at 9 AM
- `0 0 1 * *` - First day of every month at midnight
- `*/15 * * * *` - Every 15 minutes

## Error Handling

The service automatically catches and logs errors. You can access error information through the
execution result:

```typescript
const result = await this.cronUtilsService.executeCronJob('my-job');

if (!result.success) {
  console.error('Job failed:', result.error);
  console.log('Duration before failure:', result.duration, 'ms');
}
```

## Types

### CronJobConfig

```typescript
interface CronJobConfig {
  name: string;
  cronTime: string | Date | CronExpression;
  runOnInit?: boolean;
  timeZone?: string;
  enabled?: boolean;
}
```

### CronJobContext

```typescript
interface CronJobContext {
  jobName: string;
  executedAt: Date;
  previousExecution?: Date;
  nextExecution?: Date;
}
```

### CronJobResult

```typescript
interface CronJobResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  context: CronJobContext;
  duration: number;
}
```

### CronJobMetadata

```typescript
interface CronJobMetadata {
  name: string;
  cronTime: CronTime;
  enabled: boolean;
  runOnInit: boolean;
  timeZone: string;
  lastExecution?: Date;
  nextExecution?: Date;
  executionCount: number;
  failureCount: number;
}
```

## Best Practices

1. **Use Meaningful Job Names**: Use descriptive names for your cron jobs
2. **Handle Errors**: Always handle errors in your job handlers
3. **Set Appropriate Timezones**: Specify the correct timezone for your jobs
4. **Monitor Execution**: Use metadata to monitor job execution and failures
5. **Clean Up Jobs**: Remove jobs that are no longer needed
6. **Test Manually**: Use manual execution to test jobs before scheduling

## Examples

See [usage-examples.ts](./examples/usage-examples.ts) for comprehensive examples including:

- Basic cron job registration
- Data processing jobs
- Dynamic job management
- Cleanup and backup jobs
- Manual execution
- Report generation
- MongoDB persistence features

## Documentation

- [MONGODB_USAGE.md](./MONGODB_USAGE.md) - Complete MongoDB setup and usage guide
- [usage-examples.ts](./examples/usage-examples.ts) - Comprehensive code examples

## License

MIT
