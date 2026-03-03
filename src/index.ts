/**
 * blocknote-ai-plugin
 *
 * AI-powered editing commands for BlockNote editors.
 * Streaming, proxy-ready, zero xl-ai dependencies.
 */

// ── Core ─────────────────────────────────────────────────────────────────────
export {
    invokeAI,
    createProxyFetch,
    buildPrompt,
    parseAIResponse,
    applyAIBlocks,
    blocksToPlainText,
} from './ai-plugin';

export type { AIPluginConfig, AIInvokeOptions } from './ai-plugin';

// ── Commands ─────────────────────────────────────────────────────────────────
export {
    ALL_AI_COMMANDS,
    CATEGORY_ORDER,
    CATEGORY_LABELS,
    getCommandsByCategory,
    getCommandByKey,
    filterCommands,
    customPromptCommand,
} from './ai-commands';

export type {
    AICommand,
    AICommandCategory,
    AICommandScope,
    BlockOperationHints,
} from './ai-commands';

// ── Components ───────────────────────────────────────────────────────────────
export { AICommandMenu } from './AICommandMenu';
export type { AICommandMenuProps, AIMenuState, QuotaInfo } from './AICommandMenu';

export { AIToolbarButton } from './AIToolbarButton';
