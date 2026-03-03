/**
 * AICommandMenu Component Tests
 *
 * @agent @qa-automation-engineer
 * @phase 1B
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AICommandMenu, type AIMenuState, type QuotaInfo } from '../AICommandMenu';
import { ALL_AI_COMMANDS, CATEGORY_LABELS } from '../ai-commands';

// Mock @floating-ui/react to avoid positioning issues in tests
vi.mock('@floating-ui/react', () => ({
    useFloating: () => ({
        refs: {
            setFloating: vi.fn(),
            setReference: vi.fn(),
        },
        floatingStyles: { position: 'absolute' as const, top: 0, left: 0 },
    }),
    offset: () => ({}),
    flip: () => ({}),
    shift: () => ({}),
    autoUpdate: vi.fn(),
}));

// Mock CSS import
vi.mock('../styles.css', () => ({}));

const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onCommandSelect: vi.fn(),
    onRetry: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
    state: 'idle' as AIMenuState,
    hasSelection: true,
};

describe('AICommandMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Visibility', () => {
        it('renders nothing when isOpen is false', () => {
            const { container } = render(
                <AICommandMenu {...defaultProps} isOpen={false} />,
            );
            expect(container.firstChild).toBeNull();
        });

        it('renders the menu when isOpen is true', () => {
            render(<AICommandMenu {...defaultProps} />);
            expect(screen.getByRole('dialog')).toBeDefined();
        });
    });

    describe('Idle State', () => {
        it('renders search input', () => {
            render(<AICommandMenu {...defaultProps} />);
            expect(screen.getByPlaceholderText('Search commands...')).toBeDefined();
        });

        it('renders all category labels', () => {
            render(<AICommandMenu {...defaultProps} />);
            Object.values(CATEGORY_LABELS).forEach((label) => {
                expect(screen.getByText(label)).toBeDefined();
            });
        });

        it('renders all command titles', () => {
            render(<AICommandMenu {...defaultProps} />);
            ALL_AI_COMMANDS.forEach((cmd) => {
                expect(screen.getByText(cmd.title)).toBeDefined();
            });
        });

        it('filters commands on search input', () => {
            render(<AICommandMenu {...defaultProps} />);
            const search = screen.getByPlaceholderText('Search commands...');
            fireEvent.change(search, { target: { value: 'seo' } });

            expect(screen.getByText('SEO Optimize')).toBeDefined();
            expect(screen.getByText('Write Meta Description')).toBeDefined();
            // Commands from other categories should be hidden
            expect(screen.queryByText('Make Shorter')).toBeNull();
        });

        it('shows empty state for no-match searches', () => {
            render(<AICommandMenu {...defaultProps} />);
            const search = screen.getByPlaceholderText('Search commands...');
            fireEvent.change(search, { target: { value: 'zzzznonexistent' } });

            expect(screen.getByText(/No commands match/)).toBeDefined();
        });

        it('disables selection-only commands when no selection', () => {
            render(<AICommandMenu {...defaultProps} hasSelection={false} />);
            const simplifyBtn = screen.getByText('Simplify').closest('button');
            expect(simplifyBtn?.disabled).toBe(true);
        });

        it('enables selection commands when selection exists', () => {
            render(<AICommandMenu {...defaultProps} hasSelection={true} />);
            const simplifyBtn = screen.getByText('Simplify').closest('button');
            expect(simplifyBtn?.disabled).toBe(false);
        });

        it('calls onCommandSelect when a command is clicked', () => {
            const onCommandSelect = vi.fn();
            render(
                <AICommandMenu {...defaultProps} onCommandSelect={onCommandSelect} />,
            );
            fireEvent.click(screen.getByText('SEO Optimize'));
            expect(onCommandSelect).toHaveBeenCalledTimes(1);
            expect(onCommandSelect.mock.calls[0][0].key).toBe('seo_optimize');
        });
    });

    describe('Free-text Prompt', () => {
        it('renders textarea', () => {
            render(<AICommandMenu {...defaultProps} />);
            expect(
                screen.getByPlaceholderText(/type a custom instruction/),
            ).toBeDefined();
        });

        it('enforces 500 character limit', () => {
            render(<AICommandMenu {...defaultProps} />);
            const textarea = screen.getByPlaceholderText(
                /type a custom instruction/,
            ) as HTMLTextAreaElement;
            const longText = 'a'.repeat(600);
            fireEvent.change(textarea, { target: { value: longText } });
            expect(textarea.value.length).toBeLessThanOrEqual(500);
        });

        it('shows character counter', () => {
            render(<AICommandMenu {...defaultProps} />);
            expect(screen.getByText('0/500')).toBeDefined();
        });

        it('submits prompt on Enter', () => {
            const onCommandSelect = vi.fn();
            render(
                <AICommandMenu {...defaultProps} onCommandSelect={onCommandSelect} />,
            );
            const textarea = screen.getByPlaceholderText(/type a custom instruction/);
            fireEvent.change(textarea, { target: { value: 'Make this funnier' } });
            fireEvent.keyDown(textarea, { key: 'Enter' });
            expect(onCommandSelect).toHaveBeenCalledTimes(1);
            expect(onCommandSelect.mock.calls[0][1]).toBe('Make this funnier');
        });

        it('does not submit empty prompt', () => {
            const onCommandSelect = vi.fn();
            render(
                <AICommandMenu {...defaultProps} onCommandSelect={onCommandSelect} />,
            );
            const submitBtn = screen.getByLabelText('Submit prompt');
            expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
        });
    });

    describe('Loading State', () => {
        it('shows spinner and Generating text', () => {
            render(<AICommandMenu {...defaultProps} state="loading" />);
            expect(screen.getByText('Generating...')).toBeDefined();
        });

        it('hides command list during loading', () => {
            render(<AICommandMenu {...defaultProps} state="loading" />);
            expect(screen.queryByPlaceholderText('Search commands...')).toBeNull();
        });

        it('shows stream preview when available', () => {
            render(
                <AICommandMenu
                    {...defaultProps}
                    state="loading"
                    streamPreview="Here is the AI generated text so far..."
                />,
            );
            expect(
                screen.getByText(/Here is the AI generated text/),
            ).toBeDefined();
        });

        it('hides close button during loading (stays open)', () => {
            render(<AICommandMenu {...defaultProps} state="loading" />);
            expect(screen.queryByLabelText('Close')).toBeNull();
        });
    });

    describe('Error State', () => {
        it('shows error message', () => {
            render(
                <AICommandMenu
                    {...defaultProps}
                    state="error"
                    errorMessage="Network timeout"
                />,
            );
            expect(screen.getByText('Network timeout')).toBeDefined();
        });

        it('shows fallback error message', () => {
            render(<AICommandMenu {...defaultProps} state="error" />);
            expect(screen.getByText('Something went wrong')).toBeDefined();
        });

        it('shows retry button', () => {
            render(<AICommandMenu {...defaultProps} state="error" />);
            expect(screen.getByText('Retry')).toBeDefined();
        });

        it('calls onRetry when retry clicked', () => {
            const onRetry = vi.fn();
            render(
                <AICommandMenu {...defaultProps} state="error" onRetry={onRetry} />,
            );
            fireEvent.click(screen.getByText('Retry'));
            expect(onRetry).toHaveBeenCalledTimes(1);
        });

        it('shows dismiss button', () => {
            render(<AICommandMenu {...defaultProps} state="error" />);
            expect(screen.getByText('Dismiss')).toBeDefined();
        });

        it('calls onClose when dismiss clicked', () => {
            const onClose = vi.fn();
            render(
                <AICommandMenu {...defaultProps} state="error" onClose={onClose} />,
            );
            fireEvent.click(screen.getByText('Dismiss'));
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('Quota Footer', () => {
        const quota: QuotaInfo = {
            daily_requests: 7,
            daily_limit: 25,
            monthly_tokens: 45000,
            monthly_token_limit: 100000,
        };

        it('renders quota when provided', () => {
            render(<AICommandMenu {...defaultProps} quota={quota} />);
            expect(screen.getByText(/18\/25 today/)).toBeDefined();
            expect(screen.getByText(/45K \/ 100K/)).toBeDefined();
        });

        it('shows exhausted warning when credits are 0', () => {
            const exhausted: QuotaInfo = {
                ...quota,
                daily_requests: 25,
            };
            render(<AICommandMenu {...defaultProps} quota={exhausted} />);
            expect(screen.getByText(/exhausted/)).toBeDefined();
        });

        it('does not render quota footer when null', () => {
            render(<AICommandMenu {...defaultProps} quota={null} />);
            expect(screen.queryByText(/Credits:/)).toBeNull();
        });
    });

    describe('Keyboard interactions', () => {
        it('calls onClose on Escape when idle', () => {
            const onClose = vi.fn();
            render(<AICommandMenu {...defaultProps} onClose={onClose} />);
            fireEvent.keyDown(document, { key: 'Escape' });
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('closes on Escape when loading (allows user to dismiss)', () => {
            const onClose = vi.fn();
            render(
                <AICommandMenu {...defaultProps} state="loading" onClose={onClose} />,
            );
            fireEvent.keyDown(document, { key: 'Escape' });
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });
});
