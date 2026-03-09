import { IJobData, IJobResult, QueueJob } from '@deal-insights/shared-nestjs-utils';

import { EtlConfigDocument } from '../schemas';

export interface ISingleEtlHandler<T extends IJobData> {
    handle(job: QueueJob<T>, etlConfig?: EtlConfigDocument): Promise<IJobResult>;
}
