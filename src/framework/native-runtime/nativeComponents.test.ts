import { describe, it, expect } from '@jest/globals';
import { nativeRuntime } from './index';

describe('NativeRuntime', () => {
    describe('nativeRuntime', () => {
        it('has the correct ViewRuntime structure', () => {
            expect(nativeRuntime).toHaveProperty('cellRenderers');
            expect(nativeRuntime.cellRenderers).toHaveProperty('text');
            expect(nativeRuntime.cellRenderers).toHaveProperty('json');
        });

        it('exports text and json cell renderers', () => {
            expect(nativeRuntime.cellRenderers.text).toBeDefined();
            expect(typeof nativeRuntime.cellRenderers.text).toBe('function');
            expect(nativeRuntime.cellRenderers.json).toBeDefined();
            expect(typeof nativeRuntime.cellRenderers.json).toBe('function');
        });

        it('has all required runtime sections', () => {
            expect(nativeRuntime).toHaveProperty('cellRenderers');
            expect(nativeRuntime).toHaveProperty('queryTransforms');
            expect(nativeRuntime).toHaveProperty('noRowsComponents');
            expect(nativeRuntime).toHaveProperty('customFilterComponents');
            expect(nativeRuntime).toHaveProperty('initialValues');
        });
    });
});
