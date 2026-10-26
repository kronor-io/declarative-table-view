import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import fg from 'fast-glob';
import bundledTs from 'typescript';
import { findViewsInFile } from '../typegen/runTypegen.js';
import { MIGRATIONS_FOLDER } from './types.js';

/*
 * Finding the project's views without a list of them: the modules calling `DSL.view`, and
 * in them the exports that are views or functions returning one. A function's arguments
 * are made up from its parameter types — twice, minimal and contrasting, so that what the
 * arguments change in the view shows (see ./definitions).
 */

type Ts = typeof bundledTs;

/** Arguments for a view factory, made up from its parameter types. */
export type ArgumentSet = { minimal: () => unknown[]; contrasting: () => unknown[] };

export type DiscoveredExport =
    | { kind: 'factory'; file: string; exportName: string; args: ArgumentSet }
    | { kind: 'constant'; file: string; exportName: string };

export type Discovery = {
    exports: DiscoveredExport[];
    /** Modules calling `DSL.view` none of whose exports is a view or makes one. */
    unreachable: string[];
};

const IGNORED = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**', '**/.git/**', `**/${MIGRATIONS_FOLDER}/**`];

/** The modules calling `DSL.view`, literal id or not. */
export async function scanViewModules(cwd: string, include: string[], exclude: string[], dtvImport: string): Promise<string[]> {
    const files = await fg(include, { cwd, ignore: [...IGNORED, ...exclude], absolute: true, onlyFiles: true });
    const modules: string[] = [];
    for (const file of files) {
        if (!/\.tsx?$/.test(file) || /\.(test|spec)\.tsx?$/.test(file) || file.endsWith('.d.ts')) continue;
        const text = await fs.readFile(file, 'utf8');
        if (!text.includes(dtvImport)) continue;
        let unidentified = 0;
        const identified = findViewsInFile(text, file, dtvImport, undefined, () => { unidentified++; }).length;
        if (identified + unidentified > 0) modules.push(path.normalize(file));
    }
    return modules.sort();
}

/** The project's own TypeScript, so that its tsconfig means what it means to it. */
function projectTypeScript(cwd: string): Ts {
    try {
        return createRequire(path.join(cwd, 'package.json'))('typescript') as Ts;
    } catch {
        return bundledTs;
    }
}

const VIEW_TYPES = new Set(['View', 'CollectionView', 'FunctionView']);

export function discoverViews(cwd: string, modules: string[]): Discovery {
    const ts = projectTypeScript(cwd);
    const configFile = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');
    const options = configFile === undefined
        ? { jsx: ts.JsxEmit.Preserve, allowJs: false, skipLibCheck: true }
        : ts.parseJsonConfigFileContent(ts.readConfigFile(configFile, ts.sys.readFile).config, ts.sys, path.dirname(configFile)).options;
    const program = ts.createProgram(modules, { ...options, noEmit: true, skipLibCheck: true });
    const checker = program.getTypeChecker();

    const isView = (type: bundledTs.Type) => {
        const name = type.aliasSymbol?.name ?? type.getSymbol()?.name ?? checker.typeToString(type);
        return VIEW_TYPES.has(name);
    };

    /** A value of `type`; `contrasting` fills in optionals and lists where `minimal` leaves them out. */
    const valueOf = (type: bundledTs.Type, contrasting: boolean, depth = 0): unknown => {
        if (depth > 8) return undefined;
        const flags = type.flags;
        if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) return undefined;
        if (type.isUnion()) {
            const members = type.types.filter(member => !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)));
            if (members.length > 0 && members.every(member => member.flags & ts.TypeFlags.BooleanLiteral)) return contrasting;
            if (members.length === 0) return undefined;
            return valueOf(contrasting ? members[members.length - 1] : members[0], contrasting, depth + 1);
        }
        if (type.isStringLiteral()) return type.value;
        if (type.isNumberLiteral()) return type.value;
        if (flags & ts.TypeFlags.BooleanLiteral) return checker.typeToString(type) === 'true';
        if (flags & ts.TypeFlags.StringLike) return contrasting ? 'x1' : '';
        if (flags & ts.TypeFlags.NumberLike) return contrasting ? 1 : 0;
        if (flags & ts.TypeFlags.BooleanLike) return contrasting;
        if (flags & ts.TypeFlags.BigIntLike) return BigInt(0);
        if (type.getCallSignatures().length > 0) return () => undefined;
        if (checker.isArrayType(type) || checker.isTupleType(type)) {
            const element = checker.getTypeArguments(type as bundledTs.TypeReference)[0];
            return contrasting && element !== undefined ? [valueOf(element, contrasting, depth + 1)] : [];
        }
        if (flags & ts.TypeFlags.Object) {
            return Object.fromEntries(checker.getPropertiesOfType(type)
                .filter(property => contrasting || !(property.flags & ts.SymbolFlags.Optional))
                .map(property => [property.name, valueOf(checker.getTypeOfSymbol(property), contrasting, depth + 1)]));
        }
        return undefined;
    };

    const exports: DiscoveredExport[] = [];
    const unreachable: string[] = [];
    for (const file of modules) {
        const sourceFile = program.getSourceFile(file);
        const moduleSymbol = sourceFile === undefined ? undefined : checker.getSymbolAtLocation(sourceFile);
        if (moduleSymbol === undefined) {
            unreachable.push(file);
            continue;
        }
        const found = exports.length;
        for (const exported of checker.getExportsOfModule(moduleSymbol)) {
            const type = checker.getTypeOfSymbol(exported);
            const signatures = type.getCallSignatures();
            if (signatures.length === 0) {
                if (isView(type)) exports.push({ kind: 'constant', file, exportName: exported.name });
                continue;
            }
            const signature = signatures[signatures.length - 1];
            if (!isView(signature.getReturnType())) continue;
            const parameters = signature.getParameters().map(parameter => {
                const declaration = parameter.valueDeclaration;
                const optional = declaration !== undefined && ts.isParameter(declaration) && (declaration.questionToken !== undefined || declaration.initializer !== undefined);
                return { type: checker.getTypeOfSymbolAtLocation(parameter, declaration ?? sourceFile!), optional };
            });
            exports.push({
                kind: 'factory',
                file,
                exportName: exported.name,
                args: {
                    minimal: () => parameters.map(parameter => parameter.optional ? undefined : valueOf(parameter.type, false)),
                    contrasting: () => parameters.map(parameter => valueOf(parameter.type, true))
                }
            });
        }
        if (exports.length === found) unreachable.push(file);
    }
    return { exports, unreachable };
}
