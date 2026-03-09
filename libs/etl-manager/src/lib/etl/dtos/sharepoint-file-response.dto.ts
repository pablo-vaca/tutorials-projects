/**
 * Response DTO for SharePoint file
 */
export default class SharePointFileResponseDto {
    id: string;

    name: string;

    webUrl: string;

    size: number;

    createdDateTime: string;

    lastModifiedDateTime: string;

    mimeType?: string;
}
