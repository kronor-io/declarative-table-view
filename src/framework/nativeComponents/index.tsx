import { Link } from './components/Link';

export type NativeComponentsRuntime = {
    components: {
        Link: typeof Link;
    };
};

/**
 * Native Components Runtime - provides reusable UI components
 * for use across different views in the application
 */
export const nativeComponentsRuntime: NativeComponentsRuntime = {
    components: {
        Link
    }
};

// Export components for direct usage
export { Link } from './components';
export type { LinkProps } from './components';
