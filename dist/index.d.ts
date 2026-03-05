import { BlockNoteEditor, PartialBlock, Block } from '@blocknote/core';
import { LucideIcon } from 'lucide-react';
import * as react_jsx_runtime from 'react/jsx-runtime';

/**
 * AI Command Registry
 *
 * All AI commands for the article editor, organized by category.
 * Zero @blocknote/xl-ai imports — clean-room implementation.
 *
 * @agent @ai-systems-engineer
 * @phase 1A
 */

type AICommandCategory = 'content' | 'editing' | 'seo' | 'language';
type AICommandScope = 'selection' | 'document' | 'both';
/**
 * Block operation hints — tells the AI pipeline what operations to perform
 * on the editor after receiving the response.
 *
 * Replaces xl-ai's `streamToolsProvider({ defaultStreamTools: { add, delete, update } })`.
 */
interface BlockOperationHints {
    /** Whether the AI output should be inserted as new blocks */
    add: boolean;
    /** Whether existing selected blocks can be removed */
    delete: boolean;
    /** Whether existing blocks should be updated in-place */
    update: boolean;
}
interface AICommand {
    /** Unique key — must be unique across all commands */
    key: string;
    /** Display title in the command menu */
    title: string;
    /** Category for grouping in the menu */
    category: AICommandCategory;
    /** Lucide icon component */
    icon: LucideIcon;
    /** Alternative names for filtering/search */
    aliases: string[];
    /** Whether the command operates on selection, full document, or both */
    scope: AICommandScope;
    /** System prompt sent to OpenAI */
    systemPrompt: string;
    /** Builds the user prompt from selected text and/or full document content */
    userPromptTemplate: (selectedText: string, fullDoc?: string) => string;
    /** Block operation hints for the editor pipeline */
    blockOps: BlockOperationHints;
}
declare const CATEGORY_ORDER: AICommandCategory[];
declare const CATEGORY_LABELS: Record<AICommandCategory, string>;
declare const customPromptCommand: AICommand;
/** All built-in AI commands, in display order */
declare const ALL_AI_COMMANDS: AICommand[];

/**
 * Get commands grouped by category, in display order.
 * Returns an array of [category, commands[]] tuples.
 */
declare function getCommandsByCategory(): [AICommandCategory, AICommand[]][];
/**
 * Find a command by key. Returns undefined if not found.
 */
declare function getCommandByKey(key: string): AICommand | undefined;
/**
 * Filter commands that match a search query (by title or aliases).
 */
declare function filterCommands(query: string): AICommand[];

/**
 * AI Plugin Core
 *
 * Replaces @blocknote/xl-ai's AIExtension, ClientSideTransport, and fetchViaProxy.
 * Uses only public BlockNote APIs + MIT-licensed @ai-sdk packages.
 *
 * @agent @ai-systems-engineer
 * @phase 1A
 */

interface AIInvokeOptions {
    /** The command to execute */
    command: AICommand;
    /** Custom user prompt (for free-text input). If provided, overrides the command's template. */
    customPrompt?: string;
    /** Callback fired with accumulated text chunks during streaming */
    onStream?: (partialText: string) => void;
    /** Callback fired when the operation completes */
    onComplete?: () => void;
    /** Callback fired on error */
    onError?: (error: Error) => void;
    /** Callback fired immediately with the abort function, BEFORE streaming begins.
     *  Use this to enable mid-stream cancellation (e.g. a Close button). */
    onAbortReady?: (abort: () => void) => void;
}
interface AIPluginConfig {
    /** The authenticated fetch function for the proxy */
    authedFetch: typeof fetch;
    /** The proxy base URL */
    proxyBaseUrl: string;
    /** The OpenAI model identifier */
    model?: string;
}
/**
 * Creates a fetch function that routes all requests through the
 * Supabase Edge Function proxy. Replaces xl-ai's `fetchViaProxy`.
 *
 * The proxy rewrites the URL so that the original OpenAI URL is passed
 * as a query parameter, and the actual request goes to our proxy.
 */
declare function createProxyFetch(proxyBaseUrl: string, authedFetch: typeof fetch): typeof fetch;
/**
 * Extracts plain text from an array of BlockNote blocks.
 * Used to build AI prompts from editor content.
 */
declare function blocksToPlainText(blocks: Block[]): string;
/**
 * Builds the OpenAI messages array from a command + editor context.
 */
declare function buildPrompt(command: AICommand, selectedBlocks: Block[], allBlocks: Block[], customPrompt?: string): {
    role: 'system' | 'user';
    content: string;
}[];
/**
 * Parses an AI response (HTML or markdown) into BlockNote blocks.
 *
 * Tries HTML first (since our prompts ask for HTML-formatted output),
 * falls back to markdown parsing if HTML parsing returns empty.
 */
declare function parseAIResponse(editor: BlockNoteEditor, responseText: string): Promise<PartialBlock[]>;
/**
 * Applies AI-generated blocks to the editor, wrapped in a transaction
 * so the entire operation can be undone with a single Cmd+Z.
 *
 * Operation behavior is determined by `BlockOperationHints`:
 * - `update: true` → replace selected blocks with AI output (even if output is longer)
 * - `add: true, update: false` → insert AI output after the last selected block
 * - `add: true, update: true` → same as update (replaceBlocks handles inserting longer content)
 */
declare function applyAIBlocks(editor: BlockNoteEditor, newBlocks: PartialBlock[], selectedBlockIds: string[], hints: BlockOperationHints): void;
/**
 * Invokes an AI command on the editor.
 *
 * This is the main entry point — replaces `AIExtension.invokeAI()`.
 * Uses Vercel AI SDK's `streamText()` for streaming, applies results
 * via `editor.transact()` for single-undo behavior.
 *
 * Returns an abort function to cancel the streaming request.
 */
declare function invokeAI(editor: BlockNoteEditor, config: AIPluginConfig, options: AIInvokeOptions): Promise<() => void>;

type AIMenuState = 'idle' | 'loading' | 'complete' | 'error';
interface QuotaInfo {
    daily_requests: number;
    daily_limit: number;
    monthly_tokens: number;
    monthly_token_limit: number;
}
interface AICommandMenuProps {
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
    anchorPosition?: {
        x: number;
        y: number;
    } | null;
}
declare function AICommandMenu({ isOpen, onClose, onCommandSelect, onRetry, onAccept, onReject, state, streamPreview, errorMessage, quota, hasSelection, anchorPosition, }: AICommandMenuProps): react_jsx_runtime.JSX.Element | null;

/**
 * Custom AI Toolbar Button
 *
 * Replaces xl-ai's AIToolbarButton. Uses BlockNote's component context
 * for consistent Mantine styling.
 *
 * @agent @frontend-specialist
 * @phase 1B
 */
interface AIToolbarButtonProps {
    onClick: (e: React.MouseEvent) => void;
    isActive?: boolean;
}
declare function AIToolbarButton({ onClick, isActive }: AIToolbarButtonProps): react_jsx_runtime.JSX.Element | null;

export { type AICommand, type AICommandCategory, AICommandMenu, type AICommandMenuProps, type AICommandScope, type AIInvokeOptions, type AIMenuState, type AIPluginConfig, AIToolbarButton, ALL_AI_COMMANDS, type BlockOperationHints, CATEGORY_LABELS, CATEGORY_ORDER, type QuotaInfo, applyAIBlocks, blocksToPlainText, buildPrompt, createProxyFetch, customPromptCommand, filterCommands, getCommandByKey, getCommandsByCategory, invokeAI, parseAIResponse };
