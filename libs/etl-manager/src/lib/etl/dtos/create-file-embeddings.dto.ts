import { IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';

export class CreateFileEmbeddingsDto {
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @IsNumber()
    @Min(100)
    @Max(2000)
    chunkSize: number;

    @IsNumber()
    @Min(0)
    @Max(660)
    overlap: number;

    @IsString()
    @IsNotEmpty()
    deploymentId: string;

    @IsString()
    @IsNotEmpty()
    user: string;

    @IsString()
    @IsNotEmpty()
    model: string;
}
