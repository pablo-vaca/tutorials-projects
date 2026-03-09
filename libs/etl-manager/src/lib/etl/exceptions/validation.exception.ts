import { HttpStatus } from '@nestjs/common';

import { EtlException } from './etl.exception';

/**
 * Exception thrown when input validation fails
 */
export class ValidationException extends EtlException {
    /**
     *
     * @param message
     */
    constructor(message: string) {
        super(message, HttpStatus.BAD_REQUEST);
    }
}
