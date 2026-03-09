import { IsNotEmpty, IsString } from 'class-validator';

export default class EmbeddingsConfigDto {
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
