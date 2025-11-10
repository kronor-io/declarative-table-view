import * as React from 'react';
import { Button } from 'primereact/button';
import { ActionDefinition, ActionAPI } from '../framework/actions';
import { generateGraphQLQueryAST, renderGraphQLQuery } from '../framework/graphql';
import { buildGraphQLQueryVariables } from '../framework/data';
import { View } from '../framework/view';
import { FilterState } from '../framework/state';

export interface ActionButtonsProps {
    actions: ActionDefinition[];
    selectedView: View;
    filterState: FilterState;
    setFilterState: (next: FilterState) => void;
    refetch: () => void;
    showToast: (opts: { severity: 'info' | 'success' | 'warn' | 'error'; summary: string; detail?: string; life?: number }) => void;
}

export function ActionButtons({ actions, selectedView, filterState, setFilterState, refetch, showToast }: ActionButtonsProps) {
    const [running, setRunning] = React.useState<Set<number>>(() => new Set());
    return (
        <>
            {actions.map((action, idx) => {
                const isRunning = running.has(idx);
                const handleClick = async () => {
                    if (isRunning) return;
                    setRunning(prev => new Set(prev).add(idx));
                    const api: ActionAPI = {
                        view: selectedView,
                        filterState,
                        setFilterState,
                        refetch,
                        showToast,
                        generateGraphQLQueryAST,
                        renderGraphQLQuery,
                        buildGraphQLQueryVariables
                    };
                    try {
                        await action.onClick(api);
                    } catch (e) {
                        console.error('Action handler error', e);
                        showToast({ severity: 'error', summary: 'Action Failed', detail: action.label, life: 3000 });
                    } finally {
                        setRunning(prev => {
                            const next = new Set(prev);
                            next.delete(idx);
                            return next;
                        });
                    }
                };
                return (
                    <Button
                        key={`custom-action-${idx}`}
                        type="button"
                        icon={action.icon}
                        outlined={action.outlined !== false}
                        size={action.size === 'normal' ? undefined : 'small'}
                        disabled={action.disabled || isRunning}
                        label={isRunning ? `${action.label}...` : action.label}
                        onClick={handleClick}
                        data-testid={`dtv-action-${idx}`}
                    />
                );
            })}
        </>
    );
}

export default ActionButtons;
