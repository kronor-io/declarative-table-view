/*
 * What `dtv definitions` works with. The views, their migrations and the functions projecting
 * and checking them come from the project's own copy of @kronor/dtv, loaded at runtime; these
 * types describe the shapes the CLI relies on (see framework/view-projection.ts and
 * framework/view-migrations.ts in the package).
 */

export type ControlProjection =
    | { readonly type: 'text' | 'number' | 'date' | 'dropdown' | 'multiselect' | 'custom' }
    | { readonly type: 'autocomplete'; readonly multiple: boolean }
    | { readonly type: 'customOperator'; readonly operators: readonly string[]; readonly valueControl: ControlProjection };

export type FilterProjection =
    | { readonly kind: 'leaf'; readonly cmp: string; readonly field: unknown; readonly control: ControlProjection }
    | { readonly kind: 'and' | 'or'; readonly children: readonly FilterProjection[] }
    | { readonly kind: 'not'; readonly child: FilterProjection };

export type ViewProjection = {
    readonly definition: string;
    readonly revision: number;
    readonly filters: { readonly [filterId: string]: FilterProjection };
    readonly columns: { readonly [columnId: string]: { readonly orderBy: string | null } };
    readonly items?: { readonly [filterId: string]: readonly unknown[] };
};

export type MigrationOpData = { readonly kind: string } & Record<string, unknown>;

export type ViewMigration = { readonly from: ViewProjection; readonly to: ViewProjection; readonly ops: readonly MigrationOpData[] };

export type ViewMigrationChain = {
    readonly baseline: ViewProjection;
    readonly migrations: readonly ViewMigration[];
    readonly latest: ViewProjection;
};

/** A view as the project builds it; only what the CLI reads. */
export type LoadedView = { readonly id: string; readonly migrations?: ViewMigrationChain };

/** A view definition: the views built of it (they agree on filters), and the module defining it. */
export type LoadedDefinition = { readonly instances: readonly LoadedView[]; readonly source: string | null };

/** The functions of the project's @kronor/dtv that `dtv definitions` uses. */
export type ViewTooling = {
    projectView(view: LoadedView, definition: string, revision: number): ViewProjection;
    checkMigration(migration: ViewMigration): Array<{ message: string }>;
};

/** The name of folders holding a definition's snapshots and migrations: `dtv-migrations/<definition>`. */
export const MIGRATIONS_FOLDER = 'dtv-migrations';

/** The project as `dtv definitions` sees it: its view definitions, and a way to find and load migrations. */
export type DefinitionsProject = {
    readonly definitions: Readonly<Record<string, LoadedDefinition>>;
    /** Views that could not be made definitions of, and why. */
    readonly problems: readonly string[];
    readonly tooling: ViewTooling;
    /** The projection of a definition at `revision`. */
    projectDefinition(definition: string, revision: number): ViewProjection;
    /** Every `dtv-migrations/<name>` folder with an index module, wherever it is in the project. */
    findChainFolders(): Promise<string[]>;
    /** The chain a migrations folder's index module exports; `null` when the folder has none. */
    loadChain(folder: string): Promise<ViewMigrationChain | null>;
    close(): Promise<void>;
};
