import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { PdfFile, PdfFileDocument } from '../schemas/pdffile.schema';

@Injectable()
export default class PdfFileService {
    /**
     *
     * @param PdfFileModel
     */
    constructor(@InjectModel(PdfFile.name) readonly PdfFileModel: Model<PdfFileDocument>) {}

    /**
     *
     * @param fileData
     */
    async createFile(fileData: Partial<PdfFile>): Promise<PdfFileDocument> {
        const newPdfFile = new this.PdfFileModel(fileData);
        return newPdfFile.save();
    }

    /**
     *
     * @param id
     */
    async findById(id: string): Promise<PdfFileDocument | null> {
        return this.PdfFileModel.findById(id).exec();
    }

    /**
     *
     * @param id
     * @param status
     * @param errorMessage
     * @param error
     */
    async statusUpdate(
        id: string,
        status: PdfFile['status'],
        error?: unknown
    ): Promise<PdfFileDocument | null> {
        const hasErrors = error != null;

        const update: Record<string, unknown> = {
            status,
            hasErrors,
            errorMessage: hasErrors ? this.exceptionToString(error) : '',
        };

        return this.PdfFileModel.findByIdAndUpdate(id, update).exec();
    }

    /**
     *
     * @param error
     */
    private exceptionToString(error: unknown): string {
        if (error instanceof Error) {
            const stack = error.stack ?? '';
            const msg = error.message ?? '';
            return `${msg}\n${stack}`;
        }

        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }
}
