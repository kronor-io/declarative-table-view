/*
 * What the projects of the scenario tests import as @kronor/dtv: dtv's own sources, as an
 * app bundles the package (see moduleNameMapper in jest.cli.config.js and the tsconfig the
 * harness writes).
 */
export * as DSL from '../../../dsl';
export * as FilterValue from '../../../framework/filterValue';
export type { View } from '../../../framework/view';
export type { ViewProjection } from '../../../framework/view-projection';
export { projectView, projectionsEqual } from '../../../framework/view-projection';
export { checkMigration, migrateFilterState } from '../../../framework/view-migrations';
export { encodeUserData, readUserData, viewMigrationContext } from '../../../framework/user-data';
