import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Vector, VectorDocument } from '../schemas/vector.schema';

@Injectable()
export default class VectorService {
    /**
     * @param {import("@nestjs/mongoose").Model} vectorModel Vector model
     */
    constructor(@InjectModel(Vector.name) private readonly vectorModel: Model<VectorDocument>) {}

    /**
     * Inserts multiple vectors into the vectorstore collection.
     * @param {Partial<Vector>[]} vectors - Array of vector documents to insert
     * returns {Promise<VectorDocument[]>} - The inserted vector documents
     */
    async insertVectors(vectors: Partial<Vector>[]): Promise<any[]> {
        return this.vectorModel.insertMany(vectors);
    }

    /**
     * Batch create multiple vectors
     * @param vectors - Array of vector documents to create
     */
    async createMany(vectors: Partial<Vector>[]): Promise<VectorDocument[]> {
        return this.vectorModel.insertMany(vectors, {
            ordered: false,
        });
    }

    /**
     * Delete all vectors associated with a file
     * @param fileId - The MongoDB ObjectId of the file
     */
    async deleteByFileId(fileId: string): Promise<{ deletedCount: number }> {
        const result = await this.vectorModel.deleteMany({
            fileId: new Types.ObjectId(fileId),
        });
        return { deletedCount: result.deletedCount || 0 };
    }

    /**
     * Delete all vectors associated with a project
     * @param projectId - The project ID
     * @returns {Promise<{ deletedCount: number }>} The number of deleted vectors
     */
    async deleteByProjectId(projectId: string): Promise<{ deletedCount: number }> {
        const result = await this.vectorModel.deleteMany({ projectId });
        return { deletedCount: result.deletedCount || 0 };
    }

    /**
     *
     * @param ids
     * @param filename
     * @param pageNumber
     */
    async appendMetadata(ids: string[], filename: string, pageNumber: number) {
        return this.vectorModel.updateMany(
            { _id: { $in: ids } },
            { $set: { 'document_meta.filename': filename, 'document_meta.pageNumber': pageNumber } }
        );
    }
}
