export interface SharePointConfig {
    url: string;
    tenantId: string;
    driveId: string;
    folderId?: string;
    siteId?: string;
    listId?: string;
    deltaLink?: string;
    cronSchedule?: string; // Cron expression for delta sync (e.g., "*/5 * * * *")
}

export interface S3Config {
    bucket: string;
    region: string;
    prefix: string;
    accessKeyId: string;
}

export interface LocalConfig {
    /**
     * Absolute or workspace-relative path to the local folder containing source documents.
     * fileOriginId will be interpreted as a path relative to this rootPath.
     */
    rootPath: string;
}

export enum DataSourceType {
    SharePoint = 'SharePoint',
    S3 = 'S3',
    Local = 'Local',
}

export interface SharePointFileSource {
    title: string;
    link: string;
}
