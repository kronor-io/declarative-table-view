import { Link } from './components/Link';
import { Runtime } from '../runtime';

export type NativeComponentsRuntime = Runtime & {
    cellRenderers: {
        Link: typeof Link;
    };
};

/**
 * Native Components Runtime - provides reusable UI components
 * for use across different views in the application
 */
export const nativeComponentsRuntime: NativeComponentsRuntime = {
    cellRenderers: {
        Link
    },
    queryTransforms: {},
    noRowsComponents: {},
    customFilterComponents: {},
    initialValues: {}
};

// Export components for direct usage
export { Link } from './components';
export type { LinkProps } from './components';
