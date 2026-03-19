#!/usr/bin/env node

// Wrapper entrypoint for the published DTV CLI.
// The implementation lives in dist/cli so it can be compiled from TypeScript.

try {
	await import('../dist/cli/dtv.js');
} catch (e) {
	const msg = e instanceof Error ? e.message : String(e);
	console.error(
		[
			'Failed to start DTV CLI: missing compiled output at dist/cli/dtv.js.',
			'',
			'This usually means @kronor/dtv was installed from an incomplete package (missing dist/).',
			'',
			'Fix:',
			'- Upgrade to a version of @kronor/dtv that includes the CLI build artifacts, or',
			'- If using a local checkout, run: npm run build:lib',
			'',
			`Original error: ${msg}`
		].join('\n')
	);
	process.exitCode = 1;
}
