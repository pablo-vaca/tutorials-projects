import { Module, DynamicModule, Type } from '@nestjs/common';

import { MongoQueueModule } from '../mongo-queue';
import { MongoQueueBatchService } from '../mongo-queue/mongo-queue-batch.service';
import { MongoQueueService } from '../mongo-queue/mongo-queue.service';
import { BATCH_PROVIDER, QUEUE_PROVIDER } from './constants/generic-queue.constants';
import { IBatchProvider } from './interfaces/batch-provider.interface';
import { IQueueProvider } from './interfaces/queue-provider.interface';
import { GenericBatchService } from './services/generic-batch.service';
import { GenericQueueService } from './services/generic-queue.service';

export { QUEUE_PROVIDER, BATCH_PROVIDER } from './constants/generic-queue.constants';

/**
 * Configuration options for GenericQueueModule.forRoot().
 *
 * When no custom providers are supplied the module defaults to the MongoDB
 * implementation (MongoQueueService / MongoQueueBatchService) and automatically
 * imports MongoQueueModule.
 *
 * When custom providers are supplied you are responsible for passing the
 * modules they depend on via the `imports` array — MongoQueueModule will NOT
 * be imported automatically in that case.
 * @example Default (MongoDB)
 * GenericQueueModule.forRoot()
 * @example Custom provider
 * GenericQueueModule.forRoot({
 *   queueProvider: RedisQueueService,
 *   batchProvider: RedisBatchService,
 *   imports: [RedisModule],
 * })
 */
export interface GenericQueueModuleOptions {
    /** Enable batch tracking. Defaults to true. Automatically disabled when no batch provider is available. */
    enableBatches?: boolean;
    /**
     * Queue provider class implementing IQueueProvider.
     * Defaults to MongoQueueService when omitted.
     */
    queueProvider?: Type<IQueueProvider>;
    /**
     * Batch provider class implementing IBatchProvider.
     * Defaults to MongoQueueBatchService when omitted and no custom queueProvider is set.
     * When a custom queueProvider is set and batchProvider is omitted, batches are disabled.
     */
    batchProvider?: Type<IBatchProvider>;
    /**
     * Modules to import so that the chosen providers can resolve their own dependencies.
     * Defaults to [MongoQueueModule] when using default providers.
     * Defaults to [] when custom providers are supplied — you must list their modules here.
     */
    imports?: Array<Type<unknown> | DynamicModule>;
}

/**
 * Generic Queue Module - Storage-agnostic queue and batch processing.
 * Provides a reusable job queue system that can work with any provider implementation.
 *
 * Default implementation uses MongoDB (MongoQueueService + MongoQueueBatchService).
 * You can swap providers by supplying custom implementations of IQueueProvider and IBatchProvider.
 *
 * TODO: This module still imports MongoQueueModule and references MongoQueueService /
 * MongoQueueBatchService directly as default providers. While the forRoot() API already supports
 * full provider injection (queueProvider, batchProvider, imports), the default path keeps a hard
 * dependency on the mongo-queue package.
 *
 * To complete the decoupling, callers should register with explicit providers:
 *
 *   GenericQueueModule.forRoot({
 *     queueProvider: MongoQueueService,
 *     batchProvider: MongoQueueBatchService,
 *     imports: [MongoQueueModule],
 *   })
 *
 * Once all consumers are migrated to the explicit form, the default Mongo imports and the
 * usingDefaultProviders / useExisting workaround can be removed from this module, making
 * GenericQueueModule fully storage-agnostic with zero direct Mongo dependencies.
 */
@Module({})
export class GenericQueueModule {
    /**
     * Register the generic queue module.
     * @param options - Optional provider configuration. Defaults to MongoDB.
     * @returns {DynamicModule} Configured module definition
     */
    static forRoot(options?: GenericQueueModuleOptions): DynamicModule {
        const usingDefaultProviders = !options?.queueProvider;

        const queueProviderClass: Type<IQueueProvider> =
            options?.queueProvider ?? MongoQueueService;

        // Only fall back to the Mongo batch provider when the queue provider is also the default.
        // A custom queue provider without an explicit batch provider means batches are unavailable.
        const batchProviderClass: Type<IBatchProvider> | null =
            options?.batchProvider ?? (usingDefaultProviders ? MongoQueueBatchService : null);

        // Same rule for module imports: default to MongoQueueModule only when using default providers.
        const moduleImports: Array<Type<unknown> | DynamicModule> =
            options?.imports ?? (usingDefaultProviders ? [MongoQueueModule] : []);

        const enableBatches = (options?.enableBatches ?? true) && !!batchProviderClass;

        return {
            module: GenericQueueModule,
            imports: moduleImports,
            providers: [
                // Queue Provider
                // useExisting for defaults: reuse the instance already created by the imported
                // MongoQueueModule rather than re-instantiating (which would fail because Mongoose
                // model tokens are internal to MongoQueueModule and not re-exported).
                // useClass for custom providers: NestJS creates the instance here, relying on the
                // caller-supplied imports to expose the provider's own dependencies.
                usingDefaultProviders
                    ? { provide: QUEUE_PROVIDER, useExisting: queueProviderClass }
                    : { provide: QUEUE_PROVIDER, useClass: queueProviderClass },
                {
                    provide: GenericQueueService,
                    useFactory: (queueProvider: IQueueProvider) =>
                        new GenericQueueService(queueProvider),
                    inject: [QUEUE_PROVIDER],
                },
                // Batch Provider (if enabled)
                ...(enableBatches
                    ? [
                          usingDefaultProviders
                              ? { provide: BATCH_PROVIDER, useExisting: batchProviderClass! }
                              : { provide: BATCH_PROVIDER, useClass: batchProviderClass! },
                          {
                              provide: GenericBatchService,
                              useFactory: (batchProvider: IBatchProvider) =>
                                  new GenericBatchService(batchProvider),
                              inject: [BATCH_PROVIDER],
                          },
                      ]
                    : [
                          {
                              provide: GenericBatchService,
                              useFactory: () => new GenericBatchService(),
                          },
                      ]),
            ],
            exports: [GenericQueueService, GenericBatchService, QUEUE_PROVIDER, BATCH_PROVIDER],
            global: true,
        };
    }
}
