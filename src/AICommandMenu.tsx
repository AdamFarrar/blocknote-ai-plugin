/**
 * AI Command Menu
 *
 * Floating panel that displays categorized AI commands, a free-text prompt,
 * streaming progress, accept/reject flow, and quota information.
 *
 * @agent @frontend-specialist
 * @phase 1B — UX Audit Fixes
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    Sparkles, Loader2, AlertCircle, X, Send, RotateCcw,
    Check, XCircle, StopCircle, Info,
} from 'lucide-react';
import {
    customPromptCommand,
    CATEGORY_ORDER,
    CATEGORY_LABELS,
    filterCommands,
    type AICommand,
    type AICommandCategory,
} from './ai-commands';
import './styles.css';

// ── Types ────────────────────────────────────────────────────────────────────

export type AIMenuState = 'idle' | 'loading' | 'complete' | 'error';

export interface QuotaInfo {
    daily_requests: number;
    daily_limit: number;
    monthly_tokens: number;
    monthly_token_limit: number;
}

export interface AICommandMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onCommandSelect: (command: AICommand, customPrompt?: string) => void;
    onRetry: () => void;
    /** Called when user accepts the AI result */
    onAccept: () => void;
    /** Called when user rejects — should undo the applied blocks */
    onReject: () => void;
    state: AIMenuState;
    streamPreview?: string;
    errorMessage?: string;
    quota?: QuotaInfo | null;
    hasSelection?: boolean;
    /** Stable coordinates (viewport px) captured at open-time from the trigger button */
    anchorPosition?: { x: number; y: number } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAX_PROMPT_LENGTH = 500;

/** Strip HTML tags from text for clean preview display */
function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Count words in text */
function wordCount(text: string): number {
    const stripped = stripHtml(text);
    if (!stripped) return 0;
    return stripped.split(/\s+/).filter(Boolean).length;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AICommandMenu({
    isOpen,
    onClose,
    onCommandSelect,
    onRetry,
    onAccept,
    onReject,
    state,
    streamPreview,
    errorMessage,
    quota,
    hasSelection,
    anchorPosition,
}: AICommandMenuProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [customPrompt, setCustomPrompt] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const searchRef = useRef<HTMLInputElement>(null);
    const commandListRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Compute fixed position synchronously — no async Floating UI cycle, zero flicker.
    // Always place below the anchor, clamp to viewport edges.
    const menuStyle = useMemo<React.CSSProperties>(() => {
        if (!anchorPosition) return { position: 'fixed', top: 100, left: 100 };
        const MENU_W = 340;
        const PAD = 16;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

        // Place below the anchor with 8px gap
        let top = anchorPosition.y + 8;
        let left = anchorPosition.x;

        // Clamp so the menu stays within viewport bounds
        // Use a generous estimate — actual height varies by state
        if (top + PAD > vh) top = vh - PAD;
        if (left + MENU_W + PAD > vw) left = vw - MENU_W - PAD;
        if (left < PAD) left = PAD;
        if (top < PAD) top = PAD;

        return { position: 'fixed', top, left };
    }, [anchorPosition]);

    // Click-outside dismiss (only in idle state)
    useEffect(() => {
        if (!isOpen || state !== 'idle') return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen, state, onClose]);

    // Focus search on open
    useEffect(() => {
        if (isOpen && state === 'idle') {
            setTimeout(() => searchRef.current?.focus(), 50);
        }
    }, [isOpen, state]);

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
            setCustomPrompt('');
            setActiveIndex(-1);
        }
    }, [isOpen]);

    // Close on Escape — always allowed (cancel during loading, reject during complete, dismiss during error)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === 'Escape') {
                if (state === 'loading') {
                    onClose();
                } else if (state === 'complete') {
                    onReject();
                } else if (state === 'error') {
                    onClose();
                } else if (state === 'idle') {
                    onClose();
                }
            }

            // Keyboard shortcuts in complete state
            if (state === 'complete') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    onAccept();
                } else if (e.key === 'Backspace' || e.key === 'Delete') {
                    e.preventDefault();
                    onReject();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, state, onClose, onReject, onAccept]);

    const handleSubmitPrompt = useCallback(() => {
        if (!customPrompt.trim()) return;
        onCommandSelect(customPromptCommand, customPrompt.trim());
    }, [customPrompt, onCommandSelect]);

    const filteredCommands = useMemo(() => filterCommands(searchQuery), [searchQuery]);

    // Group filtered commands by category
    const groupedCommands: [AICommandCategory, AICommand[]][] = useMemo(() =>
        CATEGORY_ORDER
            .map(cat => [cat, filteredCommands.filter(cmd => cmd.category === cat)] as [AICommandCategory, AICommand[]])
            .filter(([, cmds]) => cmds.length > 0),
        [filteredCommands]
    );

    // Flat list for keyboard navigation (#5)
    const flatCommands = useMemo(() =>
        groupedCommands.flatMap(([, cmds]) => cmds),
        [groupedCommands]
    );

    // Keyboard navigation (#5)
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (state !== 'idle') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => {
                const next = prev + 1;
                return next >= flatCommands.length ? 0 : next;
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => {
                const next = prev - 1;
                return next < 0 ? flatCommands.length - 1 : next;
            });
        } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < flatCommands.length) {
            e.preventDefault();
            const cmd = flatCommands[activeIndex];
            if (!(cmd.scope === 'selection' && !hasSelection)) {
                onCommandSelect(cmd);
            }
        }
    }, [state, flatCommands, activeIndex, hasSelection, onCommandSelect]);

    // Scroll active item into view
    useEffect(() => {
        if (activeIndex >= 0 && commandListRef.current) {
            const buttons = commandListRef.current.querySelectorAll<HTMLButtonElement>('[data-cmd-index]');
            buttons[activeIndex]?.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex]);

    // Reset active index when search changes
    useEffect(() => { setActiveIndex(-1); }, [searchQuery]);

    const dailyRemaining = quota
        ? quota.daily_limit - quota.daily_requests
        : null;

    const previewWordCount = useMemo(
        () => streamPreview ? wordCount(streamPreview) : 0,
        [streamPreview]
    );

    const cleanPreview = useMemo(
        () => streamPreview ? stripHtml(streamPreview).slice(0, 400) : '',
        [streamPreview]
    );

    if (!isOpen) return null;

    // Track command index across groups for keyboard nav
    let cmdFlatIdx = 0;

    return (
        <div
            ref={menuRef}
            style={menuStyle}
            className="ai-menu"
            role="dialog"
            aria-label="AI Assistant"
            onKeyDown={handleKeyDown}
        >
            {/* Header */}
            <div className="ai-menu__header">
                <div className="ai-menu__header-left">
                    <Sparkles size={16} className="ai-menu__header-icon" />
                    <span className="ai-menu__header-title">AI Assistant</span>
                </div>
                {/* Always show close/cancel button (#3) */}
                <button
                    onClick={() => {
                        if (state === 'complete') {
                            onReject();
                        } else {
                            onClose();
                        }
                    }}
                    className="ai-menu__close"
                    aria-label={state === 'loading' ? 'Cancel generation' : 'Close'}
                    title={state === 'loading' ? 'Cancel generation' : 'Close'}
                >
                    <X size={14} />
                </button>
            </div>

            {/* ── Idle State ── */}
            {state === 'idle' && (
                <>
                    {/* Selection hint (#6) */}
                    {!hasSelection && (
                        <div className="ai-menu__hint">
                            <Info size={12} />
                            <span>Select text to unlock editing commands</span>
                        </div>
                    )}

                    {/* Search */}
                    <div className="ai-menu__search">
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Search commands..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="ai-menu__search-input"
                            role="combobox"
                            aria-expanded={filteredCommands.length > 0}
                            aria-activedescendant={
                                activeIndex >= 0 ? `ai-cmd-${flatCommands[activeIndex]?.key}` : undefined
                            }
                        />
                    </div>

                    {/* Command List */}
                    <div className="ai-menu__commands" ref={commandListRef} role="listbox">
                        {groupedCommands.map(([category, commands]) => (
                            <div key={category} className="ai-menu__group" role="group" aria-label={CATEGORY_LABELS[category]}>
                                <div className="ai-menu__group-label">
                                    {CATEGORY_LABELS[category]}
                                </div>
                                {commands.map((cmd) => {
                                    const idx = cmdFlatIdx++;
                                    const isDisabled = cmd.scope === 'selection' && !hasSelection;
                                    return (
                                        <button
                                            key={cmd.key}
                                            id={`ai-cmd-${cmd.key}`}
                                            className={`ai-menu__command ${idx === activeIndex ? 'ai-menu__command--active' : ''}`}
                                            onClick={() => onCommandSelect(cmd)}
                                            disabled={isDisabled}
                                            title={isDisabled ? 'Select text first' : cmd.title}
                                            role="option"
                                            aria-selected={idx === activeIndex}
                                            data-cmd-index={idx}
                                        >
                                            <cmd.icon size={14} className="ai-menu__command-icon" />
                                            <span className="ai-menu__command-title">{cmd.title}</span>
                                            {cmd.scope === 'selection' && (
                                                <span className={`ai-menu__command-badge ${isDisabled ? 'ai-menu__command-badge--disabled' : ''}`}>
                                                    selection
                                                </span>
                                            )}
                                            {cmd.scope === 'document' && (
                                                <span className="ai-menu__command-badge ai-menu__command-badge--doc">doc</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}

                        {filteredCommands.length === 0 && (
                            <div className="ai-menu__empty">
                                No commands match "{searchQuery}"
                            </div>
                        )}
                    </div>

                    {/* Free-text Prompt */}
                    <div className="ai-menu__prompt">
                        <div className="ai-menu__prompt-wrapper">
                            <textarea
                                placeholder={
                                    hasSelection
                                        ? 'Or type a custom instruction for the selected text...'
                                        : 'Or type a custom instruction for the full document...'
                                }
                                value={customPrompt}
                                onChange={(e) =>
                                    setCustomPrompt(e.target.value.slice(0, MAX_PROMPT_LENGTH))
                                }
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmitPrompt();
                                    }
                                }}
                                rows={2}
                                className="ai-menu__prompt-input"
                            />
                            <div className="ai-menu__prompt-footer">
                                <span className={`ai-menu__prompt-counter ${customPrompt.length > 450 ? 'ai-menu__prompt-counter--warn' : ''
                                    }`}>
                                    {customPrompt.length}/{MAX_PROMPT_LENGTH}
                                </span>
                                <button
                                    onClick={handleSubmitPrompt}
                                    disabled={!customPrompt.trim()}
                                    className="ai-menu__prompt-submit"
                                    aria-label="Submit prompt"
                                >
                                    <Send size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ── Loading State (#1 HTML strip, #3 cancel, #8 word count) ── */}
            {state === 'loading' && (
                <div className="ai-menu__loading">
                    <div className="ai-menu__loading-header">
                        <Loader2 size={16} className="ai-menu__spinner" />
                        <span>Generating...</span>
                        {previewWordCount > 0 && (
                            <span className="ai-menu__word-count">
                                ~{previewWordCount} words
                            </span>
                        )}
                    </div>
                    {cleanPreview && (
                        <div className="ai-menu__preview">
                            <div className="ai-menu__preview-text">
                                {cleanPreview}
                                {(streamPreview?.length ?? 0) > 400 && '...'}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={onClose}
                        className="ai-menu__cancel-btn"
                    >
                        <StopCircle size={14} />
                        Stop generating
                    </button>
                </div>
            )}

            {/* ── Complete State — Accept/Reject (#2) ── */}
            {state === 'complete' && (
                <div className="ai-menu__complete">
                    <div className="ai-menu__complete-header">
                        <Check size={16} className="ai-menu__complete-icon" />
                        <span>Generation complete</span>
                        <span className="ai-menu__word-count">
                            ~{previewWordCount} words
                        </span>
                    </div>
                    {cleanPreview && (
                        <div className="ai-menu__preview">
                            <div className="ai-menu__preview-text">
                                {cleanPreview.slice(0, 200)}
                                {cleanPreview.length > 200 && '...'}
                            </div>
                        </div>
                    )}
                    <div className="ai-menu__complete-actions">
                        <button onClick={onAccept} className="ai-menu__accept-btn">
                            <Check size={14} />
                            Accept
                            <kbd className="ai-menu__kbd">↵</kbd>
                        </button>
                        <button onClick={onReject} className="ai-menu__reject-btn">
                            <XCircle size={14} />
                            Reject
                        </button>
                        <button onClick={onRetry} className="ai-menu__retry-btn">
                            <RotateCcw size={14} />
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* ── Error State ── */}
            {state === 'error' && (
                <div className="ai-menu__error">
                    <div className="ai-menu__error-content">
                        <AlertCircle size={16} className="ai-menu__error-icon" />
                        <span className="ai-menu__error-message">
                            {errorMessage || 'Something went wrong'}
                        </span>
                    </div>
                    <div className="ai-menu__error-actions">
                        <button onClick={onRetry} className="ai-menu__retry">
                            <RotateCcw size={14} />
                            Retry
                        </button>
                        <button onClick={onClose} className="ai-menu__dismiss">
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* ── Quota Footer (#11 — only render if data present) ── */}
            {quota && dailyRemaining !== null && (
                <div className="ai-menu__quota">
                    <span>
                        Credits: {dailyRemaining}/{quota.daily_limit} today
                        {dailyRemaining <= 0 && (
                            <span className="ai-menu__quota-warn"> (exhausted)</span>
                        )}
                    </span>
                    <span>
                        Tokens: {(quota.monthly_tokens / 1000).toFixed(0)}K / {(quota.monthly_token_limit / 1000).toFixed(0)}K
                    </span>
                </div>
            )}
        </div>
    );
}
