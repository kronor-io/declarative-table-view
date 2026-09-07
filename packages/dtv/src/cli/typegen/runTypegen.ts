import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import fg from 'fast-glob';
import ts from 'typescript';
import type { GraphQLNamedType } from 'graphql';
import { loadConfig } from '../config/loadConfig.js';
import type { DtvTypegenConfig, ScanDebugOptions, ViewInfo } from '../config/types.js';
import {
    collectReachableTypes,
    fetchSchema,
    renderTsFromSchema,
    singleQuoteStringLiteral,
    toIdentifier,
    toPascalCase,
    unwrapCollectionElementType,
} from '@kronor/hasura-graphql/typegen';

type RunTypegenArgs = {
    configPath: string;
    onlyViewId?: string;
    debugScan?: boolean;
    debugScanFile?: string;
};

async function writeFileEnsuringDir(filePath: string, content: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
}

function applyFileNamePattern(pattern: string, view: { viewId: string; rootFieldName: string }): string {
    return pattern
        .replace(/\{viewId\}/g, view.viewId)
        .replace(/\{rootFieldName\}/g, view.rootFieldName)
        .replace(/\{collectionName\}/g, view.rootFieldName);
}

function hasRowTypeProp(obj: ts.ObjectLiteralExpression): boolean {
    for (const p of obj.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const name = p.name;
        const key = ts.isIdentifier(name)
            ? name.text
            : ts.isStringLiteral(name)
                ? name.text
                : null;
        if (key === 'rowType') return true;
    }
    return false;
}

function applyTextEdits(original: string, edits: Array<{ pos: number; insert: string }>): string {
    const sorted = [...edits].sort((a, b) => b.pos - a.pos);
    let out = original;
    for (const e of sorted) {
        out = out.slice(0, e.pos) + e.insert + out.slice(e.pos);
    }
    return out;
}

function ensureRowTypeImport(sourceText: string, sourceFile: ts.SourceFile, importName: string, importPathNoExt: string): { updatedText: string; changed: boolean } {
    for (const stmt of sourceFile.statements) {
        if (!ts.isImportDeclaration(stmt)) continue;
        if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
        if (stmt.moduleSpecifier.text !== importPathNoExt) continue;

        const nb = stmt.importClause?.namedBindings;
        if (!nb || !ts.isNamedImports(nb)) {
            return { updatedText: sourceText, changed: false };
        }

        if (nb.elements.some(e => e.name.text === importName)) {
            return { updatedText: sourceText, changed: false };
        }

        const insertPos = nb.getEnd() - 1; // before `}`
        const insert = `${nb.elements.length ? ', ' : ' '}${importName}`;
        return { updatedText: applyTextEdits(sourceText, [{ pos: insertPos, insert }]), changed: true };
    }

    const importStmts = sourceFile.statements.filter(ts.isImportDeclaration);
    const insertPos = importStmts.length
        ? importStmts[importStmts.length - 1].end
        : 0;

    // After the last import the line break belongs in front; with no imports at
    // all it belongs behind, so the file's first statement keeps its own line.
    const importStatement = `import { ${importName} } from ${singleQuoteStringLiteral(importPathNoExt)};`;
    const importLine = insertPos === 0 ? `${importStatement}\n` : `\n${importStatement}`;
    return {
        updatedText: applyTextEdits(sourceText, [{ pos: insertPos, insert: importLine }]),
        changed: true
    };
}

/**
 * DSL helpers that take a `rowType` for type checking against the view's row.
 * `column` sits directly in `columnDefinitions`; `filter` sits inside the
 * groups of `filterGroups`, so the whole view argument is searched rather than
 * one property of it.
 */
const ROW_TYPED_HELPERS = new Set(['column', 'filter']);

/** A `DSL.<helper>(...)` / `<ns>.DSL.<helper>(...)` call, however DTV was imported. */
function getRowTypedHelperCall(
    node: ts.Node,
    dslIdentifiers: Set<string>,
    dtvNamespaces: Set<string>
): ts.CallExpression | null {
    if (!ts.isCallExpression(node)) return null;

    const expr = node.expression;
    if (!ts.isPropertyAccessExpression(expr)) return null;
    if (!ROW_TYPED_HELPERS.has(expr.name.text)) return null;

    const receiver = expr.expression;
    if (ts.isIdentifier(receiver) && dslIdentifiers.has(receiver.text)) return node;
    if (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'DSL') {
        const maybeNs = receiver.expression;
        if (ts.isIdentifier(maybeNs) && dtvNamespaces.has(maybeNs.text)) return node;
    }

    return null;
}

function patchInlineRowTypeArgs(args: {
    sourceText: string;
    sourceFile: ts.SourceFile;
    viewArgObject: ts.ObjectLiteralExpression;
    rowTypeIdentifier: string;
    dslIdentifiers: Set<string>;
    dtvNamespaces: Set<string>;
}): { updatedText: string; changed: boolean; patchedCount: number } {
    const edits: Array<{ pos: number; insert: string }> = [];
    let patchedCount = 0;

    const visit = (node: ts.Node) => {
        const call = getRowTypedHelperCall(node, args.dslIdentifiers, args.dtvNamespaces);
        if (call) {
            const firstArg = call.arguments[0];
            if (firstArg && ts.isObjectLiteralExpression(firstArg) && !hasRowTypeProp(firstArg)) {
                const firstProp = firstArg.properties[0];
                const insertPos = firstProp ? firstProp.getStart(args.sourceFile, false) : firstArg.getEnd() - 1;
                const between = args.sourceText.slice(firstArg.getStart(args.sourceFile, false) + 1, insertPos);
                const isMultiline = between.includes('\n');

                if (isMultiline) {
                    // insertPos sits after the first property's indentation, so
                    // the new property goes in first and carries that
                    // indentation over to the one it displaced.
                    const lineStart = args.sourceText.lastIndexOf('\n', insertPos - 1) + 1;
                    const indent = args.sourceText.slice(lineStart, insertPos).match(/^[ \t]*/)?.[0] ?? '';
                    edits.push({ pos: insertPos, insert: `rowType: ${args.rowTypeIdentifier},\n${indent}` });
                } else {
                    edits.push({ pos: insertPos, insert: `rowType: ${args.rowTypeIdentifier}, ` });
                }

                patchedCount += 1;
            }
        }

        ts.forEachChild(node, visit);
    };

    visit(args.viewArgObject);

    if (edits.length === 0) {
        return { updatedText: args.sourceText, changed: false, patchedCount: 0 };
    }

    return {
        updatedText: applyTextEdits(args.sourceText, edits),
        changed: true,
        patchedCount
    };
}

function findViewArgObjectById(
    sourceFile: ts.SourceFile,
    viewId: string,
    receivers?: { dslIdentifiers: Set<string>; dtvNamespaces: Set<string> }
): ts.ObjectLiteralExpression | null {
    let viewArgObject: ts.ObjectLiteralExpression | null = null;

    const visit = (node: ts.Node) => {
        if (viewArgObject) return;
        if (ts.isCallExpression(node)) {
            const expr = node.expression;
            if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'view') {
                if (receivers) {
                    const receiver = expr.expression;
                    const isDslReceiver = (() => {
                        if (ts.isIdentifier(receiver) && receivers.dslIdentifiers.has(receiver.text)) return true;
                        if (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'DSL') {
                            const maybeNs = receiver.expression;
                            return ts.isIdentifier(maybeNs) && receivers.dtvNamespaces.has(maybeNs.text);
                        }
                        return false;
                    })();
                    if (!isDslReceiver) return;
                }

                const firstArg = node.arguments[0];
                if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return;

                const idProp = firstArg.properties.find(p => ts.isPropertyAssignment(p)
                    && ((ts.isIdentifier(p.name) && p.name.text === 'id')
                        || (ts.isStringLiteral(p.name) && p.name.text === 'id'))
                ) as ts.PropertyAssignment | undefined;
                const idVal = idProp?.initializer;
                const id = idVal && (ts.isStringLiteral(idVal) || ts.isNoSubstitutionTemplateLiteral(idVal))
                    ? idVal.text
                    : null;

                if (id === viewId) {
                    viewArgObject = firstArg;
                }
            }
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return viewArgObject;
}

function containsIdentifier(root: ts.Node, identifier: string): boolean {
    let found = false;

    const visit = (node: ts.Node) => {
        if (found) return;
        if (ts.isIdentifier(node) && node.text === identifier) {
            found = true;
            return;
        }
        ts.forEachChild(node, visit);
    };

    visit(root);
    return found;
}

/**
 * The `rowType:` values in a view that are something other than the generated
 * const — a hand-written shape, or `{} as any`. Those views read as covered
 * while their checks run against a type nobody regenerates, which is worth
 * telling their author about; passing no `rowType` at all is a different and
 * perfectly fair choice.
 */
function findForeignRowTypes(
    viewArgObject: ts.ObjectLiteralExpression,
    sourceFile: ts.SourceFile,
    rowTypeConstName: string
): string[] {
    const found: string[] = [];

    const visit = (node: ts.Node) => {
        if (ts.isPropertyAssignment(node)) {
            const name = node.name;
            const key = ts.isIdentifier(name)
                ? name.text
                : ts.isStringLiteral(name)
                    ? name.text
                    : null;
            if (key === 'rowType' && !containsIdentifier(node.initializer, rowTypeConstName)) {
                const text = node.initializer.getText(sourceFile).replace(/\s+/g, ' ');
                found.push(text.length > 60 ? `${text.slice(0, 57)}...` : text);
            }
        }
        ts.forEachChild(node, visit);
    };

    visit(viewArgObject);
    return found;
}

function findViewsInFile(
    sourceText: string,
    fileName: string,
    dtvImport: string,
    debug?: { log: (line: string) => void },
    /** Called for a `DSL.view({ ... })` whose id or source is not a string literal. */
    onUnidentified?: (detail: string) => void
): ViewInfo[] {
    const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);

    const unwrapParens = (expr: ts.Expression): ts.Expression => {
        let cur: ts.Expression = expr;
        while (ts.isParenthesizedExpression(cur)) {
            cur = cur.expression;
        }
        return cur;
    };

    const getDslReceivers = (): { dslIdentifiers: Set<string>; dtvNamespaces: Set<string> } => {
        const dslIdentifiers = new Set<string>();
        const dtvNamespaces = new Set<string>();

        for (const stmt of sourceFile.statements) {
            if (ts.isImportDeclaration(stmt)) {
                if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
                if (stmt.moduleSpecifier.text !== dtvImport) continue;

                const clause = stmt.importClause;
                if (!clause) continue;

                if (clause.name) {
                    dtvNamespaces.add(clause.name.text);
                }

                const nb = clause.namedBindings;
                if (!nb) continue;
                if (ts.isNamespaceImport(nb)) {
                    dtvNamespaces.add(nb.name.text);
                    continue;
                }
                if (ts.isNamedImports(nb)) {
                    for (const el of nb.elements) {
                        const imported = (el.propertyName ?? el.name).text;
                        const local = el.name.text;
                        if (imported === 'DSL') {
                            dslIdentifiers.add(local);
                        }
                    }
                    continue;
                }
            }

            if (ts.isImportEqualsDeclaration(stmt)) {
                const mr = stmt.moduleReference;
                if (!ts.isExternalModuleReference(mr)) continue;
                const expr = mr.expression;
                if (!expr || !ts.isStringLiteral(expr)) continue;
                if (expr.text !== dtvImport) continue;
                dtvNamespaces.add(stmt.name.text);
                continue;
            }

            if (ts.isVariableStatement(stmt)) {
                for (const decl of stmt.declarationList.declarations) {
                    if (!decl.initializer) continue;
                    const init = unwrapParens(decl.initializer);
                    if (!ts.isCallExpression(init)) continue;
                    if (!ts.isIdentifier(init.expression) || init.expression.text !== 'require') continue;
                    const arg0 = init.arguments[0];
                    if (!arg0 || !ts.isStringLiteral(arg0) || arg0.text !== dtvImport) continue;

                    if (ts.isIdentifier(decl.name)) {
                        dtvNamespaces.add(decl.name.text);
                        continue;
                    }
                    if (ts.isObjectBindingPattern(decl.name)) {
                        for (const el of decl.name.elements) {
                            const imported = (el.propertyName ?? el.name);
                            if (ts.isIdentifier(imported) && imported.text === 'DSL') {
                                if (ts.isIdentifier(el.name)) {
                                    dslIdentifiers.add(el.name.text);
                                }
                            }
                        }
                    }
                }
            }
        }

        return { dslIdentifiers, dtvNamespaces };
    };

    const receivers = getDslReceivers();
    if (receivers.dslIdentifiers.size === 0 && receivers.dtvNamespaces.size === 0) {
        debug?.log(`- no matching imports/requires from ${JSON.stringify(dtvImport)}`);
        return [];
    }

    debug?.log(`- dslIdentifiers: ${[...receivers.dslIdentifiers].sort().join(', ') || '(none)'}`);
    debug?.log(`- dtvNamespaces: ${[...receivers.dtvNamespaces].sort().join(', ') || '(none)'}`);

    const views: ViewInfo[] = [];

    const tryGetStringProp = (obj: ts.ObjectLiteralExpression, propName: string): string | null => {
        for (const p of obj.properties) {
            if (!ts.isPropertyAssignment(p)) continue;
            const name = p.name;
            const key = ts.isIdentifier(name)
                ? name.text
                : ts.isStringLiteral(name)
                    ? name.text
                    : null;
            if (key !== propName) continue;
            if (ts.isStringLiteral(p.initializer)) return p.initializer.text;
            if (ts.isNoSubstitutionTemplateLiteral(p.initializer)) return p.initializer.text;
            return null;
        }
        return null;
    };

    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            const expr = node.expression;
            if (ts.isPropertyAccessExpression(expr)) {
                const receiver = unwrapParens(expr.expression);
                const method = expr.name.text;

                const isDslReceiver = (() => {
                    if (ts.isIdentifier(receiver) && receivers.dslIdentifiers.has(receiver.text)) return true;
                    if (ts.isPropertyAccessExpression(receiver)) {
                        const maybeNs = unwrapParens(receiver.expression);
                        if (receiver.name.text !== 'DSL') return false;
                        return ts.isIdentifier(maybeNs) && receivers.dtvNamespaces.has(maybeNs.text);
                    }
                    return false;
                })();

                if (method === 'view' && isDslReceiver) {
                    const firstArg = node.arguments[0];
                    if (!firstArg) {
                        debug?.log('- found DSL.view(...) with no args (skipping)');
                    } else if (!ts.isObjectLiteralExpression(firstArg)) {
                        debug?.log('- found DSL.view(<non-object-literal>) (skipping)');
                    } else {
                        const viewId = tryGetStringProp(firstArg, 'id');
                        const sourceProp = firstArg.properties.find((prop) => {
                            if (!ts.isPropertyAssignment(prop)) return false;
                            const name = prop.name;
                            const key = ts.isIdentifier(name)
                                ? name.text
                                : ts.isStringLiteral(name)
                                    ? name.text
                                    : null;
                            return key === 'source';
                        });

                        let collectionName: string | null = null;
                        let functionName: string | null = null;
                        let sourceType: string | null = null;

                        if (sourceProp && ts.isPropertyAssignment(sourceProp) && ts.isObjectLiteralExpression(sourceProp.initializer)) {
                            sourceType = tryGetStringProp(sourceProp.initializer, 'type');
                            collectionName = tryGetStringProp(sourceProp.initializer, 'collectionName');
                            functionName = tryGetStringProp(sourceProp.initializer, 'functionName');
                        }

                        const rootFieldName = sourceType === 'collection'
                            ? collectionName
                            : sourceType === 'function'
                                ? functionName
                                : null;

                        if (!viewId || !sourceType || !rootFieldName || (collectionName && functionName)) {
                            const detail = `id=${viewId ?? 'not a string literal'}, sourceType=${sourceType ?? 'not a string literal'}, collectionName=${collectionName ?? 'null'}, functionName=${functionName ?? 'null'}`;
                            debug?.log(`- found DSL.view({ ... }) but id/source not valid string literals (${detail})`);
                            onUnidentified?.(detail);
                        } else {
                            debug?.log(`- found view id=${JSON.stringify(viewId)} rootFieldName=${JSON.stringify(rootFieldName)}`);
                            views.push({
                                viewId,
                                rootFieldName,
                                sourceFile: fileName
                            });
                        }
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return views;
}

type UnidentifiedView = { sourceFile: string; detail: string };

async function scanViews(
    config: DtvTypegenConfig,
    debug?: ScanDebugOptions
): Promise<{ views: ViewInfo[]; unidentified: UnidentifiedView[] }> {
    const dtvImport = config.scan.dtvImport ?? '@kronor/dtv';

    const files = await fg(config.scan.include, {
        ignore: config.scan.exclude ?? [],
        absolute: true,
        onlyFiles: true
    });

    const focusAbs = debug?.focusFile
        ? (path.isAbsolute(debug.focusFile) ? debug.focusFile : path.resolve(process.cwd(), debug.focusFile))
        : undefined;

    if (debug?.enabled) {
        console.log('[dtv typegen] scan debug');
        console.log(`- dtvImport: ${dtvImport}`);
        console.log(`- include: ${JSON.stringify(config.scan.include)}`);
        console.log(`- exclude: ${JSON.stringify(config.scan.exclude ?? [])}`);
        console.log(`- matchedFiles: ${files.length}`);
        if (focusAbs) {
            console.log(`- focusFile: ${focusAbs}`);
            console.log(`- focusFileMatchedByGlob: ${files.map(f => path.resolve(f)).includes(path.resolve(focusAbs))}`);
        }
    }

    const results: ViewInfo[] = [];
    const unidentified: { sourceFile: string; detail: string }[] = [];
    const filesToScan = focusAbs ? files.filter(f => path.resolve(f) === path.resolve(focusAbs)) : files;
    for (const f of filesToScan) {
        if (!f.endsWith('.ts') && !f.endsWith('.tsx')) continue;
        const text = await fs.readFile(f, 'utf8');
        const fileDebug = debug?.enabled
            ? { log: (line: string) => console.log(`[dtv typegen] ${path.resolve(f)} ${line}`) }
            : undefined;
        results.push(...findViewsInFile(text, f, dtvImport, fileDebug, detail => {
            unidentified.push({ sourceFile: f, detail });
        }));
    }

    const byId = new Map<string, ViewInfo[]>();
    for (const v of results) {
        const list = byId.get(v.viewId);
        if (list) list.push(v);
        else byId.set(v.viewId, [v]);
    }

    const duplicates: Array<{ viewId: string; views: ViewInfo[] }> = [];
    for (const [viewId, views] of byId.entries()) {
        if (views.length > 1) duplicates.push({ viewId, views });
    }

    if (duplicates.length) {
        const lines: string[] = [];
        lines.push('Duplicate DTV view ids found (each view `id` must be unique):');
        for (const d of duplicates.sort((a, b) => a.viewId.localeCompare(b.viewId))) {
            lines.push(`- ${d.viewId}`);
            for (const v of d.views) {
                lines.push(`  - ${path.resolve(v.sourceFile)}`);
            }
        }
        throw new Error(lines.join('\n'));
    }

    return { views: results, unidentified };
}

export async function runTypegen(args: RunTypegenArgs): Promise<void> {
    const config = await loadConfig(args.configPath);

    const debug: ScanDebugOptions | undefined = (args.debugScan || args.debugScanFile)
        ? { enabled: true, focusFile: args.debugScanFile }
        : undefined;

    const { views, unidentified } = await scanViews(config, debug);

    // Reported before anything else: a view read as unidentified generates
    // nothing, which leaves any committed types for it silently frozen.
    for (const u of unidentified) {
        console.warn(`Warning: DSL.view({ ... }) in ${path.resolve(u.sourceFile)} was not read — ${u.detail}. Its id and source.collectionName / source.functionName must be string literals for types to be generated.`);
    }

    if (views.length === 0) {
        throw new Error('No views found. Ensure Config.scan.include matches files that import DSL from your configured DTV specifier and call DSL.view({ ... }).');
    }

    const selectedViews = args.onlyViewId
        ? views.filter(v => v.viewId === args.onlyViewId)
        : views;

    if (args.onlyViewId && selectedViews.length === 0) {
        const sample = views.map(v => v.viewId).slice(0, 25);
        throw new Error(
            `No view found with id ${JSON.stringify(args.onlyViewId)}. `
            + `Sample discovered view ids: ${sample.join(', ')}${sample.length === 25 ? ', ...' : ''}`
        );
    }

    const schema = await fetchSchema({ endpoint: config.schema.endpoint, headers: config.schema.headers ?? {} });
    const queryType = schema.getQueryType();
    if (!queryType) throw new Error('Schema has no Query type');
    const queryFields = queryType.getFields();

    const dtvImport = config.scan.dtvImport ?? '@kronor/dtv';

    // Resolve view -> row type
    const viewRows = selectedViews.map(v => {
        const f = queryFields[v.rootFieldName];
        if (!f) {
            const sample = Object.keys(queryFields).slice(0, 25);
            throw new Error(
                `View "${v.viewId}" references query root "${v.rootFieldName}" but it was not found on Query. `
                + `Sample Query fields: ${sample.join(', ')}${sample.length === 25 ? ', ...' : ''}`
            );
        }
        const rowNamed = unwrapCollectionElementType(f.type);
        return {
            ...v,
            rowTypeName: rowNamed.name
        };
    });

    const outputFiles = new Set<string>();
    /**
     * What became of each view. A view that produces nothing leaves whatever
     * generated file is already committed in place, so silence here reads as
     * success while the row type it describes goes stale — every outcome is
     * recorded and reported.
     */
    const written: string[] = [];
    const removed: { viewId: string; outFile: string }[] = [];
    const skipped: { viewId: string; reason: string }[] = [];
    const optedOut: string[] = [];
    const failed: { viewId: string; message: string }[] = [];

    for (const v of viewRows) {
        const root = schema.getType(v.rowTypeName);
        if (!root || Array.isArray(root)) {
            throw new Error(`Could not resolve row type "${v.rowTypeName}" in schema for view "${v.viewId}"`);
        }

        const reachable = collectReachableTypes(schema, [root as GraphQLNamedType]);
        const viewTypeName = `${toIdentifier(toPascalCase(v.viewId))}Row`;
        const rowTypeConstName = `${toIdentifier(toPascalCase(v.viewId))}RowType`;

        const fileName = applyFileNamePattern(config.output.fileNamePattern, v);
        if (!fileName.endsWith('.ts')) {
            throw new Error(`Config.output.fileNamePattern must produce a .ts file name. Got: ${fileName}`);
        }

        const outFile = path.join(path.dirname(v.sourceFile), fileName);

        // Best-effort patch view file for inline columns.
        try {
            const viewText = await fs.readFile(v.sourceFile, 'utf8');
            const sf = ts.createSourceFile(v.sourceFile, viewText, ts.ScriptTarget.Latest, true);

            const dslIdentifiers = new Set<string>();
            const dtvNamespaces = new Set<string>();
            for (const stmt of sf.statements) {
                if (ts.isImportDeclaration(stmt)) {
                    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
                    if (stmt.moduleSpecifier.text !== dtvImport) continue;
                    const clause = stmt.importClause;
                    if (!clause) continue;
                    if (clause.name) dtvNamespaces.add(clause.name.text);
                    const nb = clause.namedBindings;
                    if (!nb) continue;
                    if (ts.isNamespaceImport(nb)) {
                        dtvNamespaces.add(nb.name.text);
                        continue;
                    }
                    if (ts.isNamedImports(nb)) {
                        for (const el of nb.elements) {
                            const imported = (el.propertyName ?? el.name).text;
                            const local = el.name.text;
                            if (imported === 'DSL') dslIdentifiers.add(local);
                        }
                    }
                }

                if (ts.isImportEqualsDeclaration(stmt)) {
                    const mr = stmt.moduleReference;
                    if (!ts.isExternalModuleReference(mr)) continue;
                    const expr = mr.expression;
                    if (!expr || !ts.isStringLiteral(expr)) continue;
                    if (expr.text !== dtvImport) continue;
                    dtvNamespaces.add(stmt.name.text);
                }

                if (ts.isVariableStatement(stmt)) {
                    for (const decl of stmt.declarationList.declarations) {
                        if (!decl.initializer) continue;
                        if (!ts.isCallExpression(decl.initializer)) continue;
                        if (!ts.isIdentifier(decl.initializer.expression) || decl.initializer.expression.text !== 'require') continue;
                        const arg0 = decl.initializer.arguments[0];
                        if (!arg0 || !ts.isStringLiteral(arg0) || arg0.text !== dtvImport) continue;

                        if (ts.isIdentifier(decl.name)) {
                            dtvNamespaces.add(decl.name.text);
                        } else if (ts.isObjectBindingPattern(decl.name)) {
                            for (const el of decl.name.elements) {
                                const imported = (el.propertyName ?? el.name);
                                if (ts.isIdentifier(imported) && imported.text === 'DSL') {
                                    if (ts.isIdentifier(el.name)) dslIdentifiers.add(el.name.text);
                                }
                            }
                        }
                    }
                }
            }

            const viewArgObject = findViewArgObjectById(sf, v.viewId, { dslIdentifiers, dtvNamespaces });
            if (!viewArgObject) {
                skipped.push({
                    viewId: v.viewId,
                    reason: `could not locate the DSL.view({ id: ${JSON.stringify(v.viewId)} }) argument in ${path.resolve(v.sourceFile)}`
                });
                continue;
            }

            const importPathNoExt = './' + fileName.replace(/\.ts$/i, '');
            const withImport = ensureRowTypeImport(viewText, sf, rowTypeConstName, importPathNoExt);
            const sf2 = ts.createSourceFile(v.sourceFile, withImport.updatedText, ts.ScriptTarget.Latest, true);

            const viewArgObject2 = findViewArgObjectById(sf2, v.viewId);
            if (!viewArgObject2) {
                skipped.push({
                    viewId: v.viewId,
                    reason: `could not re-locate the view argument after adding the ${rowTypeConstName} import`
                });
                continue;
            }

            const patched = patchInlineRowTypeArgs({
                sourceText: withImport.updatedText,
                sourceFile: sf2,
                viewArgObject: viewArgObject2,
                rowTypeIdentifier: rowTypeConstName,
                dslIdentifiers,
                dtvNamespaces
            });

            const sf3 = ts.createSourceFile(v.sourceFile, patched.updatedText, ts.ScriptTarget.Latest, true);
            const viewArgObject3 = findViewArgObjectById(sf3, v.viewId, { dslIdentifiers, dtvNamespaces });
            const shouldEmitForView = viewArgObject3
                ? containsIdentifier(viewArgObject3, rowTypeConstName)
                : false;
            if (!shouldEmitForView) {
                // Nothing in the view reads the generated module. Passing no
                // rowType is a fair choice; passing one of the view's own is
                // not the same thing, and neither is losing the view argument
                // — so each is named rather than left to silence.
                const foreign = viewArgObject3
                    ? findForeignRowTypes(viewArgObject3, sf3, rowTypeConstName)
                    : [];
                const existed = await fs.access(outFile).then(() => true, () => false);
                await fs.rm(outFile, { force: true });
                if (existed) removed.push({ viewId: v.viewId, outFile });

                if (!viewArgObject3) {
                    skipped.push({
                        viewId: v.viewId,
                        reason: `its view argument could not be located after patching ${path.resolve(v.sourceFile)}`
                    });
                } else if (foreign.length) {
                    skipped.push({
                        viewId: v.viewId,
                        reason: `it passes rowType: ${foreign[0]} rather than ${rowTypeConstName}, so its checks run against a hand-written type instead of the generated one`
                    });
                } else if (!existed) {
                    optedOut.push(v.viewId);
                }
                continue;
            }

            if (outputFiles.has(outFile)) {
                throw new Error(`Multiple views would write the same output file: ${outFile}`);
            }
            outputFiles.add(outFile);

            const content = [
                `import { DSL as DTV } from ${singleQuoteStringLiteral(dtvImport)};`,
                '',
                renderTsFromSchema(reachable, {
                    scalars: config.scalars,
                    includeGraphqlTypeComments: config.debug?.includeGraphqlTypeComments === true,
                    exportTypes: false
                }).trimEnd(),
                '',
                `export type ${viewTypeName} = ${v.rowTypeName};`,
                `export const ${rowTypeConstName} = DTV.rowType<${viewTypeName}>();`,
                ''
            ].join('\n');

            await writeFileEnsuringDir(outFile, content);
            written.push(outFile);

            if (withImport.changed || patched.changed) {
                await fs.writeFile(v.sourceFile, patched.updatedText, 'utf8');
            }
        } catch (error) {
            // Keep going so one broken view doesn't hide the rest, and report
            // it at the end: this used to be swallowed, which left the view's
            // committed types silently frozen at whatever they were.
            failed.push({ viewId: v.viewId, message: error instanceof Error ? error.message : String(error) });
        }
    }

    for (const r of removed) {
        console.warn(`Removed ${path.resolve(r.outFile)} — view ${JSON.stringify(r.viewId)} no longer passes its rowType.`);
    }
    for (const sk of skipped) {
        console.warn(`Warning: generated no types for view ${JSON.stringify(sk.viewId)} — ${sk.reason}.`);
    }
    for (const viewId of optedOut) {
        console.log(`View ${JSON.stringify(viewId)} passes no rowType, so it has no generated types.`);
    }

    if (args.onlyViewId) {
        console.log(`Generated types for view ${JSON.stringify(args.onlyViewId)}.`);
    } else {
        console.log(`Generated types for ${written.length} of ${viewRows.length} view(s).`);
    }

    if (failed.length) {
        const lines = ['Type generation failed for:'];
        for (const f of failed) lines.push(`- ${f.viewId}: ${f.message}`);
        lines.push('Their committed generated types are unchanged and may now be stale.');
        throw new Error(lines.join('\n'));
    }
}
