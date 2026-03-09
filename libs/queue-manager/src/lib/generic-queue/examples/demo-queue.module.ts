import { Module } from '@nestjs/common';

import { GenericQueueModule } from '../index';
import { DemoJobProcessor } from './demo-job.processor';
import { DemoQueueLifecycle } from './demo-queue-lifecycle';

@Module({
    imports: [GenericQueueModule.forRoot()],
    providers: [DemoJobProcessor, DemoQueueLifecycle],
})
export class DemoQueueModule {}

export default DemoQueueModule;
