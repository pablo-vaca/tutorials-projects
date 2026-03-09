/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */

import * as fs from 'fs';
import * as path from 'path';


import { Injectable, Logger } from '@nestjs/common';
import { Poppler } from 'node-poppler';
import sharp from 'sharp';

import EtlSharedService from './etl-shared.service';
import { FeatureFlagEnum } from '../../feature-flag/enums/feature-flag.enum';
import { FeatureFlagService } from '../../feature-flag/feature-flag.service';
import { FileDocument } from '../schemas';

@Injectable()
export default class PdfImagesService {
    private readonly logger = new Logger(PdfImagesService.name);

    /**
     *
     * @param {Logger} logger
     * @param {EtlSharedService} etlSharedService
     * @param featureFlagService
     */
    constructor(private readonly etlSharedService: EtlSharedService,
        private readonly featureFlagService: FeatureFlagService
    ) {}

    /**
     *
     * @param {string} name
     * @returns {string}
     */
    private sanitizeFilename(name: string): string {
        const ext = path.extname(name);
        const base = path
            .basename(name, ext)
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase();

        return `${base}${ext.toLowerCase()}`;
    }

    /**
     *
     * @param inputPath
     * @param outputPath
     */
    private async optimizePng(inputPath: string, outputPath: string): Promise<void> {
        await sharp(inputPath)
            .png({
                compressionLevel: 9,
                palette: true,
            })
            .toFile(outputPath);
    }

    /**
     * This methos optimizes JPEG images by flattening them against a white background, converting them to progressive JPEGs,
     * and applying chroma subsampling. This can significantly reduce file size while maintaining visual quality,
     * especially for scanned documents or images with transparency.
     * for future use if we want to support JPEG output from poppler using feature flag: USE_JPEG_OUTPUT_FROM_POPPLER
     * @param inputPath
     * @param outputPath
     */
    private async optimizeJpeg(inputPath: string, outputPath: string): Promise<void> {
        await sharp(inputPath)
            .flatten({ background: '#ffffff' })
            .jpeg({
                quality: 82,
                mozjpeg: true,
                progressive: true,
                chromaSubsampling: '4:2:0',
            })
            .toFile(outputPath);
    }

    /**
     *
     * @param {string} basePath
     * @param {string} folder
     * @returns {Promise<string>}
     */
    private async listRelativeFiles(basePath: string, folder: string): Promise<string[]> {
        const fullPath = path.join(basePath, folder);
        const items = await fs.promises.readdir(fullPath);

        // prepend folder to each file name
        return items.map((name) => path.join(folder, name));
    }

    /**
     * This method takes a Jpeg file and optimizes it by flattening it against a white background, converting it to a progressive JPEG,
     * @param {string} sourceFile
     * @param {string} pagesFolder
     * @param {string} optimizedFolder
     * @returns {Promise<void>}
     */
    async convertPdfToPng(
        sourceFile: string,
        pagesFolder: string,
        optimizedFolder: string
    ): Promise<void> {
        const poppler = new Poppler();
        await poppler.pdfToCairo(sourceFile, `${pagesFolder}/pages`, {
            pngFile: true,
        });

        const imageFiles = await fs.promises.readdir(pagesFolder);
        for (const imageFile of imageFiles) {
            const outputFile = imageFile.replace(/\.png$/i, '.png');
            await this.optimizePng(
                path.join(pagesFolder, imageFile),
                path.join(optimizedFolder, outputFile)
            );
        }
    }

    /**
     * This method takes a Jpeg file and optimizes it by flattening it against a white background, converting it to a progressive JPEG,
     * @param {string} sourceFile
     * @param {string} pagesFolder
     * @param {string} optimizedFolder
     * @returns {Promise<void>}
     */
    async convertPdfToJpeg(
        sourceFile: string,
        pagesFolder: string,
        optimizedFolder: string
    ): Promise<void> {
        const poppler = new Poppler();
        await poppler.pdfToCairo(sourceFile, `${pagesFolder}/pages`, {
            jpegFile: true,
        });

        const imageFiles = await fs.promises.readdir(pagesFolder);
        for (const imageFile of imageFiles) {
            const outputFile = imageFile.replace(/\.jpg$/i, '.jpg');
            await this.optimizePng(
                path.join(pagesFolder, imageFile),
                path.join(optimizedFolder, outputFile)
            );
        }
    }

    /**
     *
     * @param {string} configId
     * @param {strng} filename
     * @param folderId
     * @param fileData
     * @returns {Promise<string>}
     */
    async storeFile(filename: string, folderId: string, fileData): Promise<string> {
        const location = this.etlSharedService.getLocation();
        const folderPath = path.resolve(location, folderId);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        const sanitizedFilename = `${folderPath}/${this.sanitizeFilename(filename)}`;
        this.logger.log(`[DOWNLOAD] file: ${sanitizedFilename}`);
        await fs.promises.writeFile(sanitizedFilename, fileData);

        return sanitizedFilename;
    }

    /**
     *
     * @param {FileDocument} mongoFile
     * @returns {Promise<string[]>}
     */
    async splitFileIntoPagesFromFileDocument(mongoFile: FileDocument): Promise<string[]> {
        const folderPath = this.etlSharedService.getFolderFromMongoFileId_WithValidation(
            mongoFile.id
        );

        const sourceFile = this.etlSharedService.getFullfilename_WithValidation(
            folderPath,
            mongoFile.storageFilename
        );

        const pagesFolder = path.resolve(folderPath, 'pages');
        if (fs.existsSync(pagesFolder)) {
            fs.rmSync(pagesFolder, { recursive: true });
        }
        fs.mkdirSync(pagesFolder);

        const optimizedFolder = path.resolve(folderPath, 'optimized');
        if (fs.existsSync(optimizedFolder)) {
            fs.rmSync(optimizedFolder, { recursive: true });
        }
        fs.mkdirSync(optimizedFolder);

        const featureIsActive = await this.featureFlagService.isActive(
            FeatureFlagEnum.USE_JPEG_OUTPUT_FROM_POPPLER
        );
        if (featureIsActive) {
            await this.convertPdfToJpeg(sourceFile, pagesFolder, optimizedFolder);
        } else {
            await this.convertPdfToPng(sourceFile, pagesFolder, optimizedFolder);
        }

        return this.listRelativeFiles(folderPath, 'optimized');
    }
}
