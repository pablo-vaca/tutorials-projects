
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';

import AuthApiService from '../../auth/auth-api.service';
import { ExternalApiException, ProcessingException } from '../exceptions';

@Injectable()
export default class EmbeddingsClient {
    private readonly logger = new Logger(EmbeddingsClient.name);

    /**
     * @param authApiService
     * @param {import("@nestjs/axios").HttpService} httpService HTTP service for making API calls
     * @param {import("@nestjs/config").ConfigService} configService Configuration service
     * @param logger
     */
    constructor(
        private readonly authApiService: AuthApiService,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,) {}

    /**
     *
     * @param inputs
     * @param deploymentId
     * @param user
     * @param model
     * @param accessToken
     */
    async createEmbeddings(
        inputs: string[],
        deploymentId: string,
        user: string,
        model: string,
        accessToken?: string
    ): Promise<number[][]> {
        const batchSize =
            parseInt(this.configService.get<string>('EMBEDDING_BATCH_SIZE'), 10) || 100; // Default to 100 if not configured
        if (inputs.length > batchSize) {
            throw new ProcessingException(`input limit for create embeddings reached ${batchSize}`);
        }

        let coreApiToken = accessToken;
        if (!coreApiToken) {
            coreApiToken = await this.authApiService.getMachineToken();
        }

        const embeddingsUrl = `${this.configService.get<string>('CORE_API_URL')}/llm/embeddings/v1/${deploymentId}`;

        const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-api-key': this.configService.get<string>('X_API_KEY'),
            Authorization: `Bearer ${coreApiToken}`,
        };

        const body = {
            input: inputs, // Assume it accepts array
            user,
            input_type: 'query',
            encoding_format: 'float',
            model,
        };

        try {
            const response: AxiosResponse<{ data: { embedding: number[] }[] }> =
                await this.httpService.axiosRef.post(embeddingsUrl, body, { headers });
            return response.data.data.map((item) => item.embedding);
        } catch (error) {
            this.logger.error('Create embeddings failed:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });
            body.input = [];
            throw new ExternalApiException(
                `Failed to create embeddings: ${error.message} >> body params: ${Object.getOwnPropertyNames(body)}`,
                error.response?.status
            );
        }
    }
}
