import { HttpStatus } from '@nestjs/common';

import { EtlException } from './etl.exception';

/**
 * Exception thrown when external API calls fail
 */
export class ExternalApiException extends EtlException {
    /**
     *
     * @param message
     * @param status
     */
    constructor(message: string, status?: HttpStatus) {
        super(`External API error: ${message}`, status || HttpStatus.BAD_GATEWAY);
    }
}
