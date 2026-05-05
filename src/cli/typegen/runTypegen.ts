import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import fg from 'fast-glob';
import ts from 'typescript';
import { getIntrospectionQuery, buildClientSchema, type GraphQLSchema, type GraphQLNamedType } from 'graphql';
import { loadConfig } from '../config/loadConfig.js';
import type { DtvTypegenConfig, ScanDebugOptions, ViewInfo } from '../config/types.js';
import { collectReachableTypes, renderTsFromSchema, unwrapCollectionElementType } from './schemaToTs.js';

type RunTypegenArgs = {
    configPath: string;
    onlyViewId?: string;
    debugScan?: boolean;
    debugScanFile?: string;
};

function toPascalCase(input: string): string {
    return input
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

function toIdentifier(pascal: string): string {
    if (/^[A-Za-z_]/.test(pascal)) return pascal;
    return `_${pascal}`;
}

function singleQuoteStringLiteral(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

async function writeFileEnsuringDir(filePath: string, content: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
}

async function fetchSchema(endpoint: string, headers: Record<string, string>): Promise<GraphQLSchema> {
    const query = getIntrospectionQuery({ descriptions: true });

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...headers
        },
        body: JSON.stringify({ query })
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Introspection request failed (${res.status} ${res.statusText}): ${text}`);
    }

    const json = await res.json() as any;
    if (json.errors && Array.isArray(json.errors) && json.errors.length) {
        throw new Error(`Introspection returned errors: ${JSON.stringify(json.errors, null, 2)}`);
    }
    if (!json.data) {
        throw new Error('Introspection response missing data');
    }

    return buildClientSchema(json.data);
}

function applyFileNamePattern(pattern: string, view: { viewId: string; collectionName: string }): string {
    return pattern
        .replace(/\{viewId\}/g, view.viewId)
        .replace(/\{collectionName\}/g, view.collectionName);
}

function getColumnDefinitionsArray(argObject: ts.ObjectLiteralExpression): ts.ArrayLiteralExpression | null {
    for (const p of argObject.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const name = p.name;
        const key = ts.isIdentifier(name)
            ? name.text
            : ts.isStringLiteral(name)
                ? name.text
                : null;
        if (key !== 'columnDefinitions') continue;
        return ts.isArrayLiteralExpression(p.initializer) ? p.initializer : null;
    }
    return null;
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

    const prefix = insertPos === 0 ? '' : '\n';
    const importLine = `${prefix}import { ${importName} } from ${singleQuoteStringLiteral(importPathNoExt)};\n`;
    return {
        updatedText: applyTextEdits(sourceText, [{ pos: insertPos, insert: importLine }]),
        changed: true
    };
}

function patchInlineColumnsWithRowType(args: {
    sourceText: string;
    sourceFile: ts.SourceFile;
    viewArgObject: ts.ObjectLiteralExpression;
    rowTypeIdentifier: string;
    dslIdentifiers: Set<string>;
    dtvNamespaces: Set<string>;
}): { updatedText: string; changed: boolean; patchedCount: number } {
    const cols = getColumnDefinitionsArray(args.viewArgObject);
    if (!cols) return { updatedText: args.sourceText, changed: false, patchedCount: 0 };

    const edits: Array<{ pos: number; insert: string }> = [];
    let patchedCount = 0;

    for (const el of cols.elements) {
        if (!ts.isCallExpression(el)) continue;

        const expr = el.expression;
        if (!ts.isPropertyAccessExpression(expr)) continue;
        if (expr.name.text !== 'column') continue;

        const receiver = expr.expression;
        const isDtvColumn = (() => {
            if (ts.isIdentifier(receiver) && args.dslIdentifiers.has(receiver.text)) return true;
            if (ts.isPropertyAccessExpression(receiver)) {
                if (receiver.name.text !== 'DSL') return false;
                const maybeNs = receiver.expression;
                return ts.isIdentifier(maybeNs) && args.dtvNamespaces.has(maybeNs.text);
            }
            return false;
        })();
        if (!isDtvColumn) continue;

        const firstArg = el.arguments[0];
        if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) continue;
        if (hasRowTypeProp(firstArg)) continue;

        const firstProp = firstArg.properties[0];
        const insertPos = firstProp ? firstProp.getStart(args.sourceFile, false) : firstArg.getEnd() - 1;
        const between = args.sourceText.slice(firstArg.getStart(args.sourceFile, false) + 1, insertPos);
        const isMultiline = between.includes('\n');

        if (!isMultiline) {
            edits.push({ pos: insertPos, insert: `rowType: ${args.rowTypeIdentifier}, ` });
            patchedCount += 1;
            continue;
        }

        const lineStart = args.sourceText.lastIndexOf('\n', insertPos - 1) + 1;
        const before = args.sourceText.slice(lineStart, insertPos);
        const indentMatch = before.match(/^[ \t]*/);
        const indent = indentMatch ? indentMatch[0] : '';

        edits.push({ pos: insertPos, insert: `${indent}rowType: ${args.rowTypeIdentifier},\n` });
        patchedCount += 1;
    }

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

function viewArgObjectHasIdentifier(viewArgObject: ts.ObjectLiteralExpression, identifier: string): boolean {
    let found = false;

    const visit = (node: ts.Node) => {
        if (found) return;
        if (ts.isIdentifier(node) && node.text === identifier) {
            found = true;
            return;
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
    debug?: { log: (line: string) => void }
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
                        const collectionName = tryGetStringProp(firstArg, 'collectionName');
                        if (!viewId || !collectionName) {
                            debug?.log(`- found DSL.view({ ... }) but id/collectionName not string literals (id=${viewId ?? 'null'}, collectionName=${collectionName ?? 'null'})`);
                        } else {
                            debug?.log(`- found view id=${JSON.stringify(viewId)} collectionName=${JSON.stringify(collectionName)}`);
                            views.push({
                                viewId,
                                collectionName,
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

async function scanViews(config: DtvTypegenConfig, debug?: ScanDebugOptions): Promise<ViewInfo[]> {
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
    const filesToScan = focusAbs ? files.filter(f => path.resolve(f) === path.resolve(focusAbs)) : files;
    for (const f of filesToScan) {
        if (!f.endsWith('.ts') && !f.endsWith('.tsx')) continue;
        const text = await fs.readFile(f, 'utf8');
        const fileDebug = debug?.enabled
            ? { log: (line: string) => console.log(`[dtv typegen] ${path.resolve(f)} ${line}`) }
            : undefined;
        results.push(...findViewsInFile(text, f, dtvImport, fileDebug));
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

    return results;
}

export async function runTypegen(args: RunTypegenArgs): Promise<void> {
    const config = await loadConfig(args.configPath);

    const debug: ScanDebugOptions | undefined = (args.debugScan || args.debugScanFile)
        ? { enabled: true, focusFile: args.debugScanFile }
        : undefined;

    const views = await scanViews(config, debug);
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

    const schema = await fetchSchema(config.schema.endpoint, config.schema.headers ?? {});
    const queryType = schema.getQueryType();
    if (!queryType) throw new Error('Schema has no Query type');
    const queryFields = queryType.getFields();

    const dtvImport = config.scan.dtvImport ?? '@kronor/dtv';

    // Resolve view -> row type
    const viewRows = selectedViews.map(v => {
        const f = queryFields[v.collectionName];
        if (!f) {
            const sample = Object.keys(queryFields).slice(0, 25);
            throw new Error(
                `View "${v.viewId}" references collectionName "${v.collectionName}" but it was not found on Query. `
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
                continue;
            }

            const importPathNoExt = './' + fileName.replace(/\.ts$/i, '');
            const withImport = ensureRowTypeImport(viewText, sf, rowTypeConstName, importPathNoExt);
            const sf2 = ts.createSourceFile(v.sourceFile, withImport.updatedText, ts.ScriptTarget.Latest, true);

            const viewArgObject2 = findViewArgObjectById(sf2, v.viewId);
            if (!viewArgObject2) {
                continue;
            }

            const patched = patchInlineColumnsWithRowType({
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
                ? viewArgObjectHasIdentifier(viewArgObject3, rowTypeConstName)
                : false;
            if (!shouldEmitForView) {
                await fs.rm(outFile, { force: true });
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

            if (withImport.changed || patched.changed) {
                await fs.writeFile(v.sourceFile, patched.updatedText, 'utf8');
            }
        } catch {
            // Ignore patching errors; generation still succeeds.
        }
    }

    if (args.onlyViewId) {
        console.log(`Generated types for view ${JSON.stringify(args.onlyViewId)}.`);
    } else {
        console.log(`Generated types for ${viewRows.length} view(s).`);
    }
}
