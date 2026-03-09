import { DataSourceType } from '../schemas';

export default class InitProjectDto {
    projectId: string;

    projectName: string;

    sharepointUrl: string;

    dataScope: string;

    dataSourceType?: DataSourceType;

    sharepointTennantId?: string;

    fileExtensions?: [];
}
