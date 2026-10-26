import ts from 'typescript';
import { MIGRATIONS_FOLDER } from './types.js';

/*
 * Wiring a view up with its migrations: an import of the migrations folder, and
 * `migrations: <name>` in its `DSL.view({ … })` call. Edits are text insertions at
 * positions found in the syntax tree, written in the module's own style (quotes,
 * semicolons, indentation), so nothing else in it changes.
 */

export type Wiring =
    | { kind: 'wired'; text: string }
    | { kind: 'unwirable'; reason: string };

function camelCase(definition: string): string {
    return definition.replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string | undefined) => (next ?? '').toUpperCase()).replace(/^[^A-Za-z_$]/, '_$&');
}

/** The local names `DSL` is imported under from `dtvImport`, and namespaces of `dtvImport`. */
function dslReceivers(sourceFile: ts.SourceFile, dtvImport: string): { dsl: Set<string>; namespaces: Set<string> } {
    const dsl = new Set<string>();
    const namespaces = new Set<string>();
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        if (statement.moduleSpecifier.text !== dtvImport) continue;
        const bindings = statement.importClause?.namedBindings;
        if (bindings !== undefined && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
        if (bindings !== undefined && ts.isNamedImports(bindings)) {
            for (const element of bindings.elements) {
                if ((element.propertyName ?? element.name).text === 'DSL') dsl.add(element.name.text);
            }
        }
    }
    return { dsl, namespaces };
}

/** The `DSL.view({ … })` calls of a module, with their object literals. */
function viewCalls(sourceFile: ts.SourceFile, dtvImport: string): ts.ObjectLiteralExpression[] {
    const { dsl, namespaces } = dslReceivers(sourceFile, dtvImport);
    const calls: ts.ObjectLiteralExpression[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'view') {
            const receiver = node.expression.expression;
            const isDsl = (ts.isIdentifier(receiver) && dsl.has(receiver.text))
                || (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'DSL' && ts.isIdentifier(receiver.expression) && namespaces.has(receiver.expression.text));
            const [argument] = node.arguments;
            if (isDsl && argument !== undefined && ts.isObjectLiteralExpression(argument)) calls.push(argument);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return calls;
}

function propertyNamed(literal: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | undefined {
    return literal.properties.find(property =>
        property.name !== undefined && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === name);
}

function literalId(literal: ts.ObjectLiteralExpression): string | null {
    const id = propertyNamed(literal, 'id');
    if (id === undefined || !ts.isPropertyAssignment(id)) return null;
    return ts.isStringLiteral(id.initializer) || ts.isNoSubstitutionTemplateLiteral(id.initializer) ? id.initializer.text : null;
}

function indentationAt(text: string, position: number): string {
    const lineStart = text.lastIndexOf('\n', position - 1) + 1;
    return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? '';
}

/**
 * Wires the view of `definition` in the module `text` up with the migrations imported from
 * `specifier`. The call is the one with the definition's literal id, or else the module's
 * only `DSL.view` call.
 */
export function wireMigrations(text: string, fileName: string, definition: string, specifier: string, dtvImport: string): Wiring {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const calls = viewCalls(sourceFile, dtvImport);
    const byId = calls.filter(call => literalId(call) === definition);
    const call = byId.length === 1 ? byId[0] : calls.length === 1 ? calls[0] : undefined;
    if (call === undefined) {
        return { kind: 'unwirable', reason: calls.length === 0 ? 'no DSL.view call found in it' : `several DSL.view calls in it, none with the id '${definition}'` };
    }
    if (propertyNamed(call, 'migrations') !== undefined) {
        return { kind: 'unwirable', reason: 'its DSL.view call has migrations already' };
    }

    // The name to import the migrations by; one the module does not use yet.
    let name = `${camelCase(definition)}Migrations`;
    for (let suffix = 2; new RegExp(`\\b${name}\\b`).test(text); suffix++) name = `${camelCase(definition)}Migrations${suffix}`;

    // The module's style, from its imports.
    const imports = sourceFile.statements.filter(ts.isImportDeclaration);
    const lastImport = imports[imports.length - 1];
    const quote = lastImport !== undefined && lastImport.moduleSpecifier.getText(sourceFile).startsWith('"') ? '"' : "'";
    const semicolon = lastImport === undefined || lastImport.getText(sourceFile).trimEnd().endsWith(';') ? ';' : '';

    const edits: Array<{ position: number; insert: string }> = [];

    // `migrations: name` after `id`, or as the first property.
    const anchor = propertyNamed(call, 'id') ?? call.properties[0];
    if (anchor === undefined) {
        edits.push({ position: call.getStart(sourceFile) + 1, insert: ` migrations: ${name} ` });
    } else {
        const indentation = indentationAt(text, anchor.getStart(sourceFile));
        const after = anchor.getEnd();
        const hasComma = text.slice(after).trimStart().startsWith(',');
        edits.push(hasComma
            ? { position: text.indexOf(',', after) + 1, insert: `\n${indentation}migrations: ${name},` }
            : { position: after, insert: `,\n${indentation}migrations: ${name}` });
    }

    const importLine = `import ${name} from ${quote}${specifier}${quote}${semicolon}`;
    edits.push(lastImport === undefined
        ? { position: 0, insert: `${importLine}\n` }
        : { position: lastImport.getEnd(), insert: `\n${importLine}` });

    const wired = edits
        .sort((left, right) => right.position - left.position)
        .reduce((current, edit) => current.slice(0, edit.position) + edit.insert + current.slice(edit.position), text);
    return { kind: 'wired', text: wired };
}

/** The module with imports of the folder `dtv-migrations/<from>` pointed at `dtv-migrations/<to>`; `null` when it has none. */
export function renameMigrationsImport(text: string, from: string, to: string): string | null {
    const pattern = new RegExp(`(['"])((?:[^'"\\n]*/)?${MIGRATIONS_FOLDER}/)${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/index)?\\1`, 'g');
    const renamed = text.replace(pattern, (_, quote: string, prefix: string, index: string | undefined) => `${quote}${prefix}${to}${index ?? ''}${quote}`);
    return renamed === text ? null : renamed;
}
