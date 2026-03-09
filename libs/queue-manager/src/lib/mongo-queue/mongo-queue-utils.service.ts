import { randomBytes } from 'crypto';

import { Injectable } from '@nestjs/common';

@Injectable()
export class MongoQueueUtilsService {
    private readonly random = randomBytes;

    private readonly dateSource = () => new Date();

    /**
     * Generates a random hexadecimal identifier suitable for queue ACK tokens.
     * @returns {string} Hex encoded identifier
     */
    id(): string {
        return this.random(16).toString('hex');
    }

    /**
     * Provides the current timestamp using the configured date source.
     * @returns {Date} Current timestamp
     */
    now(): Date {
        return this.dateSource();
    }

    /**
     * Calculates a timestamp offset by the provided number of seconds.
     * @param {number} seconds - Offset in seconds to apply
     * @returns {Date} Future timestamp adjusted by the offset
     */
    nowPlusSeconds(seconds: number): Date {
        return new Date(this.now().getTime() + seconds * 1000);
    }
}
