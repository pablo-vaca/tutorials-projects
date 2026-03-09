import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for processing a SharePoint file directly to vectorstore
 */
export default class ProcessSharePointFileDto {
    @IsString()
    @IsNotEmpty()
    driveId: string;

    @IsString()
    @IsNotEmpty()
    fileId: string;
}
