#!/usr/bin/env node
/**
 * Release script for @kronor/dtv
 * Steps:
 *  1. Validate clean git working tree (unless --allow-dirty)
 *  2. Run lint, build, unit tests, e2e tests, build:lib
 *  3. Prompt (or use --type) for semver bump: patch | minor | major
 *  4. Run `npm version` with conventional commit message
 *  5. Push commit & tag
 *  6. Publish to npm
 *
 * Flags:
 *  --type=<patch|minor|major>  Skip interactive prompt
 *  --dry                       Perform validation & show actions without mutating version/pushing/publishing
 *  --allow-dirty               Allow running with a dirty working tree
 *  --skip-e2e                  Skip Playwright tests (useful for quicker patch releases)
 *  --skip-unit                 Skip Jest unit tests
 */

import { execSync } from 'node:child_process';
import readline from 'node:readline';
import process from 'node:process';

const args = process.argv.slice(2);
const getArg = (name) => {
    const prefix = `--${name}=`;
    const found = args.find(a => a.startsWith(prefix));
    return found ? found.substring(prefix.length) : null;
};

const hasFlag = (name) => args.includes(`--${name}`);

const dryRun = hasFlag('dry');
const allowDirty = hasFlag('allow-dirty');
const skipE2E = hasFlag('skip-e2e');
const skipUnit = hasFlag('skip-unit');
let releaseType = getArg('type');

const VALID_TYPES = ['patch', 'minor', 'major'];

function log(step, msg) {
    console.log(`\n[${step}] ${msg}`);
}

function run(cmd, step) {
    log(step, `${dryRun && step.startsWith('ACTION') ? '(dry) ' : ''}Running: ${cmd}`);
    if (dryRun && step.startsWith('ACTION')) return; // Skip mutating actions in dry mode
    execSync(cmd, { stdio: 'inherit' });
}

function ensureCleanGit() {
    log('CHECK', 'Verifying clean git working tree');
    const status = execSync('git status --porcelain').toString().trim();
    if (status && !allowDirty) {
        console.error('\nWorking tree is dirty. Commit or stash changes, or pass --allow-dirty to proceed.');
        process.exit(1);
    }
    log('CHECK', status ? 'Working tree not clean (allowed).' : 'Working tree clean.');
}

async function promptReleaseType() {
    if (releaseType) {
        if (!VALID_TYPES.includes(releaseType)) {
            console.error(`Invalid --type value: ${releaseType}. Must be one of ${VALID_TYPES.join(', ')}`);
            process.exit(1);
        }
        return releaseType;
    }
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`Select release type (${VALID_TYPES.join('/')}) [patch]: `, (answer) => {
            rl.close();
            const val = answer.trim() || 'patch';
            if (!VALID_TYPES.includes(val)) {
                console.error(`Invalid selection: ${val}`);
                process.exit(1);
            }
            releaseType = val;
            resolve(val);
        });
    });
}

async function main() {
    log('START', 'Beginning release process');
    ensureCleanGit();

    // Validation steps (always run, even in dry mode)
    run('npm run lint', 'CHECK');
    run('npm run build', 'CHECK');
    if (!skipUnit) run('npm run test-unit', 'CHECK');
    if (!skipE2E) run('npm run test', 'CHECK');
    run('npm run build:lib', 'CHECK');

    const type = await promptReleaseType();
    log('INFO', `Release type confirmed: ${type}`);

    // Mutating actions (skipped in dry mode)
    run(`npm version ${type} -m "release: %s"`, 'ACTION:npm-version');
    run('git push', 'ACTION:git-push');
    run('git push --tags', 'ACTION:git-push-tags');
    run('npm publish --access public', 'ACTION:npm-publish');

    log('DONE', dryRun ? 'Dry run completed (no changes made).' : 'Release completed successfully.');
}

main().catch(err => {
    console.error('\nRelease script failed:', err);
    process.exit(1);
});
