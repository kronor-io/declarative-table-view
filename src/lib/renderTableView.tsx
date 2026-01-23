import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrimeReactProvider } from 'primereact/api'

import App from '../App'
import type { UserDataLoadAPI, UserDataSaveAPI } from '../framework/user-data-manager'
import type { RowSelectionAPI } from '../components/Table'
import type { ActionDefinition } from '../framework/actions'
import type { Runtime } from '../framework/runtime'
import type { UserDataJson } from '../framework/user-data'

export type RenderTableViewUserDataOptions = {
    /** Optional async loader invoked when the user-data manager is created. */
    onLoad?: (api: UserDataLoadAPI) => Promise<UserDataJson | null>

    /** Optional async saver invoked whenever user data is saved (non-localStorage-only saves). */
    onSave?: (api: UserDataSaveAPI) => Promise<void>
}

export interface RenderTableViewOptions {
    graphqlHost: string
    graphqlToken: string
    geminiApiKey: string
    viewsJson: string
    showViewsMenu?: boolean
    showViewTitle?: boolean
    showCsvExportButton?: boolean
    showPopoutButton?: boolean
    externalRuntime?: Runtime
    syncFilterStateToUrl?: boolean
    rowSelection?: {
        rowSelectionType: 'none' | 'multiple'
        onRowSelectionChange?: (rows: any[]) => void
        apiRef?: React.RefObject<RowSelectionAPI | null>
    }
    actions?: ActionDefinition[]
    rowClassFunction?: (row: Record<string, any>) => Record<string, boolean>
    rowsPerPageOptions?: number[]

    /** Optional user data integration hooks. */
    userData?: RenderTableViewUserDataOptions
}

export function renderTableView(target: HTMLElement | string, options: RenderTableViewOptions) {
    const reactContainer = typeof target === 'string' ? document.getElementById(target) : target
    if (!reactContainer) throw new Error('Target element not found')

    createRoot(reactContainer).render(
        <StrictMode>
            <PrimeReactProvider value={{}}>
                <App
                    graphqlHost={options.graphqlHost}
                    graphqlToken={options.graphqlToken}
                    geminiApiKey={options.geminiApiKey}
                    showViewsMenu={options.showViewsMenu ?? false}
                    showViewTitle={options.showViewTitle ?? false}
                    showCsvExportButton={options.showCsvExportButton ?? false}
                    showPopoutButton={options.showPopoutButton ?? true}
                    viewsJson={options.viewsJson}
                    externalRuntime={options.externalRuntime}
                    syncFilterStateToUrl={options.syncFilterStateToUrl ?? false}
                    rowSelection={options.rowSelection}
                    actions={options.actions}
                    rowClassFunction={options.rowClassFunction}
                    rowsPerPageOptions={options.rowsPerPageOptions}
                    userData={options.userData}
                />
            </PrimeReactProvider>
        </StrictMode>
    )
}
