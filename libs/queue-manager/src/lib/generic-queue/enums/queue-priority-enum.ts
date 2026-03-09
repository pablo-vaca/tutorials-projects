export enum QueuePriorityEnum {
    LOWEST = 1,
    LOW = 2,
    MEDIUM = 3,
    HIGH = 4,
    HIGHEST = 5,
}

export enum QueueStatusEnum {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    PAUSED = 'paused',
}
