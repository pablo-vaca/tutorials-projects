import type { Buffer } from 'node:buffer';

import { IJobData } from '@deal-insights/shared-nestjs-utils';

import { S3Config, SharePointConfig } from '../schemas';
import { ImageMarkdownData, MarkdownUploadData } from '../services/etl-image-markdown.service';

/**
 * ETL-specific queue job types
 */
export enum EtlJobType {
    TEST = 'etl:test_handler',
    ETL_UPLOAD_FILE = 'etl:upload_file',
    ETL_CREATE_CHUNKS = 'etl:create_chunks',
    ETL_CREATE_EMBEDDINGS = 'etl:create_embeddings',
    ETL_MOVE_TO_VECTORSTORE = 'etl:move_to_vectorstore',
    ETL_PROCESS_FULL = 'etl:process_full',
    ETL_PROCESS_SHAREPOINT_FILE = 'etl:process_sharepoint_file',
    ETL_SHAREPOINT_DELTA_DELETE = 'etl:sharepoint_delta_delete',
    ETL_SHAREPOINT_DELTA_UPSERT = 'etl:sharepoint_delta_upsert',
    SHAREPOINT_DELTA_SYNC = 'etl:sharepoint_delta_sync',
    SHAREPOINT_DELTA_SYNC_PROJECT = 'etl:sharepoint_delta_sync_project',

    DOWNLOAD_FILE = 'etl:download_file',
    ANALYZE_FILE = 'etl:analyze_file',
    SPLIT_PAGES = 'etl:split_pages',
    GENERATE_MARKDOWNS = 'etl:generate_markdowns',
    MARKDOWN_TO_CHUNKS = 'etl:markdown_to_chunks',

    FULL_MARKDOWN_PROCESS = 'etl:full_markdown_process',
    CLEAR_PROJECT_DATA = 'etl:clear_project_data',

    PDF_DOWNLOAD_AND_SPLIT = 'etl:pdf_download_and_split',
    PDF_MARKDOWN_PROCESS = 'etl:pdf_markdown_process',
    PDF_UPLOAD_PROCESS = 'etl:pdf_upload_process',
    PDF_CHUNK_PROCESS = 'etl:pdf_chunk_process',
    PDF_LOCAL_CHUNK_PROCESS = 'etl:pdf_local_chunk_process',
}

export type SerializableBuffer = Buffer | string | { type: 'Buffer'; data: number[] };

export type DeltaSyncProjectType = {
    id: string;
    projectId: string;
    projectName: string;
    dataScope: string;
    spConfig: SharePointConfig | S3Config;
};

// This job works over all config projects, so projectId is not available
// Also, correlationId is not needed.
export interface EtlDeltaSyncForAllActiveProjectsJobData extends IJobData {
    // TODO: configId ni projectId ESTE ES EL PARIA
    ownerId: string;
}

/**
 * Base ETL job data
 */
export interface EtlJobData extends IJobData {
    projectId: string;
    correlationId: string; // used to keep track of changes that requires reprocessing
    preventChaining?: boolean; // if true prevents jobs chains
    configId?: string;
    userId?: string;
    accessToken?: string;
    dataScope?: string;
}

/**
 * Upload file job data
 * NOTE: with diferent sources we can add data to retrieve the file in the job
 * Now we just need the fileOriginId to download it
 */
export interface EtlUploadFileJobData extends EtlJobData {
    mongoFileId: string;
}
/**
 * Create chunks job data
 */
export interface EtlCreateChunksJobData extends EtlJobData {
    mongoFileId: string;
}

/**
 * Create embeddings job data
 */
export interface EtlCreateEmbeddingsJobData extends EtlJobData {
    mongoFileId: string;
    projectId: string;
    configId: string;
}

/**
 * Move to vectorstore job data
 */
export interface EtlMoveToVectorstoreJobData extends EtlJobData {
    mongoFileId: string;
}

/**
 * Process full file job data (upload + chunks + embeddings + vectorstore)
 */
export interface EtlProcessFullJobData extends EtlJobData {
    fileName: string;
    fileBuffer: SerializableBuffer;
    fileOriginId: string;
    mimeType: string;
}

/**
 * SharePoint sync job data
 */
export interface EtlSharePointSyncJobData extends EtlJobData {
    fileExtensions?: string[];
}

/**
 * Process SharePoint file job data
 */
export interface EtlProcessSharePointFileJobData extends EtlJobData {
    driveId: string;
    fileId: string;
}

/**
 * SharePoint delta delete job data
 */
export interface EtlSharePointDeltaDeleteJobData extends EtlJobData {
    fileOriginId: string;
}

/**
 * SharePoint delta upsert job data
 */
export interface EtlSharePointDeltaUpsertJobData extends EtlJobData {
    driveId: string;
    change: {
        id: string;
        name: string;
        webUrl?: string;
        size?: number;
        createdDateTime?: string;
        lastModifiedDateTime?: string;
        file?: {
            mimeType?: string;
            hashes?: {
                quickXorHash?: string;
            };
        };
    };
}

export interface EtlMarkdownBuilderJobData extends EtlJobData {
    mongoFileId: string;
    data: ImageMarkdownData;
}

export interface EtlUploadMarkdownJobData extends EtlJobData {
    mongoFileId: string;
    data: MarkdownUploadData;
}

export interface EtlChunkMarkdownJobData extends EtlJobData {
    mongoFileId: string;
    remoteId: string;
    sourceFile: string;
    pageNumber: number;
}

export interface EtlNewChunkMarkdownJobData extends EtlJobData {
    mongoFileId: string;
    remoteId: string;
    data: MarkdownUploadData;
}

export interface EtlDownloadFileJobData extends EtlJobData {
    mongoFileId: string;
}

export interface EtlAnalyzeFileJobData extends EtlJobData {
    fileName: string;
    fileSource: string;
    fileLink?: string;
    fileOriginId: string;
    fileMimeType: string;
    configId?: string;
}

export interface EtlSplitFileIntoPagesJobData extends EtlJobData {
    mongoFileId: string;
}

export interface EtlGenerateMarkdownsFromPagesJobData extends EtlJobData {
    mongoFileId: string;
    iterationQueue: string[];
    processed: string[];
}

export interface EtlIterateCreateChunksJobData extends EtlJobData {
    mongoFileId: string;
    iterationQueue: string[];
    processed: string[];
}

export interface EtlNewProcessCreateEmbeddingsJobData extends EtlJobData {
    mongoFileId: string; // placeholder
}

export interface EtlNewProcessMoveToStoreJobData extends EtlJobData {
    mongoFileId: string; // placeholder
}

export interface EtlDeltaSyncProjectJobData extends EtlJobData {
    config: DeltaSyncProjectType;
}

export interface EtlClearProjectJobData extends EtlJobData {
    type: 'RESYNC' | 'DELETE';
}
