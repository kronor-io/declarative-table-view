import type { UserPreferences } from '../framework/user-data';

export type PreferenceOption<V> = {
    label: string;
    value: V;
};

export type DropdownPreferenceDefinition<V> = {
    id: string;
    kind: 'dropdown';
    label: string;
    options: Array<PreferenceOption<V>>;
    getValue: (preferences: UserPreferences) => V;
    setValue: (prev: UserPreferences, value: V) => UserPreferences;
};

export type PreferenceDefinition = DropdownPreferenceDefinition<boolean | null>;

export const PREFERENCE_DEFINITIONS: PreferenceDefinition[] = [
    {
        id: 'syncFilterStateToUrlOverride',
        kind: 'dropdown',
        label: 'Reflect filter state in the URL',
        options: [
            { label: 'Use app setting', value: null },
            { label: 'Yes', value: true },
            { label: 'No', value: false }
        ],
        getValue: (preferences) => preferences.syncFilterStateToUrlOverride,
        setValue: (prev, value) => ({
            ...prev,
            syncFilterStateToUrlOverride: value
        })
    },
    {
        id: 'closeFilterPanelOnApply',
        kind: 'dropdown',
        label: 'Close filters after applying',
        options: [
            { label: 'No', value: false },
            { label: 'Yes', value: true }
        ],
        getValue: (preferences) => preferences.closeFilterPanelOnApply === true,
        setValue: (prev, value) => ({
            ...prev,
            closeFilterPanelOnApply: value === true
        })
    }
];
