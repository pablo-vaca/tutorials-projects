import { IsNumber, Max, Min } from 'class-validator';

export default class ChunksConfigDto {
    @IsNumber()
    @Min(100)
    @Max(2000)
    chunkSize: number;

    @IsNumber()
    @Min(0)
    @Max(660)
    overlap: number;
}
