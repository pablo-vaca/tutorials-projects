import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for listing SharePoint files
 */
export default class ListSharePointFilesDto {
    @IsString()
    @IsNotEmpty()
    siteId: string;

    @IsString()
    @IsNotEmpty()
    driveId: string;

    @IsString()
    @IsOptional()
    folderId?: string;
}
