import { TransformResult } from './filters';

describe('TransformResult functionality', () => {

    describe('new object-based transform behavior', () => {
        it('should handle object returns with value only', () => {
            const objectTransform = (input: any): TransformResult => ({ value: input?.toString() || "" });

            const result = objectTransform(42);
            expect(result).toEqual({ value: "42" });

            const emptyResult = objectTransform(null);
            expect(emptyResult).toEqual({ value: "" });
        });

        it('should handle object returns with both field and value', () => {
            const keyValueTransform = (input: any): TransformResult => ({
                field: "transformedField",
                value: `prefix_${input}`
            });

            const result = keyValueTransform("test");
            expect(result).toEqual({
                field: "transformedField",
                value: "prefix_test"
            });
        });

        it('should handle conditional transform returns', () => {
            const conditionalTransform = (input: any): TransformResult => {
                if (!input || input === '') {
                    return input; // Return simple value for empty input
                }
                return { field: "transformedField", value: `prefix_${input}` };
            };

            // Empty input returns simple value
            expect(conditionalTransform("")).toBe("");
            expect(conditionalTransform(null)).toBe(null);

            // Non-empty input returns object
            expect(conditionalTransform("test")).toEqual({
                field: "transformedField",
                value: "prefix_test"
            });
        });


    });

});
