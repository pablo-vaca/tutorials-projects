import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Agent } from '@mastra/core/agent';

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { z } from 'zod';

import ChunkMongoService from './chunk-mongo.service';
import LLMService from '../../LLM/llm.service';
import { MastraService } from '../../mastra/mastra.service';
import { ChunkDocument } from '../schemas';

const ClassificationSchema = z.object({
    category: z
        .enum(['benefits_overview', 'benefits_details', 'other'])
        .describe('The category of the document. Use key name "category".'),
    confidence: z
        .number()
        .min(0)
        .max(1)
        .describe('A value between 0 and 1. Use key name "confidence".'),
    reasoning: z
        .string()
        .describe(
            'A plain text string explaining the choice. Do NOT return an object, only a string. Use key name "reasoning"'
        ),
});

type ClassificationOutput = z.infer<typeof ClassificationSchema>;

const CLASSIFICATION_INSTRUCTIONS = `You categorize insurance and benefits documents based on their content depth and purpose.

Categories:
- benefits_overview: High-level summaries, brochures, "At a Glance" documents, marketing materials
- benefits_details: Evidence of Coverage (EOC), Summary Plan Descriptions (SPD), legal contracts, detailed plan documents
- other: Documents not related to benefits

Consider:
1. Document structure and depth of information
2. Presence of legal language vs. marketing language
3. Level of detail in coverage descriptions
4. Target audience (HR/employees vs. legal/compliance)`;

/**
 * Configuration for document classification
 */
export interface ClassificationConfig {
    /**
     * Number of chunks to sample from the beginning of the document
     */
    headChunks?: number;
    /**
     * Number of chunks to sample from the middle of the document
     */
    middleChunks?: number;
    /**
     * Number of chunks to sample from the end of the document
     */
    tailChunks?: number;
    /**
     * Confidence threshold for classification (0-1)
     */
    confidenceThreshold?: number;
    /**
     * Use LangChain instead of Mastra for classification
     * @default false (uses Mastra)
     */
    useLangChain?: boolean;
}

export interface ClassificationResult {
    fileId: string;
    category: string;
    confidence: number;
    reasoning: string;
    needsReview: boolean;
    chunksAnalyzed: number;
    totalChunks: number;
}

const DEFAULT_CONFIG: Required<ClassificationConfig> = {
    headChunks: 3,
    middleChunks: 2,
    tailChunks: 1,
    confidenceThreshold: 0.75,
    useLangChain: false,
};

/**
 * Service for classifying documents into categories based on their content.
 * Uses smart sampling strategy to analyze representative chunks from different
 * sections of the document.
 */
@Injectable()
export class DocumentClassifierService implements OnModuleInit {
    private readonly logger = new Logger(DocumentClassifierService.name);

    private classificationAgent: Agent;

    private llm: ChatOpenAI;

    /**
     *
     * @param chunkMongoService
     * @param mastraService
     * @param llmService
     * @param logger
     */
    constructor(
        private readonly chunkMongoService: ChunkMongoService,
        private readonly mastraService: MastraService,
        private readonly llmService: LLMService,) {}

    /**
     * Initialize the classification agent on module startup
     */
    async onModuleInit() {
        this.llm = this.llmService.getOpenAILlm();
        this.classificationAgent = this.mastraService.createBasicAgent({
            name: 'DocumentClassifier',
            instructions: CLASSIFICATION_INSTRUCTIONS,
        });
        this.logger.log('DocumentClassifierService initialized');
    }

    /**
     * Classifies a document and updates all its chunks with category metadata.
     * Uses smart sampling to analyze beginning, middle, and end sections.
     * @param fileId The ID of the file to classify
     * @param config Optional configuration for classification strategy
     * @returns Classification result with category, confidence, and metadata
     */
    async classifyAndTagFile(
        fileId: string,
        config: ClassificationConfig = {}
    ): Promise<ClassificationResult> {
        const finalConfig = { ...DEFAULT_CONFIG, ...config };

        this.logger.debug(`Classifying file ${fileId} with config:`, finalConfig);

        // 1. Fetch chunks using the ChunkMongoService
        const allChunks = await this.chunkMongoService.getChunksByFileId(fileId);

        if (!allChunks || allChunks.length === 0) {
            this.logger.warn(`No chunks found for file ${fileId}`);
            throw new Error(`No chunks found for file ${fileId}`);
        }

        // 2. Sample representative chunks using smart sampling strategy
        const sampledChunks = this.sampleChunks(allChunks, finalConfig);

        this.logger.debug(
            `Sampled ${sampledChunks.length} chunks from ${allChunks.length} total chunks`
        );

        // 3. Build classification prompt with sampled content
        const prompt = this.buildClassificationPrompt(sampledChunks);

        // 4. Classify using classification service (Mastra or LangChain based on config)
        const { category, confidence, reasoning } = finalConfig.useLangChain
            ? await this.classifyWithLangChain(prompt)
            : await this.classifyWithMastra(prompt);

        // 5. Determine if manual review is needed
        const needsReview = confidence < finalConfig.confidenceThreshold;

        if (needsReview) {
            this.logger.warn(
                `Low confidence (${confidence}) for file ${fileId}. Category: ${category}. Reasoning: ${reasoning}`
            );
        } else {
            this.logger.log(
                `File ${fileId} classified as "${category}" with confidence ${confidence}`
            );
        }

        // 6. Update all chunks with classification metadata
        const classification = {
            category,
            confidence,
            reasoning,
            needsReview,
            chunksAnalyzed: sampledChunks.length,
            totalChunks: allChunks.length,
        };
        const updatedChunks = await this.chunkMongoService.updateChunksByFileId(fileId, {
            'metadata.classification': classification,
        });
        this.logger.debug(`Updated chunks result: ${JSON.stringify(updatedChunks)}`);

        return {
            fileId,
            category,
            confidence,
            reasoning,
            needsReview,
            chunksAnalyzed: sampledChunks.length,
            totalChunks: allChunks.length,
        };
    }

    /**
     * Samples chunks from beginning, middle, and end of document for classification.
     * This provides a representative view without analyzing all chunks.
     * @param chunks All chunks for the document
     * @param config Sampling configuration
     * @returns Array of sampled chunks
     */
    private sampleChunks(
        chunks: ChunkDocument[],
        config: Required<ClassificationConfig>
    ): ChunkDocument[] {
        const totalChunks = chunks.length;
        const { headChunks, middleChunks, tailChunks } = config;

        // For small documents, use all chunks
        if (totalChunks <= headChunks + middleChunks + tailChunks) {
            return chunks;
        }

        const sampled: ChunkDocument[] = [];

        // Get head chunks (beginning)
        sampled.push(...chunks.slice(0, headChunks));

        // Get middle chunks
        if (middleChunks > 0) {
            const middleStart = Math.floor((totalChunks - middleChunks) / 2);
            sampled.push(...chunks.slice(middleStart, middleStart + middleChunks));
        }

        // Get tail chunks (end)
        if (tailChunks > 0) {
            sampled.push(...chunks.slice(-tailChunks));
        }

        return sampled;
    }

    /**
     * Classify using Mastra agent with structured output
     * @param prompt Classification prompt
     * @returns Classification result
     */
    private async classifyWithMastra(prompt: string): Promise<ClassificationOutput> {
        this.logger.debug(' > Using mastra as classifier < ');
        const result = await this.classificationAgent.generate(prompt, {
            structuredOutput: { schema: ClassificationSchema },
            jsonPromptInjection: true,
        } as any);
        // ^ added 'as any' as workarround for linter error: "Type instantiation is excessively deep and possible infinite"
        return result.object as ClassificationOutput;
    }

    /**
     * Classify using LangChain with structured output (like chat.service.ts)
     * @param prompt Classification prompt
     * @returns Classification result
     */
    private async classifyWithLangChain(prompt: string): Promise<ClassificationOutput> {
        this.logger.debug(' > Using langchain as classifier < ');
        const llmWithStructure =
            this.llm.withStructuredOutput<ClassificationOutput>(ClassificationSchema);

        const systemMessage = new SystemMessage(CLASSIFICATION_INSTRUCTIONS);
        const humanMessage = new HumanMessage(prompt);

        const result = await llmWithStructure.invoke([systemMessage, humanMessage]);

        return result;
    }

    /**
     * Builds the classification prompt from sampled chunks
     * @param chunks Sampled chunks to analyze
     * @returns Formatted prompt for the classification agent
     */
    private buildClassificationPrompt(chunks: ChunkDocument[]): string {
        const sections = chunks.map((chunk) => {
            const position = this.getChunkPosition(chunk.chunkIndex, chunks.length);
            return `[${position} - Chunk ${chunk.chunkIndex}]\n${chunk.content}`;
        });

        // The line specifing the JSON object structure is requiered JUST to make Mastra
        // work ok. Langchain classifier works fine withtout that.

        return `
Analyze the following document sections and categorize the document.

Document Sections:
${sections.join('\n\n---\n\n')}

Provide your classification with confidence score and reasoning in JSON format.

Respond with a JSON object using EXACTLY these field names:
{
  "category": "benefits_overview" | "benefits_details" | "other",
  "confidence": 0.95,
  "reasoning": "Brief explanation as a single string"
}
`;
    }

    /**
     * Determines the position label for a chunk (Beginning, Middle, End)
     * @param chunkIndex Current chunk index
     * @param totalSampled Total number of sampled chunks
     * @returns Position label
     */
    private getChunkPosition(chunkIndex: number, totalSampled: number): string {
        if (chunkIndex < 3) return 'Beginning';
        if (chunkIndex >= totalSampled - 1) return 'End';
        return 'Middle';
    }
}
