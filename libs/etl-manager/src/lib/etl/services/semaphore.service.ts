
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { RandomFloat } from '../../shared/utils/random.utils';
import { Semaphore, SemaphoreDocument } from '../schemas/semaphore.schema';

type AcquireResult = {
    acquired: boolean;
    token?: string;
    ownerId?: string;
    expiresAt?: Date;
    reason?: string;
};

@Injectable()
export class SemaphoreService {
    private readonly logger = new Logger(SemaphoreService.name);

    private readonly ttlMs: number;

    private maxRetries: number;

    private readonly retryDelayMs: number;

    /**
     * @param {Model<SemaphoreDocument>} semaphoreModel - The mongoDB model for a semaphore
     * @param semaphoreModel
     * @param {Logger} logger
     */
    constructor(
        @InjectModel(Semaphore.name)
        private readonly semaphoreModel: Model<SemaphoreDocument>,) {
        this.ttlMs = 120_000; // 30 second should come from env variable
        this.maxRetries = 2;
        this.retryDelayMs = 10_000; // 5 seconds
    }

    /**
     *
     * @param resource
     * @param processType
     * @param ownerId
     * @param doRetry
     */
    // eslint-disable-next-line max-lines-per-function
    async acquire(
        resource: string,
        processType: string,
        ownerId: string,
        doRetry = true
    ): Promise<AcquireResult> {
        this.logger.debug(
            `[SEMAPHORE] - Acquiring: ${resource} - process: ${processType} - owner: ${ownerId}`
        );
        const token = uuidv4();
        const now = this.now();
        const newExpires = this.expiresAtFromNow();

        // Query: queremos modificar solo si no existe o si expiró
        const filter = {
            resource,
            processType,
            $or: [
                { expiresAt: { $lte: now } }, // expired
            ],
        };

        // Update to set lock owner
        const update = {
            $set: {
                ownerId,
                token,
                lockedAt: now,
                expiresAt: newExpires,
                resource,
                processType,
            },
        };

        if (!doRetry) {
            this.maxRetries = 1;
        }

        // Retry loop to handle races and duplicate-key upserts
        /* eslint-disable no-await-in-loop */
        for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
            try {
                // upsert: true -> will attempt to insert if no doc matches filter; unique index avoids creating duplicate for same resource+processType
                const res = await this.semaphoreModel
                    .findOneAndUpdate(filter, update, {
                        upsert: true,
                        new: true, // return the document after update
                        setDefaultsOnInsert: true,
                    })
                    .lean();

                if (res) {
                    // If the returned doc's token matches ours => we acquired it.
                    // Note: when the upsert inserted a new doc, it will have our token.
                    if ((res as any).token === token || (res as any).ownerId === ownerId) {
                        return { acquired: true, token, ownerId, expiresAt: newExpires };
                    }
                    // In some rare race/resolution, we got back an existing non-expired doc (shouldn't normally happen).
                    return {
                        acquired: false,
                        reason: 'locked_by_other',
                        ownerId: res.ownerId,
                        expiresAt: res.expiresAt,
                    };
                }
                // null means the filter didn't match and upsert didn't create (in some drivers), treat as locked by other
                // Read current lock to give caller context
                const existing = await this.semaphoreModel
                    .findOne({ resource, processType })
                    .lean();
                if (existing) {
                    // still locked by someone else and not expired
                    return {
                        acquired: false,
                        reason: 'locked_by_other',
                        ownerId: existing.ownerId,
                        expiresAt: existing.expiresAt,
                    };
                }
                // no doc found - try again in loop
                // fallthrough to retry
            } catch (err: any) {
                // If duplicate key error happened (race on unique index), retry a bit
                if (err && err.code === 11000) {
                    // race - wait and retry
                    await this.sleep(
                        this.retryDelayMs + Math.floor(RandomFloat.getRandomFloat() * 50)
                    );
                } else {
                    // Unexpected error -> return as failure with reason
                    return { acquired: false, reason: `error:${err.message ?? err.toString()}` };
                }
            }

            // small delay before retrying
            if (doRetry) {
                await this.sleep(this.retryDelayMs + Math.floor(RandomFloat.getRandomFloat() * 50));
            }
        }

        // Last attempt failed: read current lock for info
        const currentExisting = await this.semaphoreModel.findOne({ resource, processType }).lean();
        if (currentExisting) {
            return {
                acquired: false,
                reason: 'locked_by_other',
                ownerId: currentExisting.ownerId,
                expiresAt: currentExisting.expiresAt,
            };
        }
        return { acquired: false, reason: 'unknown' };
    }

    /**
     * Release a lock
     * @param resource
     * @param processType
     * @param ownerId
     * @param token
     */
    async release(
        resource: string,
        processType: string,
        ownerId: string,
        token: string
    ): Promise<{ released: boolean; reason?: string }> {
        try {
            const res = await this.semaphoreModel
                .findOneAndDelete({ resource, processType, ownerId, token })
                .lean();
            if (res) {
                return { released: true };
            }
            // no match: puede que haya expirado o que no pertenezca al owner
            const current = await this.semaphoreModel.findOne({ resource, processType }).lean();
            if (!current) {
                return { released: false, reason: 'no_lock_present' };
            }
            if (current.ownerId !== ownerId || current.token !== token) {
                return { released: false, reason: 'not_owner' };
            }
            return { released: false, reason: 'unknown' };
        } catch (err: any) {
            return { released: false, reason: `error:${err.message ?? err.toString()}` };
        }
    }

    /**
     *
     * @param resource
     * @param processType
     */
    async isLocked(resource: string, processType: string) {
        const now = this.now();
        // limpiar locks expirados no es estrictamente necesario porque expiración se chequea aquí
        const lock = await this.semaphoreModel
            .findOne({ resource, processType, expiresAt: { $gt: now } })
            .lean();
        if (!lock) {
            return { locked: false };
        }
        return { locked: true, ownerId: lock.ownerId, expiresAt: lock.expiresAt };
    }

    /**
     *
     * @param resource
     * @param processType
     */
    async forceRelease(resource: string, processType: string) {
        await this.semaphoreModel.deleteOne({ resource, processType });
        return { forced: true };
    }

    /**
     *
     * @param resource
     * @param processType
     * @param ownerId
     * @param token
     */
    async refresh(
        resource: string,
        processType: string,
        ownerId: string,
        token: string
    ): Promise<{ refreshed: boolean; expiresAt?: Date; reason?: string }> {
        const now = this.now();
        const newExpires = this.expiresAtFromNow();
        try {
            const res = await this.semaphoreModel
                .findOneAndUpdate(
                    { resource, processType, ownerId, token, expiresAt: { $gt: now } }, // only if still valid and owner matches
                    { $set: { expiresAt: newExpires } },
                    { new: true }
                )
                .lean();
            if (res) {
                return { refreshed: true, expiresAt: res.expiresAt };
            }
            const existing = await this.semaphoreModel.findOne({ resource, processType }).lean();
            if (!existing) {
                return { refreshed: false, reason: 'no_lock_present' };
            }
            if (existing.ownerId !== ownerId || existing.token !== token) {
                return { refreshed: false, reason: 'not_owner' };
            }
            return { refreshed: false, reason: 'expired' };
        } catch (err: any) {
            return { refreshed: false, reason: `error:${err.message ?? err.toString()}` };
        }
    }

    /**
     *
     */
    private now() {
        return new Date();
    }

    /**
     *
     */
    private expiresAtFromNow() {
        return new Date(Date.now() + this.ttlMs);
    }

    /**
     *
     * @param ms
     */
    private sleep(ms: number) {
        return new Promise((res) => {
            setTimeout(res, ms);
        });
    }
}
