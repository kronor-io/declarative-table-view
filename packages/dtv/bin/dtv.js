#!/usr/bin/env node

// Wrapper entrypoint for the published DTV CLI.
// The implementation lives in dist/cli so it can be compiled from TypeScript.

import { existsSync } from 'node:fs';

const entry = new URL('../dist/cli/dtv.js', import.meta.url);

if (!existsSync(entry)) {
	console.error(
		[
			'Failed to start DTV CLI: missing compiled output at dist/cli/dtv.js.',
			'',
			'This usually means @kronor/dtv was installed from an incomplete package (missing dist/).',
			'',
			'Fix:',
			'- Upgrade to a version of @kronor/dtv that includes the CLI build artifacts, or',
			'- If using a local checkout, run: npm run build:lib'
		].join('\n')
	);
	process.exitCode = 1;
} else {
	try {
		await import(entry.href);
	} catch (e) {
		// The CLI is there but could not load, e.g. an installed dependency lacks an export it
		// imports. Its own error says which; a missing dist/ is not the cause.
		console.error('Failed to start DTV CLI:');
		console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
		if (e instanceof SyntaxError && /does not provide an export named/.test(e.message)) {
			console.error('\nAn installed dependency is older than this @kronor/dtv expects: check `npm ls @kronor/hasura-graphql`.');
		}
		process.exitCode = 1;
	}
}
