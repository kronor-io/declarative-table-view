import { Dropdown } from 'primereact/dropdown';

import type { UserPreferences } from '../framework/user-data';

import { PREFERENCE_DEFINITIONS } from './userPreferences';

interface UserPreferencesPanelProps {
    visible: boolean;
    preferences: UserPreferences;
    onChangePreferences: (update: (prev: UserPreferences) => UserPreferences) => Promise<UserPreferences>;
}

export default function UserPreferencesPanel({ visible, preferences, onChangePreferences }: UserPreferencesPanelProps) {
    if (!visible) return null;

    return (
        <div className="tw:mb-4">
            <div className="tw:mb-3">
                <h3 className="tw:text-lg tw:font-medium tw:text-gray-900">Preferences</h3>
            </div>

            <div className="tw:flex tw:flex-col tw:gap-3 tw:w-1/3">
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
        </div>
    );
}
