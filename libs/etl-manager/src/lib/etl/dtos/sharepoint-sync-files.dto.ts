import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for syncing files from SharePoint
 */
export default class SyncSharePointFilesDto {
    @IsString()
    @IsNotEmpty()
    configId: string;

    @IsArray()
    @IsOptional()
    fileExtensions?: string[];
}
