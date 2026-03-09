import * as path from 'path';


import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import FormData from 'form-data';
import { lookup } from 'mime-types';

import FileService from './file.service';
import AuthApiService from '../../auth/auth-api.service';
import { ExternalApiException } from '../exceptions';
import { MarkdownUploadData } from './etl-image-markdown.service';

/**
 * @deprecated will be removed, no longer needed, ticket: https://dev.azure.com/mmctech/Mercer-PDE-Commercial-AI/_workitems/edit/2240260
 */
@Injectable()
export default class DocumentProcessingClient {
    private readonly logger = new Logger(DocumentProcessingClient.name);

    DATA_API_URL = 'document-processing/v1';

    /**
     * @param {import("@nestjs/axios").HttpService} httpService HTTP service for making API calls
     * @param {import("@nestjs/config").ConfigService} configService Configuration service
     * @param {FileService} fileService
     * @param {AuthApiService} authApiService
     * @param {Logger} logger
     */
    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        private readonly fileService: FileService,
        private readonly authApiService: AuthApiService,) {}

    /**
     * Uploads a file to the document processing API.
     * @param {string} mongoFileId
     * @param {Buffer} fileBuffer - The file buffer to upload
     * @param {string} fileName - The name of the file
     * @param {string} mimeType - The MIME type of the file
     * @returns {Promise<string>} - The ID of the uploaded file
     */
    async uploadFile(
        mongoFileId: string,
        fileBuffer: Buffer,
        fileName: string,
        mimeType: string
    ): Promise<string> {
        this.logger.log(`Uploading file as machine: ${fileName}`);

        const accessToken = await this.authApiService.getMachineToken();

        const clientId = this.configService.get<string>('X_API_KEY');
        const uploadUrl = this.buildDataApiUrlFor('/files');

        const formData = new FormData();
        formData.append('file', fileBuffer, {
            filename: fileName,
            contentType: mimeType,
        });

        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'X-Api-Key': clientId,
            ...formData.getHeaders(),
        };

        try {
            const response: AxiosResponse<{ id: string }> = await this.httpService.axiosRef.post(
                uploadUrl,
                formData,
                { headers }
            );

            // update mongo with cache info
            await this.fileService.updateRemoteId(mongoFileId, response.data.id);

            return mongoFileId;
        } catch (error) {
            this.logger.error('Upload failed:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });
            throw new ExternalApiException(
                `Failed to upload file: ${error.message}`,
                error.response?.status
            );
        }
    }

    /**
     *
     * @param remoteFileId
     * @param chunkSize
     * @param overlap
     * @param accessToken
     */
    async getChunks(
        remoteFileId: string,
        chunkSize: number,
        overlap: number,
        accessToken?: string
    ): Promise<string[]> {
        let coreApiToken = accessToken;
        if (!coreApiToken) {
            coreApiToken = await this.authApiService.getMachineToken();
        }

        const clientId = this.configService.get<string>('X_API_KEY');
        const chunksUrl = this.buildDataApiUrlFor(
            `/files/${remoteFileId}/chunks/${chunkSize}/${overlap}`
        );

        this.logger.debug(
            `Getting chunks for file ${remoteFileId} with chunkSize ${chunkSize} and overlap ${overlap}`
        );

        const headers = {
            Authorization: `Bearer ${coreApiToken}`,
            'x-api-key': clientId,
        };

        try {
            const response: AxiosResponse<string[]> = await this.httpService.axiosRef.get(
                chunksUrl,
                { headers }
            );
            return response.data;
        } catch (error) {
            this.logger.error('Get chunks failed:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });
            throw new ExternalApiException(
                `Failed to get chunks: ${error.message}`,
                error.response?.status
            );
        }
    }

    /**
     *
     * @param remoteFileId
     * @param chunkSize
     * @param overlap
     * @param data
     * @param accessToken
     * @deprecated Use `ChunkProcessorService.getChunksData` instead, will be removed, ticket: https://dev.azure.com/mmctech/Mercer-PDE-Commercial-AI/_workitems/edit/2240260
     */
    async getNewChunks(
        remoteFileId: string,
        chunkSize: number,
        overlap: number,
        data: MarkdownUploadData,
        accessToken?: string
    ): Promise<string[]> {
        let coreApiToken = accessToken;
        if (!coreApiToken) {
            coreApiToken = await this.authApiService.getMachineToken();
        }

        const clientId = this.configService.get<string>('X_API_KEY');
        const chunksUrl = this.buildDataApiUrlFor(
            `/files/${remoteFileId}/chunks/${chunkSize}/${overlap}`
        );

        this.logger.debug(
            `Getting chunks for file ${remoteFileId} with chunkSize ${chunkSize} and overlap ${overlap}`
        );

        const headers = {
            Authorization: `Bearer ${coreApiToken}`,
            'x-api-key': clientId,
        };

        try {
            const response: AxiosResponse<string[]> = await this.httpService.axiosRef.get(
                chunksUrl,
                { headers }
            );
            return response.data;
        } catch (error) {
            this.logger.error('Get chunks failed:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });
            const fileName = path.parse(data.sourceFile).name;
            const mimeType = lookup(data.sourceFile);
            const buffer = Buffer.from(data.content, 'utf8');
            const newRemoteFileId = await this.uploadMarkdownFile(
                buffer,
                fileName,
                mimeType,
                accessToken
            );
            if (remoteFileId) {
                this.logger.verbose(
                    `[NEW CHUNK PROCESS] - retrying with MongoFileId: ${newRemoteFileId}`
                );
                const newChunksUrl = this.buildDataApiUrlFor(
                    `/files/${newRemoteFileId}/chunks/${chunkSize}/${overlap}`
                );
                const newResponse: AxiosResponse<string[]> = await this.httpService.axiosRef.get(
                    newChunksUrl,
                    { headers }
                );
                return newResponse.data;
            }
            throw new ExternalApiException(
                `Failed to get chunks: ${error.message}`,
                error.response?.status
            );
        }
    }

    /**
     *
     * @param method
     */
    private buildDataApiUrlFor(method: string): string {
        return `${this.configService.get<string>('CORE_API_URL')}/${this.DATA_API_URL}${method}`;
    }

    /**
     *
     * @param fileBuffer
     * @param fileName
     * @param mimeType
     * @param accessToken
     */
    async uploadMarkdownFile(
        fileBuffer: Buffer,
        fileName: string,
        mimeType: string,
        accessToken: string
    ): Promise<string> {
        const clientId = this.configService.get<string>('X_API_KEY');
        const uploadUrl = this.buildDataApiUrlFor('/files');

        const formData = new FormData();
        formData.append('file', fileBuffer, {
            filename: fileName,
            contentType: mimeType,
        });

        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'X-Api-Key': clientId,
            ...formData.getHeaders(),
        };

        try {
            const response: AxiosResponse<{ id: string }> = await this.httpService.axiosRef.post(
                uploadUrl,
                formData,
                { headers }
            );

            return response.data.id;
        } catch (error) {
            this.logger.error('Upload failed:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });
            throw new ExternalApiException(
                `Failed to upload file: ${error.message}`,
                error.response?.status
            );
        }
    }
}
