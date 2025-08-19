import { describe, it, expect } from '@jest/globals';
import { nativeComponentsRuntime } from './index';

describe('nativeComponents', () => {
    describe('nativeComponentsRuntime', () => {
        it('has the correct structure', () => {
            expect(nativeComponentsRuntime).toHaveProperty('components');
            expect(nativeComponentsRuntime.components).toHaveProperty('Link');
        });

        it('exports Link component in runtime', () => {
            expect(nativeComponentsRuntime.components.Link).toBeDefined();
            expect(typeof nativeComponentsRuntime.components.Link).toBe('function');
        });

        it('does not export cell renderers', () => {
            expect(nativeComponentsRuntime).not.toHaveProperty('cellRenderers');
        });
    });
});
