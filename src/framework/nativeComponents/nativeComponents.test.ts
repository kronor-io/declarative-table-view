import { describe, it, expect } from '@jest/globals';
import { nativeComponentsRuntime } from './index';

describe('nativeComponents', () => {
    describe('nativeComponentsRuntime', () => {
        it('has the correct ViewRuntime structure', () => {
            expect(nativeComponentsRuntime).toHaveProperty('cellRenderers');
            expect(nativeComponentsRuntime.cellRenderers).toHaveProperty('Link');
        });

        it('exports Link component in cellRenderers', () => {
            expect(nativeComponentsRuntime.cellRenderers.Link).toBeDefined();
            expect(typeof nativeComponentsRuntime.cellRenderers.Link).toBe('function');
        });

        it('has all required runtime sections', () => {
            expect(nativeComponentsRuntime).toHaveProperty('cellRenderers');
            expect(nativeComponentsRuntime).toHaveProperty('queryTransforms');
            expect(nativeComponentsRuntime).toHaveProperty('noRowsComponents');
            expect(nativeComponentsRuntime).toHaveProperty('customFilterComponents');
        });
    });
});
