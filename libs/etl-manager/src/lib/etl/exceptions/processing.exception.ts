import { HttpStatus } from '@nestjs/common';

import { EtlException } from './etl.exception';

/**
 * Exception thrown when file processing fails
 */
export class ProcessingException extends EtlException {
    /**
     *
     * @param message
     */
    constructor(message: string) {
        super(`Processing failed: ${message}`, HttpStatus.UNPROCESSABLE_ENTITY);
    }
}
