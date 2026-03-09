import { HttpStatus } from '@nestjs/common';

import { EtlException } from './etl.exception';

/**
 * Exception thrown when a file is not found
 */
export class FileNotFoundException extends EtlException {
    /**
     *
     * @param fileId
     */
    constructor(fileId: string) {
        super(`File with ID ${fileId} not found`, HttpStatus.NOT_FOUND);
    }
}
