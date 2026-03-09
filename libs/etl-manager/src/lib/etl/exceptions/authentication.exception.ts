import { HttpStatus } from '@nestjs/common';

import { EtlException } from './etl.exception';

/**
 * Exception thrown when authentication/authorization fails
 */
export class AuthenticationException extends EtlException {
    /**
     *
     * @param message
     */
    constructor(message = 'Authentication required') {
        super(message, HttpStatus.UNAUTHORIZED);
    }
}
