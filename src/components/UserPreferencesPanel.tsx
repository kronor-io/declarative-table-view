import { useMemo } from 'react';

import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';

import type { ColumnDefinition, TableColumnDefinition } from '../framework/column-definition';
import type { UserPreferences, ViewData } from '../framework/user-data';
import type { ViewId } from '../framework/view';

import { PREFERENCE_DEFINITIONS } from './userPreferences';

interface UserPreferencesPanelProps {
    visible: boolean;
    preferences: UserPreferences;
    onChangePreferences: (update: (prev: UserPreferences) => UserPreferences) => Promise<UserPreferences>;

    currentView: {
        id: ViewId;
        title: string;
    };
    viewData: ViewData;
    columnDefinitions: ColumnDefinition[];
    onSetHiddenColumns: (viewId: ViewId, hiddenColumns: string[]) => Promise<ViewData>;
}

export default function UserPreferencesPanel({
    visible,
    preferences,
    onChangePreferences,
    currentView,
    viewData,
    columnDefinitions,
    onSetHiddenColumns
}: UserPreferencesPanelProps) {
    const tableColumns: TableColumnDefinition[] = useMemo(() => {
        return columnDefinitions.filter((col): col is TableColumnDefinition => col.type === 'tableColumn');
    }, [columnDefinitions]);

    const allTableColumnIds: string[] = useMemo(() => tableColumns.map(c => c.id), [tableColumns]);

    const visibleColumnIds: string[] = useMemo(() => {
        const hidden = new Set(viewData.hiddenColumns);
        return allTableColumnIds.filter(id => !hidden.has(id));
    }, [allTableColumnIds, viewData.hiddenColumns]);

    const columnOptions = useMemo(() => {
        return tableColumns.map(c => ({ label: c.name, value: c.id }));
    }, [tableColumns]);

    if (!visible) return null;

    return (
        <div className="tw:flex tw:flex-col tw:gap-4 tw:mb-4">
            <div>
                <h3 className="tw:text-lg tw:font-medium tw:text-gray-900">Preferences</h3>
            </div>

            <div className="tw:flex tw:flex-col tw:gap-6 tw:w-1/3">
                {
                    PREFERENCE_DEFINITIONS.map((def) => (
                        <div key={def.id} className="tw:flex tw:justify-between tw:items-center tw:gap-3 tw:flex-wrap">
                            <label className="tw:text-sm tw:text-gray-700 tw:w-[240px] tw:flex-shrink-0">
                                {def.label}
                            </label>

                            <div className="tw:min-w-[240px]">
                                {
                                    def.kind === 'dropdown' && (
                                        <Dropdown
                                            value={def.getValue(preferences)}
                                            options={def.options}
                                            optionLabel="label"
                                            optionValue="value"
                                            onChange={(e) => {
                                                void onChangePreferences((prev) => def.setValue(prev, e.value as boolean | null));
                                            }}
                                            className="tw:min-w-[240px]"
                                        />
                                    )
                                }
                            </div>
                        </div>
                    ))
                }
            </div>

            <div>
                <h3 className="tw:text-lg tw:font-medium tw:text-gray-900">
                    View Preferences
                    <span className="tw:text-s tw:text-gray-600">
                        <span> for </span><span>{currentView.title}</span>
                    </span>
                </h3>
            </div>

            <div className="tw:flex tw:flex-col tw:gap-6 tw:w-1/3">
                <div>
                    <div className="tw:flex tw:justify-between tw:items-center tw:gap-3 tw:flex-wrap">
                        <label className="tw:text-sm tw:text-gray-700 tw:w-[240px] tw:flex-shrink-0">
                            Displayed columns
                        </label>

                        <div className="tw:w-[320px] tw:max-w-full">
                            <MultiSelect
                                value={visibleColumnIds}
                                options={columnOptions}
                                optionLabel="label"
                                optionValue="value"
                                onChange={(e) => {
                                    const nextVisible: string[] = Array.isArray(e.value) ? (e.value as string[]) : [];
                                    const nextHidden = allTableColumnIds.filter(id => !nextVisible.includes(id));
                                    void onSetHiddenColumns(currentView.id, nextHidden);
                                }}
                                display="chip"
                                filter
                                className="tw:w-full"
                            />
                        </div>
                    </div>
                </div>
            </div>


        </div>
    );
}
