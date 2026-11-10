// What the tests use of `@kronor/dtv`, from its sources: its library build injects styles
// into a document, which tests do not have.
export { decodeUserData } from '../../dtv/src/framework/user-data';
export { latestFilterId, migrateFilterState } from '../../dtv/src/framework/view-migrations';
export { CURRENT_USERDATA_FORMAT_REVISION } from '../../dtv/src/framework/user-data.migrations';
