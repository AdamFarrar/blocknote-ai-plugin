/**
 * AI Command Registry
 *
 * All AI commands for the article editor, organized by category.
 * Zero @blocknote/xl-ai imports — clean-room implementation.
 *
 * @agent @ai-systems-engineer
 * @phase 1A
 */

import {
    Sparkles, FileText, Expand, Minimize2, Megaphone,
    Wand2, Type, Languages, ArrowDownToLine, ArrowUpToLine,
    CheckCheck, PenLine, MessageSquare, ListCollapse, Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export type AICommandCategory = 'content' | 'editing' | 'seo' | 'language';

export type AICommandScope = 'selection' | 'document' | 'both';

/**
 * Block operation hints — tells the AI pipeline what operations to perform
 * on the editor after receiving the response.
 *
 * Replaces xl-ai's `streamToolsProvider({ defaultStreamTools: { add, delete, update } })`.
 */
export interface BlockOperationHints {
    /** Whether the AI output should be inserted as new blocks */
    add: boolean;
    /** Whether existing selected blocks can be removed */
    delete: boolean;
    /** Whether existing blocks should be updated in-place */
    update: boolean;
}

export interface AICommand {
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

// ── Category Display Order ───────────────────────────────────────────────────

export const CATEGORY_ORDER: AICommandCategory[] = ['content', 'editing', 'seo', 'language'];

export const CATEGORY_LABELS: Record<AICommandCategory, string> = {
    content: 'Content',
    editing: 'Editing',
    seo: 'SEO',
    language: 'Language',
};

// ── Content Commands ─────────────────────────────────────────────────────────

const continueWriting: AICommand = {
    key: 'continue_writing',
    title: 'Continue Writing',
    category: 'content',
    icon: PenLine,
    aliases: ['continue', 'keep writing', 'more'],
    scope: 'both',
    systemPrompt:
        'You are a professional content writer. Continue writing from where the text left off, ' +
        'matching the existing tone, style, and formatting.',
    userPromptTemplate: (selected, fullDoc) =>
        selected
            ? `Continue writing from this text:\n\n${selected}`
            : `Continue writing this article:\n\n${fullDoc}`,
    blockOps: { add: true, delete: false, update: false },
};

const expandSection: AICommand = {
    key: 'expand_section',
    title: 'Expand Section',
    category: 'content',
    icon: Expand,
    aliases: ['expand', 'elaborate', 'more detail', 'longer'],
    scope: 'selection',
    systemPrompt:
        'You are a professional content writer specializing in real estate and lead generation.',
    userPromptTemplate: (selected) =>
        'Expand the selected section with more detail, concrete examples, and actionable insights. ' +
        'Keep the same tone and formatting style. ' +
        'Add approximately 2-3 additional paragraphs of relevant content.\n\n' +
        `Selected text:\n${selected}`,
    blockOps: { add: true, delete: false, update: true },
};

const summarize: AICommand = {
    key: 'summarize',
    title: 'Summarize',
    category: 'content',
    icon: ListCollapse,
    aliases: ['summarize', 'tldr', 'summary', 'brief'],
    scope: 'both',
    systemPrompt:
        'You are a concise writer. Summarize the given text into key points while preserving the most important information.',
    userPromptTemplate: (selected, fullDoc) =>
        selected
            ? `Summarize this text concisely:\n\n${selected}`
            : `Summarize this article into key points:\n\n${fullDoc}`,
    blockOps: { add: false, delete: false, update: true },
};

const simplifyText: AICommand = {
    key: 'simplify_text',
    title: 'Simplify',
    category: 'content',
    icon: Minimize2,
    aliases: ['simplify', 'simpler', 'plain language', 'easier'],
    scope: 'selection',
    systemPrompt:
        'You are a plain-language editor. Simplify text for a general audience.',
    userPromptTemplate: (selected) =>
        'Simplify the selected text for a general audience. ' +
        'Use shorter sentences, common words, and remove jargon. ' +
        'Keep the core meaning intact.\n\n' +
        `Selected text:\n${selected}`,
    blockOps: { add: false, delete: false, update: true },
};

const addCallToAction: AICommand = {
    key: 'add_cta',
    title: 'Add Call to Action',
    category: 'content',
    icon: Megaphone,
    aliases: ['cta', 'call to action', 'conversion'],
    scope: 'selection',
    systemPrompt:
        'You are a conversion copywriter for a real estate technology platform.',
    userPromptTemplate: (selected) =>
        'Add a compelling call-to-action at the end of the selected section. ' +
        'It should encourage the reader to take the next step — ' +
        "whether that's exploring lead packages, scheduling a consultation, or trying the platform. " +
        'Keep it natural and non-pushy. Use strong action verbs.\n\n' +
        `Selected text:\n${selected}`,
    blockOps: { add: true, delete: false, update: false },
};

// ── Editing Commands ─────────────────────────────────────────────────────────

const fixSpelling: AICommand = {
    key: 'fix_spelling',
    title: 'Fix Spelling & Grammar',
    category: 'editing',
    icon: CheckCheck,
    aliases: ['spelling', 'grammar', 'fix', 'proofread', 'typo'],
    scope: 'selection',
    systemPrompt:
        'You are a meticulous proofreader. Fix spelling and grammar errors without changing meaning or style.',
    userPromptTemplate: (selected) =>
        `Fix any spelling and grammar errors in this text. Do not change the meaning, tone, or structure:\n\n${selected}`,
    blockOps: { add: false, delete: false, update: true },
};

const improveWriting: AICommand = {
    key: 'improve_writing',
    title: 'Improve Writing',
    category: 'editing',
    icon: Wand2,
    aliases: ['improve', 'enhance', 'better', 'rewrite'],
    scope: 'selection',
    systemPrompt:
        'You are an expert editor. Improve the clarity, flow, and impact of the text while preserving the original message.',
    userPromptTemplate: (selected) =>
        `Improve the writing quality of this text. Enhance clarity, flow, and impact while keeping the original message:\n\n${selected}`,
    blockOps: { add: false, delete: false, update: true },
};

const makeShorter: AICommand = {
    key: 'make_shorter',
    title: 'Make Shorter',
    category: 'editing',
    icon: ArrowDownToLine,
    aliases: ['shorter', 'concise', 'trim', 'reduce'],
    scope: 'selection',
    systemPrompt:
        'You are a concise editor. Shorten text while preserving key information.',
    userPromptTemplate: (selected) =>
        `Make this text significantly shorter while keeping the key information and meaning:\n\n${selected}`,
    blockOps: { add: false, delete: false, update: true },
};

const makeLonger: AICommand = {
    key: 'make_longer',
    title: 'Make Longer',
    category: 'editing',
    icon: ArrowUpToLine,
    aliases: ['longer', 'extend', 'more words'],
    scope: 'selection',
    systemPrompt:
        'You are a content expander. Add detail, examples, and depth to the text.',
    userPromptTemplate: (selected) =>
        `Make this text longer by adding more detail, examples, and depth. Maintain the same style and tone:\n\n${selected}`,
    blockOps: { add: false, delete: false, update: true },
};

// ── SEO Commands ─────────────────────────────────────────────────────────────

const seoOptimize: AICommand = {
    key: 'seo_optimize',
    title: 'SEO Optimize',
    category: 'seo',
    icon: Search,
    aliases: ['seo', 'optimize', 'search engine'],
    scope: 'selection',
    systemPrompt:
        'You are an SEO specialist for real estate and lead generation content.',
    userPromptTemplate: (selected) =>
        'Optimize the selected text for search engine rankings. ' +
        'Naturally incorporate relevant keywords related to real estate investing, seller leads, and property acquisition. ' +
        'Keep the tone professional but approachable. Do not keyword-stuff.\n\n' +
        `Selected text:\n${selected}`,
    blockOps: { add: false, delete: false, update: true },
};

const writeMetaDescription: AICommand = {
    key: 'write_meta_description',
    title: 'Write Meta Description',
    category: 'seo',
    icon: FileText,
    aliases: ['meta', 'description', 'seo description', 'serp'],
    scope: 'document',
    systemPrompt:
        'You are an SEO copywriter. Write compelling meta descriptions for search results.',
    userPromptTemplate: (_selected, fullDoc) =>
        'Based on the full article content, write a compelling meta description for search results. ' +
        'It must be under 155 characters, include a clear value proposition, and encourage clicks. ' +
        'Write it as a single paragraph — do not include labels or quotes. ' +
        'Insert it as a new paragraph at the cursor position.\n\n' +
        `Article content:\n${fullDoc}`,
    blockOps: { add: true, delete: false, update: false },
};

// ── Custom Prompt Command ────────────────────────────────────────────────────

const customPromptCommand: AICommand = {
    key: 'custom_prompt',
    title: 'Custom Instruction',
    category: 'content',
    icon: Sparkles,
    aliases: ['custom', 'instruction', 'prompt', 'ask'],
    scope: 'both',
    systemPrompt:
        'You are a helpful writing assistant. Follow the user\'s instructions exactly. ' +
        'Produce clear, well-structured content appropriate for a professional article.',
    userPromptTemplate: (selected, fullDoc) =>
        selected
            ? `Apply this instruction to the selected text:\n\n${selected}`
            : `Apply this instruction to the document:\n\n${fullDoc}`,
    blockOps: { add: true, delete: false, update: true },
};

// ── Language Commands ────────────────────────────────────────────────────────

const translate: AICommand = {
    key: 'translate',
    title: 'Translate',
    category: 'language',
    icon: Languages,
    aliases: ['translate', 'spanish', 'french', 'language'],
    scope: 'selection',
    systemPrompt:
        'You are a professional translator. Translate text accurately while preserving tone and formatting.',
    userPromptTemplate: (selected) =>
        `Translate the following text to the target language specified by the user. If no language is specified, translate to Spanish. Preserve formatting:\n\n${selected}`,
    blockOps: { add: false, delete: false, update: true },
};

const toneProfessional: AICommand = {
    key: 'tone_professional',
    title: 'Tone: Professional',
    category: 'language',
    icon: Type,
    aliases: ['professional', 'formal', 'business'],
    scope: 'selection',
    systemPrompt:
        'You are a tone editor. Rewrite text in a professional, formal business tone.',
    userPromptTemplate: (selected) =>
        `Rewrite this text in a professional, formal business tone. Preserve the meaning and key information:\n\n${selected}`,
    blockOps: { add: false, delete: false, update: true },
};

const toneCasual: AICommand = {
    key: 'tone_casual',
    title: 'Tone: Casual',
    category: 'language',
    icon: MessageSquare,
    aliases: ['casual', 'friendly', 'informal', 'relaxed'],
    scope: 'selection',
    systemPrompt:
        'You are a tone editor. Rewrite text in a casual, friendly, approachable tone.',
    userPromptTemplate: (selected) =>
        `Rewrite this text in a casual, friendly tone. Make it approachable while keeping the core message:\n\n${selected}`,
    blockOps: { add: false, delete: false, update: true },
};

const toneConfident: AICommand = {
    key: 'tone_confident',
    title: 'Tone: Confident',
    category: 'language',
    icon: Sparkles,
    aliases: ['confident', 'bold', 'assertive', 'strong'],
    scope: 'selection',
    systemPrompt:
        'You are a tone editor. Rewrite text in a confident, assertive voice.',
    userPromptTemplate: (selected) =>
        `Rewrite this text in a confident, assertive voice. Use strong verbs and decisive language:\n\n${selected}`,
    blockOps: { add: false, delete: false, update: true },
};

// ── Registry ─────────────────────────────────────────────────────────────────

/** All built-in AI commands, in display order */
export const ALL_AI_COMMANDS: AICommand[] = [
    // Content
    continueWriting,
    expandSection,
    summarize,
    simplifyText,
    addCallToAction,
    // Editing
    fixSpelling,
    improveWriting,
    makeShorter,
    makeLonger,
    // SEO
    seoOptimize,
    writeMetaDescription,
    // Language
    translate,
    toneProfessional,
    toneCasual,
    toneConfident,
];

/** Neutral command used for free-text custom prompts */
export { customPromptCommand };

/**
 * Get commands grouped by category, in display order.
 * Returns an array of [category, commands[]] tuples.
 */
export function getCommandsByCategory(): [AICommandCategory, AICommand[]][] {
    return CATEGORY_ORDER.map((cat) => [
        cat,
        ALL_AI_COMMANDS.filter((cmd) => cmd.category === cat),
    ]);
}

/**
 * Find a command by key. Returns undefined if not found.
 */
export function getCommandByKey(key: string): AICommand | undefined {
    return ALL_AI_COMMANDS.find((cmd) => cmd.key === key);
}

/**
 * Filter commands that match a search query (by title or aliases).
 */
export function filterCommands(query: string): AICommand[] {
    const q = query.toLowerCase().trim();
    if (!q) return ALL_AI_COMMANDS;
    return ALL_AI_COMMANDS.filter(
        (cmd) =>
            cmd.title.toLowerCase().includes(q) ||
            cmd.aliases.some((a) => a.toLowerCase().includes(q)),
    );
}
