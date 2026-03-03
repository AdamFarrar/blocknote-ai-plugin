/**
 * Custom AI Toolbar Button
 *
 * Replaces xl-ai's AIToolbarButton. Uses BlockNote's component context
 * for consistent Mantine styling.
 *
 * @agent @frontend-specialist
 * @phase 1B
 */

import { useComponentsContext } from '@blocknote/react';
import { Sparkles } from 'lucide-react';

interface AIToolbarButtonProps {
    onClick: (e: React.MouseEvent) => void;
    isActive?: boolean;
}

export function AIToolbarButton({ onClick, isActive }: AIToolbarButtonProps) {
    const Components = useComponentsContext();

    if (!Components) return null;

    return (
        <Components.FormattingToolbar.Button
            mainTooltip="AI Assistant"
            onClick={onClick}
            isSelected={isActive}
        >
            <Sparkles
                size={16}
                className={isActive ? 'ai-toolbar-icon--active' : 'ai-toolbar-icon'}
            />
        </Components.FormattingToolbar.Button>
    );
}
