export enum FileProcessingStrategy {
    BASE = 'BASE',
    PBP_SPLIT_FILE = 'PBP_SPLIT_FILE', // page-by-page split and process
}

export enum ChunkingStrategy {
    BASE = FileProcessingStrategy.BASE,
    PBP_SPLIT_FILE = FileProcessingStrategy.PBP_SPLIT_FILE,
}
