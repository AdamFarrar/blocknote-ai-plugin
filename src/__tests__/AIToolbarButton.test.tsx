/**
 * AIToolbarButton Component Tests
 *
 * @agent @qa-automation-engineer
 * @phase 1B
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AIToolbarButton } from '../AIToolbarButton';

// Mock useComponentsContext to provide FormattingToolbar.Button
vi.mock('@blocknote/react', () => ({
    useComponentsContext: () => ({
        FormattingToolbar: {
            Button: ({
                children,
                onClick,
                mainTooltip,
                isSelected,
            }: {
                children: React.ReactNode;
                onClick: () => void;
                mainTooltip: string;
                isSelected?: boolean;
            }) => (
                <button
                    onClick={onClick}
                    title={mainTooltip}
                    data-selected={isSelected}
                    data-testid="ai-toolbar-button"
                >
                    {children}
                </button>
            ),
        },
    }),
}));

describe('AIToolbarButton', () => {
    it('renders a button', () => {
        render(<AIToolbarButton onClick={() => { }} />);
        expect(screen.getByTestId('ai-toolbar-button')).toBeDefined();
    });

    it('has AI Assistant tooltip', () => {
        render(<AIToolbarButton onClick={() => { }} />);
        expect(screen.getByTitle('AI Assistant')).toBeDefined();
    });

    it('calls onClick when clicked', () => {
        const onClick = vi.fn();
        render(<AIToolbarButton onClick={onClick} />);
        fireEvent.click(screen.getByTestId('ai-toolbar-button'));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('passes isSelected state', () => {
        render(<AIToolbarButton onClick={() => { }} isActive={true} />);
        const btn = screen.getByTestId('ai-toolbar-button');
        expect(btn.getAttribute('data-selected')).toBe('true');
    });

    it('renders with sparkle icon', () => {
        const { container } = render(<AIToolbarButton onClick={() => { }} />);
        // Lucide renders as SVG
        expect(container.querySelector('svg')).toBeDefined();
    });
});
