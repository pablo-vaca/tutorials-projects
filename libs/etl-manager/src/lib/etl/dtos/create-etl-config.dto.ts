import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, ValidateNested } from 'class-validator';

import ChunksConfigDto from './chunks-config.dto';
import EmbeddingsConfigDto from './embeddings-config.dto';

/**
 * DTO for creating a new ETL configuration
 */
export default class CreateEtlConfigDto {
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @IsString()
    @IsNotEmpty()
    projectName: string;

    @IsString()
    @IsNotEmpty()
    dataScope: string;

    @IsUrl()
    @IsNotEmpty()
    sharepointUrl: string;

    @IsString()
    @IsNotEmpty()
    sharepointTennantId: string;

    @IsString()
    @IsNotEmpty()
    sharepointFolder: string;

    @ValidateNested()
    @Type(() => ChunksConfigDto)
    chunksConfig: ChunksConfigDto;

    @ValidateNested()
    @Type(() => EmbeddingsConfigDto)
    embeddingsConfig: EmbeddingsConfigDto;
}
