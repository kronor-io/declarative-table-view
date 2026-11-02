// Replaced by the library build with the version in package.json (see vite.lib.config.ts)
declare const __DTV_VERSION__: string | undefined;

/** The version of `@kronor/dtv` running: `development` where no library build put it in, as in tests. */
export const DTV_VERSION: string = typeof __DTV_VERSION__ === 'string' ? __DTV_VERSION__ : 'development';
