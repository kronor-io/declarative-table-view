import { Button } from 'primereact/button';
import type { ActionDefinition } from '../framework/actions';

export interface ActionButtonsProps {
    actions: ActionDefinition[];
    /** Whether the action with this id is running: its button shows it, and cannot be clicked. */
    isRunning: (id: string) => boolean;
    onClick: (id: string) => void;
}

export function ActionButtons({ actions, isRunning, onClick }: ActionButtonsProps) {
    return (
        <>
            {actions.map((action, idx) => {
                const running = isRunning(action.id);
                return (
                    <Button
                        key={action.id}
                        type="button"
                        icon={action.icon}
                        loading={running}
                        badge={action.badge}
                        badgeClassName={action.badgeClassName}
                        severity={action.severity}
                        className={action.className}
                        style={action.style}
                        outlined={action.outlined !== false}
                        size={action.size === 'normal' ? undefined : 'small'}
                        disabled={action.disabled || running}
                        label={running ? `${action.label}...` : action.label}
                        onClick={() => onClick(action.id)}
                        data-testid={`dtv-action-${idx}`}
                    />
                );
            })}
        </>
    );
}

export default ActionButtons;
