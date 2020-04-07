import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

type FilterType = 'between' | 'moreThan' | 'moreThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'all' | 'contains' | 'equals' | 'notEquals';

export class FilterForm {

    @IsString()
    @IsOptional()
    field: string;

    @IsString()
    @IsOptional()
    type: FilterType;

    @IsNotEmpty()
    value: string | number | boolean | number[] | { from: string | number, to: string | number } | any;

}