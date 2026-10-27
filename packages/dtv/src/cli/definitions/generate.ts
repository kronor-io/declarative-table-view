import type { ControlProjection, FilterProjection, ViewProjection } from './types.js';

/*
 * What `dtv definitions snapshot` writes: the snapshot of a definition's new revision, the
 * migration to it, and the folder's index. Operations the diff decides on its own are
 * written out; where it takes a person to decide (a rename, whether a changed filter still
 * means the same), a `todo` is written with the candidates in comments. A `todo` does not
 * type-check and fails `dtv definitions check`.
 */

export type GeneratedOp = {
    /** The operation, e.g. `m.drop('legacy')`. */
    readonly code: string;
    /** Comment lines written above it. */
    readonly comments: readonly string[];
    readonly todo: boolean;
};

export function deepEqual(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
        && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key)
            && deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

export function quote(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

const op = (code: string, comments: string[] = []): GeneratedOp => ({ code, comments, todo: false });
const todo = (subject: string, message: string, comments: string[]): GeneratedOp =>
    ({ code: `m.todo(${quote(subject)}, ${quote(message)})`, comments, todo: true });

/* How a filter changed */

type FilterChange = {
    /** Why stored state no longer fits, when it does not. */
    structure: string | null;
    operatorsChanged: boolean;
    /** The comparisons and fields that changed, when the shape did not. */
    meaning: string[];
};

function compareControls(from: ControlProjection, to: ControlProjection, change: FilterChange): void {
    if (from.type !== to.type) {
        change.structure ??= `its control changed from ${from.type} to ${to.type}`;
        return;
    }
    if (from.type === 'autocomplete' && to.type === 'autocomplete' && from.multiple !== to.multiple) {
        change.structure ??= `its autocomplete ${to.multiple ? 'takes several values now' : 'takes one value now'}`;
    }
    if (from.type === 'customOperator' && to.type === 'customOperator') {
        if (!deepEqual(from.operators, to.operators)) change.operatorsChanged = true;
        compareControls(from.valueControl, to.valueControl, change);
    }
}

function compareFilters(from: FilterProjection, to: FilterProjection, change: FilterChange): void {
    if (from.kind !== to.kind) {
        change.structure ??= `it changed from '${from.kind}' to '${to.kind}'`;
        return;
    }
    if (from.kind === 'leaf' && to.kind === 'leaf') {
        if (from.cmp !== to.cmp) change.meaning.push(`its comparison changed from ${from.cmp} to ${to.cmp}`);
        if (!deepEqual(from.field, to.field)) change.meaning.push(`its field changed from ${JSON.stringify(from.field)} to ${JSON.stringify(to.field)}`);
        compareControls(from.control, to.control, change);
    } else if (from.kind === 'not' && to.kind === 'not') {
        compareFilters(from.child, to.child, change);
    } else if ((from.kind === 'and' || from.kind === 'or') && (to.kind === 'and' || to.kind === 'or')) {
        if (from.children.length !== to.children.length) {
            change.structure ??= `it has ${to.children.length} parts instead of ${from.children.length}`;
            return;
        }
        from.children.forEach((child, index) => compareFilters(child, to.children[index], change));
    }
}

function operatorsOf(filter: FilterProjection): string[] {
    switch (filter.kind) {
        case 'leaf':
            return filter.control.type === 'customOperator' ? controlOperators(filter.control) : [];
        case 'not':
            return operatorsOf(filter.child);
        case 'and':
        case 'or':
            return filter.children.flatMap(operatorsOf);
    }
}

function controlOperators(control: ControlProjection): string[] {
    return control.type === 'customOperator' ? [...control.operators, ...controlOperators(control.valueControl)] : [];
}

/** `from`'s values that `to` does not have. */
function removedValues(from: readonly unknown[], to: readonly unknown[]): unknown[] {
    return from.filter(value => !to.some(other => deepEqual(other, value)));
}

const describeValues = (values: readonly unknown[]) => values.map(value => JSON.stringify(value)).join(', ');

/* The operations of a migration */

/** The operations a migration from `from` to `to` needs, as far as the diff can tell. */
export function generateOps(from: ViewProjection, to: ViewProjection): GeneratedOp[] {
    const ops: GeneratedOp[] = [];

    const removedFilters = Object.keys(from.filters).filter(id => to.filters[id] === undefined);
    const addedFilters = Object.keys(to.filters).filter(id => from.filters[id] === undefined);

    const sameStructure = (left: FilterProjection, right: FilterProjection) => {
        const change: FilterChange = { structure: null, operatorsChanged: false, meaning: [] };
        compareFilters(left, right, change);
        return change.structure === null;
    };

    const identical = (removed: string) => addedFilters.filter(added => deepEqual(from.filters[removed], to.filters[added]));

    // Renames first: one removed and one added filter with the same definition, matching
    // nothing else. What is stored for the one fits the other and means the same.
    const renames = new Map<string, string>();
    for (const removed of removedFilters) {
        const candidates = identical(removed);
        if (candidates.length === 1 && removedFilters.filter(other => identical(other).includes(candidates[0])).length === 1) {
            renames.set(removed, candidates[0]);
        }
    }
    const renamedTo = new Set(renames.values());

    for (const removed of removedFilters) {
        const target = renames.get(removed);
        if (target !== undefined) {
            ops.push(op(`m.renameFilter(${quote(removed)}, ${quote(target)})`, [
                `"${removed}" was removed and "${target}" added, with the same definition.`,
                `If "${target}" is another filter that only looks the same: m.drop(${quote(removed)})`
            ]));
            continue;
        }
        const unpaired = addedFilters.filter(added => !renamedTo.has(added));
        // Several filters with the same definition: which is which is not ours to guess.
        const candidates = identical(removed).filter(added => !renamedTo.has(added));
        if (candidates.length > 0) {
            ops.push(todo(removed, `renamed to ${candidates.map(added => `"${added}"`).join(' or ')}?`, [
                `"${removed}" was removed, and ${candidates.map(added => `"${added}"`).join(', ')} added with the same definition.`,
                ...candidates.map(added => `Renamed: m.renameFilter(${quote(removed)}, ${quote(added)})`),
                `Removed: m.drop(${quote(removed)})`
            ]));
            continue;
        }
        // Stored state of `removed` would fit these; they may be it, renamed and changed.
        const similar = unpaired.filter(added => sameStructure(from.filters[removed], to.filters[added]));
        if (similar.length === 0) {
            ops.push(op(`m.drop(${quote(removed)})`));
            continue;
        }
        ops.push(todo(removed, `renamed to ${similar.map(added => `"${added}"`).join(' or ')}, and changed?`, [
            `"${removed}" was removed, and ${similar.map(added => `"${added}"`).join(', ')} added with a state its stored state fits.`,
            ...similar.map(added => `Renamed, same meaning: m.custom(${quote(removed)}, ${quote(added)}, state => state)`),
            `Removed: m.drop(${quote(removed)})`
        ]));
    }

    /** Filters whose stored state is reset anyway: their item values do not matter. */
    const reset = new Set<string>();

    for (const filterId of Object.keys(from.filters)) {
        const toFilter = to.filters[filterId];
        if (toFilter === undefined || deepEqual(from.filters[filterId], toFilter)) continue;

        const change: FilterChange = { structure: null, operatorsChanged: false, meaning: [] };
        compareFilters(from.filters[filterId], toFilter, change);

        if (change.structure !== null) {
            reset.add(filterId);
            ops.push(op(`m.reset(${quote(filterId)})`, [
                `Stored state of "${filterId}" no longer fits: ${change.structure}.`,
                `To carry it over instead: m.custom(${quote(filterId)}, ${quote(filterId)}, state => …)`
            ]));
            continue;
        }

        const targetOperators = [...new Set(operatorsOf(toFilter))];
        const removedOperators = [...new Set(operatorsOf(from.filters[filterId]))].filter(operator => !targetOperators.includes(operator));
        const operatorMap = `m.mapOperators(${quote(filterId)}, { ${removedOperators.map(operator => `${quote(operator)}: …`).join(', ')} })`;

        if (change.meaning.length === 0 && removedOperators.length === 0) {
            // Operators were only added: every stored state still fits.
            ops.push(op(`m.mapOperators(${quote(filterId)}, {})`));
        } else if (change.meaning.length === 0) {
            ops.push(todo(filterId, `map the operators it no longer offers: ${removedOperators.join(', ')}`, [
                `Map each to one of ${targetOperators.map(quote).join(', ')}, or to null to clear it:`,
                operatorMap
            ]));
        } else {
            ops.push(todo(filterId, `${change.meaning.join(' and ')}; does what is stored still mean the same?`, [
                `"${filterId}": ${change.meaning.join(' and ')}.`,
                ...(removedOperators.length > 0
                    ? [`Its operators ${removedOperators.join(', ')} are gone too: m.custom(${quote(filterId)}, ${quote(filterId)}, state => …)`]
                    : [`Same meaning: m.keep(${quote(filterId)}, { because: '…' })`]),
                `Otherwise: m.reset(${quote(filterId)})`
            ]));
        }
    }

    // Item values a filter no longer has: what is stored for it may be one of them. Compared
    // where both snapshots have the filter's items, as `check` does.
    for (const [filterId, values] of Object.entries(from.items ?? {})) {
        const renamed = renames.get(filterId);
        const target = renamed ?? filterId;
        const toValues = to.items?.[target];
        if (toValues === undefined || to.filters[target] === undefined || reset.has(filterId)) continue;
        const removed = removedValues(values, toValues);
        if (removed.length === 0) continue;

        if (renamed !== undefined) {
            ops.push(todo(filterId, `renamed to "${renamed}", and its items no longer have ${describeValues(removed)}`, [
                `Rename it and map the values, each to one of ${describeValues(toValues)}, or to DSL.RESET to reset it:`,
                `m.custom(${quote(filterId)}, ${quote(renamed)}, state => …) in place of the m.renameFilter above`
            ]));
            continue;
        }
        const kept = values.length > removed.length;
        ops.push(todo(filterId, `its items no longer have ${describeValues(removed)}`, [
            `Map each to one of ${describeValues(toValues)}, or to DSL.DROP to clear it:`,
            `m.mapValues(${quote(filterId)}, value => ${removed.map(value => `value === ${toLiteral(value)} ? …`).join(' : ')} : ${kept ? 'value' : 'DSL.DROP'})`,
            `Otherwise: m.reset(${quote(filterId)})`
        ]));
    }

    const removedColumns = Object.keys(from.columns).filter(id => to.columns[id] === undefined);
    const addedColumns = Object.keys(to.columns).filter(id => from.columns[id] === undefined);

    for (const removed of removedColumns) {
        if (addedColumns.length === 0) {
            ops.push(op(`m.dropColumn(${quote(removed)})`));
            continue;
        }
        ops.push(todo(removed, `renamed to ${addedColumns.map(added => `"${added}"`).join(' or ')}?`, [
            `Column "${removed}" was removed and ${addedColumns.map(added => `"${added}"`).join(', ')} added.`,
            ...addedColumns.map(added => `Renamed: m.renameColumn(${quote(removed)}, ${quote(added)})`),
            `Removed: m.dropColumn(${quote(removed)})`
        ]));
    }

    for (const columnId of Object.keys(from.columns)) {
        const toColumn = to.columns[columnId];
        if (toColumn !== undefined && toColumn.orderBy !== from.columns[columnId].orderBy) {
            ops.push(op(`m.resetSort(${quote(columnId)})`, [`"${columnId}" sorts by ${toColumn.orderBy ?? 'nothing'} instead of ${from.columns[columnId].orderBy ?? 'nothing'}.`]));
        }
    }

    return ops;
}

/* Files */

const GENERATED = '// Generated by `dtv definitions snapshot`.';

function isIdentifier(key: string): boolean {
    return /^[A-Za-z_$][\w$]*$/.test(key);
}

/** `value` as a TypeScript literal. */
export function toLiteral(value: unknown, indent = ''): string {
    const inner = `${indent}    `;
    if (value === null) return 'null';
    if (typeof value === 'string') return quote(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        if (value.every(element => typeof element !== 'object' || element === null)) return `[${value.map(element => toLiteral(element)).join(', ')}]`;
        return `[\n${value.map(element => `${inner}${toLiteral(element, inner)}`).join(',\n')}\n${indent}]`;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) return '{}';
        return `{\n${entries.map(([key, element]) => `${inner}${isIdentifier(key) ? key : quote(key)}: ${toLiteral(element, inner)}`).join(',\n')}\n${indent}}`;
    }
    throw new Error(`Cannot write ${typeof value} into a snapshot`);
}

export const snapshotName = (revision: number) => `rev${revision}`;
export const snapshotFile = (revision: number) => `rev${revision}.snapshot.ts`;
/** The migration into `revision`, from the revision before it. */
export const migrationFile = (revision: number) => `rev${revision}.migration.ts`;
/** Matches `migrationFile`; its group is the revision. */
export const MIGRATION_FILE = /^rev(\d+)\.migration\.ts$/;

export function renderSnapshot(projection: ViewProjection, dtvImport: string): string {
    return [
        `${GENERATED} Do not edit: the definition "${projection.definition}" at revision ${projection.revision}.`,
        `import type { ViewProjection } from ${quote(dtvImport)};`,
        '',
        `export const ${snapshotName(projection.revision)} = ${toLiteral(projection)} as const satisfies ViewProjection;`,
        ''
    ].join('\n');
}

export function renderMigration(args: {
    fromRevision: number;
    toRevision: number;
    ops: readonly GeneratedOp[];
    dtvImport: string;
    /** Why a revision was made without a change of the definition (`--manual`). */
    manualReason?: string;
}): string {
    const from = snapshotName(args.fromRevision);
    const to = snapshotName(args.toRevision);
    const ops: GeneratedOp[] = args.manualReason === undefined
        ? [...args.ops]
        : [...args.ops, todo('manual revision', args.manualReason, [
            'The definition did not change in a way the snapshots show; say how stored data changes, e.g.',
            `m.mapValues('status', value => value === 'PAID' ? 'paid' : value)`
        ])];
    const body = ops.length === 0
        ? '[]'
        : `[\n${ops.map(generated => [
            ...generated.comments.map(comment => `    // ${comment}`),
            `    ${generated.code},`
        ].join('\n')).join('\n')}\n]`;

    return [
        `${GENERATED}${ops.some(generated => generated.todo) ? ' Replace each m.todo(…) with the operation it asks for.' : ''}`,
        `import { DSL } from ${quote(args.dtvImport)};`,
        `import { ${from} } from './${snapshotFile(args.fromRevision).replace(/\.ts$/, '')}';`,
        `import { ${to} } from './${snapshotFile(args.toRevision).replace(/\.ts$/, '')}';`,
        '',
        `export default DSL.defineMigration(${from}, ${to}, ${ops.length === 0 ? '()' : 'm'} => ${body});`,
        ''
    ].join('\n');
}

export function renderIndex(args: { baselineRevision: number; migrationRevisions: readonly number[]; dtvImport: string }): string {
    const baseline = snapshotName(args.baselineRevision);
    return [
        `${GENERATED} Do not edit.`,
        `import { DSL } from ${quote(args.dtvImport)};`,
        `import { ${baseline} } from './${snapshotFile(args.baselineRevision).replace(/\.ts$/, '')}';`,
        ...args.migrationRevisions.map(revision => `import m${revision} from './${migrationFile(revision).replace(/\.ts$/, '')}';`),
        '',
        `export default DSL.defineViewMigrations(${baseline}, [${args.migrationRevisions.map(revision => `m${revision}`).join(', ')}]);`,
        ''
    ].join('\n');
}
