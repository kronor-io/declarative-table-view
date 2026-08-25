#!/usr/bin/env node
/**
 * Release script for the monorepo.
 *
 * Releases one workspace package at a time:
 *  - @kronor/dtv              (tagged `v<version>`)
 *  - @kronor/hasura-graphql   (tagged `hasura-graphql-v<version>`)
 *
 * Steps:
 *  1. Validate clean git working tree (unless --allow-dirty)
 *  2. Run lint, build, unit tests, e2e tests, build:lib across the workspace
 *  3. Prompt (or use --type) for semver bump: patch | minor | major
 *  4. Bump the package version, commit and tag
 *  5. Push commit & tag
 *  6. Publish that package to npm
 *
 * Because @kronor/dtv depends on @kronor/hasura-graphql, a dtv release checks
 * that its declared range resolves to a version already on the registry.
 * Release the core package first when you have changed it.
 *
 * Flags:
 *  --package=<dtv|hasura-graphql>  Which package to release (default: dtv)
 *  --type=<patch|minor|major>      Skip interactive prompt
 *  --dry                           Perform validation & show actions without mutating version/pushing/publishing
 *  --allow-dirty                   Allow running with a dirty working tree
 *  --skip-e2e                      Skip Playwright tests (useful for quicker patch releases)
 *  --skip-unit                     Skip Jest unit tests
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = {
    'dtv': { dir: 'packages/dtv', name: '@kronor/dtv', tag: version => `v${version}` },
    'hasura-graphql': { dir: 'packages/hasura-graphql', name: '@kronor/hasura-graphql', tag: version => `hasura-graphql-v${version}` }
};

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

const packageKey = getArg('package') ?? 'dtv';
const target = PACKAGES[packageKey];
if (!target) {
    console.error(`Invalid --package value: ${packageKey}. Must be one of ${Object.keys(PACKAGES).join(', ')}`);
    process.exit(1);
}
const packageDir = path.join(repoRoot, target.dir);

const VALID_TYPES = ['patch', 'minor', 'major'];

function log(step, msg) {
    console.log(`\n[${step}] ${msg}`);
}

function run(cmd, step, cwd = repoRoot) {
    log(step, `${dryRun && step.startsWith('ACTION') ? '(dry) ' : ''}Running: ${cmd}`);
    if (dryRun && step.startsWith('ACTION')) return; // Skip mutating actions in dry mode
    execSync(cmd, { stdio: 'inherit', cwd });
}

function readPackageJson(dir) {
    return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
}

function ensureCleanGit() {
    log('CHECK', 'Verifying clean git working tree');
    const status = execSync('git status --porcelain', { cwd: repoRoot }).toString().trim();
    if (status && !allowDirty) {
        console.error('\nWorking tree is dirty. Commit or stash changes, or pass --allow-dirty to proceed.');
        process.exit(1);
    }
    log('CHECK', status ? 'Working tree not clean (allowed).' : 'Working tree clean.');
}

// @kronor/dtv is published with a dependency on @kronor/hasura-graphql, so that
// version has to exist on the registry or installs of dtv will fail.
function ensureCoreDependencyPublished() {
    if (packageKey !== 'dtv') return;

    const range = readPackageJson(packageDir).dependencies?.['@kronor/hasura-graphql'];
    if (!range) return;

    log('CHECK', `Verifying @kronor/hasura-graphql@${range} is published`);
    let resolved;
    try {
        resolved = execSync(`npm view "@kronor/hasura-graphql@${range}" version`, { cwd: repoRoot }).toString().trim();
    } catch {
        resolved = '';
    }

    if (!resolved) {
        console.error(
            `\nNo published @kronor/hasura-graphql matches "${range}".` +
            `\nRelease it first:  npm run release -- --package=hasura-graphql`
        );
        process.exit(1);
    }
    log('CHECK', `Resolves to ${resolved.split('\n').pop()}`);
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
        rl.question(`Select release type for ${target.name} (${VALID_TYPES.join('/')}) [patch]: `, (answer) => {
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
    log('START', `Beginning release process for ${target.name}`);
    ensureCleanGit();
    ensureCoreDependencyPublished();

    // Validation steps (always run, even in dry mode)
    run('npm run lint', 'CHECK');
    run('npm run build', 'CHECK');
    if (!skipUnit) run('npm run test-unit:all', 'CHECK');
    if (!skipE2E) run('npm test', 'CHECK');
    run('npm run build:lib', 'CHECK');

    const type = await promptReleaseType();
    log('INFO', `Release type confirmed: ${type}`);

    // Mutating actions (skipped in dry mode). The version bump is done without
    // git plumbing so the tag can be namespaced per package.
    run(`npm version ${type} --no-git-tag-version`, 'ACTION:npm-version', packageDir);

    const version = dryRun ? '<dry>' : readPackageJson(packageDir).version;
    const tag = target.tag(version);

    // Commit only the files the bump touched, so an --allow-dirty release does
    // not sweep unrelated working-tree changes into the release commit.
    run(
        `git commit -m "release: ${target.name} ${version}" -- ` +
        `"${path.join(target.dir, 'package.json')}" package-lock.json`,
        'ACTION:git-commit'
    );
    run(`git tag -a ${tag} -m "${target.name} ${version}"`, 'ACTION:git-tag');
    run('git push', 'ACTION:git-push');
    run('git push --tags', 'ACTION:git-push-tags');
    run('npm publish --access public', 'ACTION:npm-publish', packageDir);

    log('DONE', dryRun ? 'Dry run completed (no changes made).' : `Released ${target.name}@${version} (${tag}).`);
}

main().catch(err => {
    console.error('\nRelease script failed:', err);
    process.exit(1);
});
