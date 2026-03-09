/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

import PdfFileService from './pdf-file.service';
import { PdfFile } from '../schemas/pdffile.schema';

describe('PdfFileService', () => {
    let service: PdfFileService;

    // 2. A factory to simulate the 'new Model()' behavior
    // This function acts as the class/constructor

    // eslint-disable-next-line jsdoc/require-jsdoc
    function MockModel(dto: any) {
        this.data = dto;
        this.save = jest.fn().mockResolvedValue({ ...dto, _id: 'new-id' });
        return this;
    }

    // Attach static methods to the constructor function
    MockModel.findById = jest.fn();
    MockModel.findByIdAndUpdate = jest.fn();

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PdfFileService,
                {
                    provide: getModelToken(PdfFile.name),
                    useValue: MockModel, // Provide the constructor function
                },
            ],
        }).compile();

        service = module.get<PdfFileService>(PdfFileService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findById', () => {
        it('should return a document when found', async () => {
            const mockDoc = { _id: '123' };

            // Use type casting here to avoid the TS error
            (MockModel.findById as jest.Mock).mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockDoc),
            });

            const result = await service.findById('123');
            expect(result).toEqual(mockDoc);
            expect(MockModel.findById).toHaveBeenCalledWith('123');
        });
    });

    describe('statusUpdate', () => {
        it('should update status and handle Errors', async () => {
            (MockModel.findByIdAndUpdate as jest.Mock).mockReturnValue({
                exec: jest.fn().mockResolvedValue({ _id: '123' }),
            });

            const testError = new Error('Test Failure');
            // Using 'as any' for status if your enum/type is strict
            await service.statusUpdate('123', 'error' as any, testError);

            expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(
                '123',
                expect.objectContaining({
                    status: 'error',
                    hasErrors: true,
                    errorMessage: expect.stringContaining('Test Failure'),
                })
            );
        });

        it('should stringify unknown error types and include quotes for strings', async () => {
            (MockModel.findByIdAndUpdate as jest.Mock).mockReturnValue({
                exec: jest.fn().mockResolvedValue({}),
            });

            const rawError = 'Simple String Error';

            await service.statusUpdate('123', 'error' as any, rawError);

            expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(
                '123',
                expect.objectContaining({
                    status: 'error',
                    hasErrors: true,
                    // JSON.stringify adds escaped quotes to strings
                    errorMessage: JSON.stringify(rawError),
                })
            );
        });
    });
});
