import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for ETL domain exceptions
 */
export class EtlException extends HttpException {
    /**
     *
     * @param message
     * @param status
     */
    constructor(message: string, status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR) {
        super(message, status);
    }
}
