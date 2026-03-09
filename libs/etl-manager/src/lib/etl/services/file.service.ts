import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { SUPPORTED_MIME_TYPES } from '../../shared/constants/shared.const';
import { Chunk, ChunkDocument } from '../schemas';
import { File, FileDocument } from '../schemas/file.schema';

@Injectable()
export default class FileService {
    /**
     * @param FileModel the Moongose model for files
     * @param ChunkModel
     */
    constructor(
        @InjectModel(File.name) private readonly FileModel: Model<FileDocument>,
        @InjectModel(Chunk.name) private readonly ChunkModel: Model<ChunkDocument>
    ) {}

    /**
     *
     * @param fileData
     */
    async createFile(fileData: Partial<File>): Promise<FileDocument> {
        const newFile = new this.FileModel(fileData);
        return newFile.save();
    }

    /**
     *
     * @param id
     */
    async findById(id: string): Promise<FileDocument | null> {
        return this.FileModel.findById(id).exec();
    }

    /**
     *
     * @param remoteId
     */
    async findByRemoteId(remoteId: string): Promise<FileDocument | null> {
        return this.FileModel.findOne({ remoteId }).exec();
    }

    /**
     * Finds a file by its origin ID (e.g., SharePoint file ID)
     * Useful for detecting duplicates and handling updates
     * @param fileOriginId
     */
    async findByFileOriginId(fileOriginId: string): Promise<FileDocument | null> {
        return this.FileModel.findOne({ fileOriginId }).exec();
    }

    /**
     *
     * @param fileOriginId
     * @param projectId
     */
    async findByFileOriginIdAndProjectId(
        fileOriginId: string,
        projectId: string
    ): Promise<FileDocument | null> {
        return this.FileModel.findOne({ fileOriginId, projectId }).exec();
    }

    /**
     * Updates document file
     * @param id
     * @param update
     * @param pages
     */
    async updatePagesToProcess(id: string, pages: number): Promise<FileDocument | null> {
        const update: Record<string, unknown> = {
            'pagesToProcess.total': pages,
            'pagesToProcess.processed': 0,
        };
        return this.FileModel.findByIdAndUpdate(id, update, { new: true }).exec();
    }

    /**
     * Updates document file
     * @param id
     * @param update
     */
    async updateTotalPagesProcessed(id: string): Promise<FileDocument | null> {
        const update: Record<string, unknown> = { $inc: { 'pagesToProcess.processed': 1 } };
        return this.FileModel.findByIdAndUpdate(id, update, { new: true }).exec();
    }

    /**
     *
     * @param id
     * @param status
     * @param errorMessage
     */
    async updateStatus(
        id: string,
        status: File['processingStatus'],
        errorMessage?: string
    ): Promise<FileDocument | null> {
        const update: Record<string, unknown> = { processingStatus: status };
        if (errorMessage) {
            update.errorMessage = errorMessage;
        }
        update.$push = {
            history: { action: `status_changed_to_${status}`, timestamp: new Date() },
        };
        return this.FileModel.findByIdAndUpdate(id, update, { new: true }).exec();
    }

    /**
     * Syncs the file's chunks array by querying all chunks that reference this file.
     * @param id - The file ID
     */
    async syncChunks(id: string): Promise<FileDocument | null> {
        const chunks = await this.ChunkModel.find(
            { fileId: new Types.ObjectId(id) },
            { _id: 1 }
        ).exec();

        // eslint-disable-next-line no-underscore-dangle
        const chunkIds = chunks.map((chunk) => chunk._id);

        return this.FileModel.findByIdAndUpdate(
            id,
            {
                $set: { chunks: chunkIds },
                $push: { history: { action: 'chunks_synced', timestamp: new Date() } },
            },
            { new: true }
        ).exec();
    }

    /**
     *
     * @param id
     */
    async markEmbeddingsStored(id: string): Promise<FileDocument | null> {
        return this.FileModel.findByIdAndUpdate(
            id,
            {
                embeddingsStored: true,
                $push: { history: { action: 'embeddings_stored', timestamp: new Date() } },
            },
            { new: true }
        ).exec();
    }

    /**
     * Updates the projectId for a file
     * @param id
     * @param projectId
     */
    async updateProjectId(id: string, projectId: string): Promise<FileDocument | null> {
        return this.FileModel.findByIdAndUpdate(id, { projectId }, { new: true }).exec();
    }

    /**
     * Updates the projectId for a file
     * @param id
     * @param projectId
     * @param storageFilename
     * @param fileSize
     */
    async updateStorageFilename(
        id: string,
        storageFilename: string,
        fileSize: number
    ): Promise<FileDocument | null> {
        return this.FileModel.findByIdAndUpdate(
            id,
            { storageFilename, fileSize },
            { new: true }
        ).exec();
    }

    /**
     * Updates the projectId for a file
     * @param id
     * @param projectId
     * @param remoteId
     */
    async updateRemoteId(id: string, remoteId: string): Promise<FileDocument | null> {
        return this.FileModel.findByIdAndUpdate(id, { remoteId }, { new: true }).exec();
    }

    /**
     * Updates an existing file with analyze payload for reprocessing (upsert path).
     * Resets status to 'created' and pushes history so the pipeline can continue.
     * @param id - File document ID
     * @param data - Analyze payload (fileName, fileLink, fileOriginId, remoteId, fileSource, sourceData, mimeType)
     * @param data.fileName
     * @param data.fileOriginId
     * @param data.remoteId
     * @param data.fileSource
     * @param data.sourceData
     * @param data.sourceData.title
     * @param data.sourceData.link
     * @param data.mimeType
     */
    async updateFileForAnalyze(
        id: string,
        data: {
            fileName: string;
            fileOriginId: string;
            remoteId: string;
            fileSource: string;
            sourceData: { title?: string; link?: string };
            mimeType: string;
        }
    ): Promise<FileDocument | null> {
        return this.FileModel.findByIdAndUpdate(
            id,
            {
                $set: {
                    fileName: data.fileName,
                    fileOriginId: data.fileOriginId,
                    remoteId: data.remoteId,
                    fileSource: data.fileSource,
                    sourceData: data.sourceData,
                    mimeType: data.mimeType,
                    processingStatus: 'created' as File['processingStatus'],
                },
                $unset: { errorMessage: 1 },
                $push: { history: { action: 'reprocess_analyze', timestamp: new Date() } },
            },
            { new: true }
        ).exec();
    }

    /**
     *
     * @param status
     */
    async findByStatus(status: File['processingStatus']): Promise<FileDocument[]> {
        return this.FileModel.find({ processingStatus: status }).exec();
    }

    /**
     *
     * @param userId
     */
    async findByUser(userId: string): Promise<FileDocument[]> {
        return this.FileModel.find({ userId }).exec();
    }

    // Aggregation example: count files by status
    /**
     *
     */
    async getStatusCounts(): Promise<{ _id: string; count: number }[]> {
        return this.FileModel.aggregate([
            { $group: { _id: '$processingStatus', count: { $sum: 1 } } },
        ]).exec();
    }

    /**
     * Count completed document files for a project
     * @param projectId - Project ID to filter files
     * @returns Count of completed document files
     */
    async countCompletedDocumentsByProjectId(projectId: string): Promise<number> {
        return this.FileModel.countDocuments({
            projectId,
            processingStatus: 'completed',
            mimeType: { $in: SUPPORTED_MIME_TYPES },
        }).exec();
    }

    /**
     * Count all documents for a project regardless of MIME type
     * @param projectId - Project ID to filter files
     * @returns Total count of documents uploaded
     */
    async countAllDocumentsByProjectId(projectId: string): Promise<number> {
        return this.FileModel.countDocuments({ projectId }).exec();
    }

    /**
     * Deletes a file by its ID
     * @param id
     */
    async deleteById(id: string): Promise<FileDocument | null> {
        return this.FileModel.findByIdAndDelete(id).exec();
    }

    /**
     * Deletes all files for a specific project
     * @param projectId - The project ID
     * @returns {Promise<{ deletedCount: number }>} The number of deleted files
     */
    async deleteByProjectId(projectId: string): Promise<{ deletedCount: number }> {
        const result = await this.FileModel.deleteMany({ projectId }).exec();
        return { deletedCount: result.deletedCount || 0 };
    }

    /**
     * Finds all files for a specific project
     * @param projectId - The project ID
     * @returns {Promise<FileDocument[]>} Array of file documents
     */
    async findByProjectId(projectId: string): Promise<FileDocument[]> {
        return this.FileModel.find({ projectId }).exec();
    }

    /**
     * Get file status counts for a specific project
     * @param projectId - Project ID to filter files
     * @returns Array of status counts
     */
    async getFileStatusCountsByProjectId(
        projectId: string
    ): Promise<{ status: string; count: number }[]> {
        return this.FileModel.aggregate([
            { $match: { projectId, mimeType: { $in: SUPPORTED_MIME_TYPES } } },
            { $group: { _id: '$processingStatus', count: { $sum: 1 } } },
            { $project: { _id: 0, status: '$_id', count: 1 } },
            { $sort: { status: 1 } },
        ]).exec();
    }
}
