/**
 * Runtime reference DSL helpers.
 *
 * These helpers create typed `RuntimeReference` objects used in JSON view definitions
 * to refer to components/functions supplied by a runtime. They perform no validation;
 * validation happens later in `parseRuntimeReference`.
 */
import type { RuntimeReference } from '../framework/view-parser';

/** Generic runtime reference factory */
export function runtimeRef<S extends RuntimeReference['section']>(section: S, key: string): RuntimeReference {
    return { section, key };
}

export function cellRendererRef(key: string): RuntimeReference {
    return runtimeRef('cellRenderers', key);
}

export function noRowsComponentRef(key: string): RuntimeReference {
    return runtimeRef('noRowsComponents', key);
}

export function customFilterComponentRef(key: string): RuntimeReference {
    return runtimeRef('customFilterComponents', key);
}

export function queryTransformRef(key: string): RuntimeReference {
    return runtimeRef('queryTransforms', key);
}

export function initialValueRef(key: string): RuntimeReference {
    return runtimeRef('initialValues', key);
}

// Re-export RuntimeReference type for convenience
export type { RuntimeReference };
