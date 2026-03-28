import { TransformResult } from './filters';
import * as FilterValue from './filterValue';

describe('TransformResult functionality', () => {

    describe('new object-based transform behavior', () => {
        it('should handle object returns with value only', () => {
            const objectTransform = (input: any): TransformResult => ({ value: FilterValue.value(input?.toString() || "") });

            const result = objectTransform(42);
            expect(result).toEqual({ value: FilterValue.value("42") });

            const emptyResult = objectTransform(null);
            expect(emptyResult).toEqual({ value: FilterValue.value("") });
        });

        it('should handle object returns with both field and value', () => {
            const keyValueTransform = (input: any): TransformResult => ({
                field: "transformedField",
                value: FilterValue.value(`prefix_${input}`)
            });

            const result = keyValueTransform("test");
            expect(result).toEqual({
                field: "transformedField",
                value: FilterValue.value("prefix_test")
            });
        });

        it('should allow omitting via FilterValue.empty', () => {
            const conditionalTransform = (input: any): TransformResult => {
                if (!input || input === '') {
                    return { value: FilterValue.empty };
                }
                return { field: "transformedField", value: FilterValue.value(`prefix_${input}`) };
            };

            expect(conditionalTransform("")).toEqual({ value: FilterValue.empty });
            expect(conditionalTransform(null)).toEqual({ value: FilterValue.empty });
            expect(conditionalTransform("test")).toEqual({
                field: "transformedField",
                value: FilterValue.value("prefix_test")
            });
        });


    });

});
