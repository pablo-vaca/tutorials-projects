import { Buffer } from 'buffer';


import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

import { ProcessingException } from '../exceptions';
import { EtlConfig, SharePointConfig } from '../schemas';

/**
 * Represents a SharePoint file item
 */
export interface SharePointFile {
    id: string;
    name: string;
    webUrl: string;
    size: number;
    createdDateTime: string;
    lastModifiedDateTime: string;
    mimeType?: string;
}

/**
 * Represents a SharePoint folder
 */
export interface SharePointFolder {
    id: string;
    name: string;
    webUrl: string;
}

export interface SharePointSite {
    changes: GraphDriveItem[];
    newDeltaLink: string | undefined;
}

export interface FileDetails {
    mimeType: string;
    hashes: {
        quickXorHash: string;
    };
}
export interface DeletedState {
    state: string;
}
export interface GraphDriveItem {
    id: string;
    name: string;
    webUrl: string;
    size: number;
    createdDateTime: string;
    lastModifiedDateTime: string;
    file?: FileDetails;
    folder?: object;
    deleted?: DeletedState;
}

/**
 * SharePoint service for managing file operations
 */
@Injectable()
export default class SharepointService implements OnModuleInit {
    private readonly logger = new Logger(SharepointService.name);

    private graphClient: AxiosInstance;

    private accessToken: string;

    // Token cache with expiry
    private readonly tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

    // Buffer time before token expiry to refresh (5 minutes)
    private readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

    /**
     * @param {ConfigService} configService - The config service for environment variables
     */
    constructor(private readonly configService: ConfigService) {}

    /**
     *
     */
    async onModuleInit() {
        this.logger.debug('Initializing SharePoint service...');
        await this.ensureClientReady();
        this.logger.debug('SharePoint service initialization complete.');
    }

    /**
     *
     */
    private async ensureClientReady(): Promise<void> {
        const defaultTenantId = this.configService.get<string>('AZURE_TENANT_ID');
        if (!defaultTenantId) {
            throw new Error(
                'Cannot auto-initialize SharePoint service: AZURE_TENANT_ID is missing from environment variables.'
            );
        }
        await this.setupClient(defaultTenantId);
    }

    /**
     *
     * @param tenantId
     */
    private async setupClient(tenantId: string): Promise<void> {
        // Check if we have a valid cached token
        const cachedToken = this.tokenCache.get(tenantId);
        const now = Date.now();
        let isTokenValid = false;

        if (cachedToken && cachedToken.expiresAt - now > this.TOKEN_REFRESH_BUFFER_MS) {
            // Token is still valid, use cached version
            this.accessToken = cachedToken.token;
            this.logger.debug(
                ` TOKEN : Using cached token (expires in ${Math.round((cachedToken.expiresAt - now) / 1000)}s)`
            );
            isTokenValid = true;
        } else {
            // Token expired or about to expire, fetch new one
            if (cachedToken) {
                this.logger.debug('TOKEN : Cached token expired, refreshing...');
            }

            const tokenData = await this.getAccessTokenUsingClientCredentials(tenantId);
            this.accessToken = tokenData.token;

            // Cache the new token
            this.tokenCache.set(tenantId, tokenData);
        }

        // Create or update the graph client with current token
        if (!isTokenValid || !this.graphClient) {
            this.logger.debug(
                'Graph client initialized. Attempting default initialization from env vars...'
            );
            this.graphClient = this.getGraphClient(this.accessToken);
        }

        this.logger.debug(
            '#####################################################################################'
        );
    }

    /**
     *
     * @param accessToken
     */
    private getGraphClient(accessToken) {
        // Create or update the graph client with current token
        return axios.create({
            baseURL: 'https://graph.microsoft.com/v1.0',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Retrieves an access token using client credentials (client ID and secret)
     * @param azureTenantId
     * @returns {Promise<{token: string, expiresAt: number}>} The access token and expiry timestamp
     */
    private async getAccessTokenUsingClientCredentials(
        azureTenantId?: string
    ): Promise<{ token: string; expiresAt: number }> {
        try {
            const clientId = this.configService.get<string>('AZURE_CLIENT_ID');
            const clientSecret = this.configService.get<string>('AZURE_CLIENT_SECRET');
            const tenantId = azureTenantId || this.configService.get<string>('AZURE_TENANT_ID');

            if (!clientId || !clientSecret || !tenantId) {
                throw new Error('Missing required Azure credentials in environment variables.');
            }

            const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
            const response = await axios.post(
                tokenUrl,
                new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    scope: 'https://graph.microsoft.com/.default',
                    grant_type: 'client_credentials',
                }).toString(),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            // eslint-disable-next-line @typescript-eslint/naming-convention
            const { access_token, expires_in } = response.data;
            const expiresAt = Date.now() + expires_in * 1000;

            this.logger.debug(
                ` TOKEN : Successfully retrieved access token (expires in ${expires_in}s)`
            );

            return {
                token: access_token,
                expiresAt,
            };
        } catch (error) {
            this.logger.error(`Failed to retrieve access token: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Public initialization with specific ETL configuration
     * @param config
     */
    async initialize(config: EtlConfig): Promise<void> {
        try {
            const { tenantId } = config.dataSource.config as SharePointConfig;
            await this.setupClient(tenantId);
        } catch (error) {
            this.logger.error(
                `Failed to initialize SharePoint service: ${(error as Error).message}`
            );
            throw error;
        }
    }

    /**
     * Lists all files in a SharePoint document library
     * @param {string} driveId - The drive (document library) ID
     * @param {string} folderId - Optional folder ID to list files from a specific folder
     * @returns {Promise<SharePointFile[]>} Array of files in the specified location
     */
    async listFiles(driveId: string, folderId?: string): Promise<SharePointFile[]> {
        try {
            const path = folderId
                ? `/drives/${driveId}/items/${folderId}/children`
                : `/drives/${driveId}/root/children`;

            const response = await this.graphClient.get(path);
            const files: SharePointFile[] = response.data.value
                .filter((item: Record<string, unknown>) => !item.folder) // Exclude folders
                .map((item: Record<string, unknown>) => ({
                    id: item.id as string,
                    name: item.name as string,
                    webUrl: item.webUrl as string,
                    size: item.size as number,
                    createdDateTime: item.createdDateTime as string,
                    lastModifiedDateTime: item.lastModifiedDateTime as string,
                    mimeType: (item.file as Record<string, unknown>)?.mimeType as
                        | string
                        | undefined,
                }));

            this.logger.log(`Retrieved ${files.length} files from SharePoint`);
            return files;
        } catch (error) {
            this.logger.error(`Failed to list files: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Downloads a file from SharePoint
     * @param {string} driveId - The drive ID
     * @param {string} fileId - The file ID
     * @returns {Promise<Buffer>} The file content as a Buffer
     */
    async downloadFile(driveId: string, fileId: string): Promise<Buffer> {
        try {
            await this.ensureClientReady();
            const response = await this.graphClient.get(
                `/drives/${driveId}/items/${fileId}/content`,
                {
                    responseType: 'arraybuffer',
                }
            );

            this.logger.debug(`Downloaded file: ${fileId}`);
            return Buffer.from(response.data);
        } catch (error) {
            this.logger.error(`Failed to download file: ${error.message}`);
            throw error;
        }
    }

    /**
     * Gets details about a specific file
     * @param {string} driveId - The drive ID
     * @param {string} fileId - The file ID
     * @returns {Promise<SharePointFile>} The file details
     */
    async getFileDetails(driveId: string, fileId: string): Promise<SharePointFile> {
        try {
            const response = await this.graphClient.get(`/drives/${driveId}/items/${fileId}`);
            const item = response.data as Record<string, unknown>;

            return {
                id: item.id as string,
                name: item.name as string,
                webUrl: item.webUrl as string,
                size: item.size as number,
                createdDateTime: item.createdDateTime as string,
                lastModifiedDateTime: item.lastModifiedDateTime as string,
                mimeType: (item.file as Record<string, unknown>)?.mimeType as string | undefined,
            };
        } catch (error) {
            this.logger.error(`Failed to get file details: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Gets all drives (document libraries) for a site
     * @param {string} siteId - The site ID
     * @returns {Promise<Record<string, unknown>[]>} Array of drives
     */
    async listDrives(siteId: string): Promise<Record<string, unknown>[]> {
        try {
            const response = await this.graphClient.get(`/sites/${siteId}/drives`);
            this.logger.log(
                `Retrieved ${(response.data.value as Record<string, unknown>[]).length} drives`
            );
            return response.data.value as Record<string, unknown>[];
        } catch (error) {
            this.logger.error(`Failed to list drives: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     *
     * @param driveId
     * @param name
     */
    async searchItemByName(driveId: string, name: string): Promise<Record<string, unknown>[]> {
        try {
            const response = await this.graphClient.get(
                `/drives/${driveId}/root/children?$filter=name eq '${name}'`
            );
            return response.data.value as Record<string, unknown>[];
        } catch (error) {
            this.logger.error(`Failed to search items: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Recursively retrieves all files from a folder and its subfolders
     * @param {string} driveId - The drive ID
     * @param {string} folderId - The folder ID to start from (uses root if not provided)
     * @param {string[]} fileExtensions - Optional array of file extensions to filter (e.g., ['.pdf', '.docx'])
     * @returns {Promise<SharePointFile[]>} All files recursively found in the folder
     */
    async getFilesRecursively(
        driveId: string,
        folderId?: string,
        fileExtensions?: string[]
    ): Promise<SharePointFile[]> {
        const allFiles: SharePointFile[] = [];

        const traverse = async (currentFolderId?: string): Promise<void> => {
            const path = currentFolderId
                ? `/drives/${driveId}/items/${currentFolderId}/children`
                : `/drives/${driveId}/root/children`;

            const response = await this.graphClient.get(path);
            const items = response.data.value as Record<string, unknown>[];

            const processItems = items.map(async (item) => {
                if (item.folder) {
                    // Recursively traverse subfolders
                    await traverse(item.id as string);
                } else {
                    // Check file extension if filter is provided
                    if (fileExtensions) {
                        const itemName = item.name as string;
                        const hasAllowedExtension = fileExtensions.some((ext) =>
                            itemName.toLowerCase().endsWith(ext.toLowerCase())
                        );
                        if (!hasAllowedExtension) {
                            return;
                        }
                    }

                    allFiles.push({
                        id: item.id as string,
                        name: item.name as string,
                        webUrl: item.webUrl as string,
                        size: item.size as number,
                        createdDateTime: item.createdDateTime as string,
                        lastModifiedDateTime: item.lastModifiedDateTime as string,
                        mimeType: (item.file as Record<string, unknown>)?.mimeType as
                            | string
                            | undefined,
                    });
                }
            });

            await Promise.all(processItems);
        };

        await traverse(folderId);
        this.logger.log(`Retrieved ${allFiles.length} files recursively`);
        return allFiles;
    }

    /**
     *
     * @param siteId
     * @param libraryName
     */
    async getDocumentLibraryId(siteId: string, libraryName = 'documents'): Promise<string> {
        this.logger.log(`Getting List ID for library '${libraryName}' on site '${siteId}'...`);
        try {
            // Use this.graphClient, which is already authenticated
            const url = `/sites/${siteId}/drives`;
            const response = await this.graphClient.get(url);

            const documentLibrary = response.data.value.find(
                (drive: any) => drive.name.toLowerCase() === libraryName.toLowerCase()
            );

            if (!documentLibrary) {
                throw new Error(`Document library '${libraryName}' not found on site ${siteId}`);
            }

            if (!documentLibrary.list?.id) {
                throw new Error(`Could not find list ID for library '${libraryName}'`);
            }

            this.logger.log(`Found List ID: ${documentLibrary.list.id}`);
            return documentLibrary.list.id;
        } catch (error) {
            this.logger.error(
                `Failed to get document library ID: ${(error as Error).message}`,
                error.response?.data
            );
            throw error;
        }
    }

    /**
     * Gets all changes since the last poll for a specific folder.
     * @param currentDeltaLink The deltaLink from the last run, or null/undefined
     * @param driveId The ID of the Drive
     * @param folderId The ID of the specific folder to watch (from EtlConfig.sharepointFolder)
     * @returns An object with the list of changes and the new deltaLink
     */
    async getDeltaChanges(
        currentDeltaLink: string | undefined,
        driveId: string,
        folderId: string
    ): Promise<SharePointSite> {
        let allChanges: any[] = [];
        let nextLink: string | undefined;
        let deltaLink: string | undefined;

        await this.ensureClientReady();

        if (currentDeltaLink) {
            this.logger.log('Calling existing delta link...');
            nextLink = currentDeltaLink;
        } else {
            this.logger.log('No delta link. Starting initial delta call...');
            nextLink = `/drives/${driveId}/items/${folderId}/delta`;
        }

        try {
            while (nextLink) {
                this.logger.log(`Calling Graph API: ${nextLink}...`);

                // eslint-disable-next-line no-await-in-loop
                const response = await this.graphClient.get(nextLink);

                if (response.data.value) {
                    allChanges = allChanges.concat(response.data.value);
                }

                nextLink = response.data['@odata.nextLink'];

                if (response.data['@odata.deltaLink']) {
                    deltaLink = response.data['@odata.deltaLink'];
                }
            }

            if (!deltaLink) {
                this.logger.warn(
                    'Delta query completed without providing a new deltaLink. A full re-sync will be required.'
                );
                return { changes: allChanges, newDeltaLink: null };
            }

            return {
                changes: allChanges,
                newDeltaLink: deltaLink,
            };
        } catch (error) {
            // Handle "410 Gone" or other sync errors
            if (error.response?.status === 410) {
                this.logger.warn('Delta link expired (410 Gone). A full re-sync is required.');
                // By returning a null deltaLink, the caller knows to trigger a full resync
                // and clear the old (invalid) link.
                return { changes: [], newDeltaLink: null }; // Special case: null link
            }
            this.logger.error(
                `Error during delta query: ${(error as Error).message}`,
                error.response?.data
            );
            throw error;
        }
    }

    /**
     * Encodes a URL into the base64-url-safe format required by the Graph /shares API.
     * @param url The URL to encode
     * @returns A string formatted for the /shares endpoint (e.g., "u!aHR0...").
     */
    private encodeSharepointUrl(url: string): string {
        const base64Value = Buffer.from(url).toString('base64');
        const safeBase64 = base64Value
            .replace(/\+/g, '-') // Replace + with -
            .replace(/\//g, '_') // Replace / with _
            .replace(/=+$/, ''); // Remove trailing =
        return `u!${safeBase64}`;
    }

    /**
     * Resolves a SharePoint folder URL directly to its Graph driveItem.
     * This is the most reliable way to get a folder's ID and drive ID.
     * @param url The full SharePoint URL to the folder
     */
    async getDriveItemFromUrl(
        url: string
    ): Promise<{ id: string; name: string; webUrl: string; parentReference: { driveId: string } }> {
        await this.ensureClientReady();
        try {
            const encodedUrl = this.encodeSharepointUrl(url);
            const response = await this.graphClient!.get(`/shares/${encodedUrl}/driveItem`); // Note the ! non-null assertion because we ensured it above

            if (!response.data.folder) {
                throw new Error(`Provided URL does not point to a folder: ${url}`);
            }

            return response.data;
        } catch (error) {
            // Enhanced error logging for Graph API failures
            const graphError = error.response?.data?.error?.message || (error as Error).message;
            this.logger.error(`Failed to resolve SharePoint URL (${url}): ${graphError}`);
            throw new ProcessingException(
                'Could not resolve SharePoint URL. Ensure it is a valid "Copy link" URL.'
            );
        }
    }

    /**
     * Validates a SharePoint folder by URL path and returns its unique ID and canonical URL
     * Uses the Microsoft Graph API sites endpoint with path-based addressing
     * @param {string} host - The SharePoint host (e.g., 'tenant.sharepoint.com')
     * @param {string} path - The path to the folder (e.g., '/sites/deal/Shared Documents/FolderA')
     * @returns {Promise<{uniqueId: string, canonicalUrl: string}>} The folder's unique ID and canonical URL
     * @throws {ProcessingException} if folder cannot be found or accessed
     */
    async validateAndResolveFolder(
        host: string,
        path: string
    ): Promise<{ uniqueId: string; canonicalUrl: string }> {
        await this.ensureClientReady();

        const requestUrl = `/sites/${host}:${path}`;

        try {
            const response = await this.graphClient.get(requestUrl);

            return {
                // A unique ID that never changes
                uniqueId: response.data.id as string,
                canonicalUrl: response.data.webUrl as string,
            };
        } catch (error) {
            // Handle 404 (Folder not found) or 403 (Permission denied)
            const graphError = error.response?.data?.error?.message || (error as Error).message;
            this.logger.error(
                `Failed to validate SharePoint folder (${host}:${path}): ${graphError}`
            );
            throw new ProcessingException('Could not verify SharePoint folder existence.');
        }
    }

    /**
     * Resolves a SharePoint sharing link to get the actual folder/file details
     * This is the proper way to handle SharePoint sharing links (URLs with :f:/r/ or :i:/r/)
     * @param {string} sharingUrl - The full SharePoint sharing URL
     * @returns {Promise<{uniqueId: string, canonicalUrl: string}>} The item's unique ID and canonical URL
     * @throws {ProcessingException} if sharing link cannot be resolved
     */
    async resolveSharingLink(
        sharingUrl: string
    ): Promise<{ uniqueId: string; canonicalUrl: string }> {
        await this.ensureClientReady();

        // Encode the sharing URL as a base64 sharing token
        // Format: u!<base64-encoded-url>
        const base64Value = Buffer.from(sharingUrl, 'utf-8').toString('base64');
        const encodedUrl = `u!${base64Value.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`;

        try {
            // Use Microsoft Graph shares endpoint to resolve the sharing link
            const response = await this.graphClient.get(`/shares/${encodedUrl}/driveItem`);

            return {
                uniqueId: response.data.id as string,
                canonicalUrl: response.data.webUrl as string,
            };
        } catch (error) {
            const graphError = error.response?.data?.error?.message || (error as Error).message;
            this.logger.error(
                `Failed to resolve SharePoint sharing link (${sharingUrl}): ${graphError}`
            );
            throw new ProcessingException('Could not resolve SharePoint sharing link.');
        }
    }

    /**
     * Gets the access token currently in use
     * @returns {string} The current access token
     */
    getAccessToken(): string {
        if (!this.accessToken) {
            throw new Error('Service not initialized. Call initialize() first.');
        }
        return this.accessToken;
    }
}
