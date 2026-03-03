/**
 * AI Plugin Core
 *
 * Replaces @blocknote/xl-ai's AIExtension, ClientSideTransport, and fetchViaProxy.
 * Uses only public BlockNote APIs + MIT-licensed @ai-sdk packages.
 *
 * @agent @ai-systems-engineer
 * @phase 1A
 */

import type { Block, BlockNoteEditor, PartialBlock } from '@blocknote/core';
import type { AICommand, BlockOperationHints } from './ai-commands';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AIInvokeOptions {
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

export interface AIPluginConfig {
    /** The authenticated fetch function for the proxy */
    authedFetch: typeof fetch;
    /** The proxy base URL */
    proxyBaseUrl: string;
    /** The OpenAI model identifier */
    model?: string;
}

// ── Proxy Fetch ──────────────────────────────────────────────────────────────

/**
 * Creates a fetch function that routes all requests through the
 * Supabase Edge Function proxy. Replaces xl-ai's `fetchViaProxy`.
 *
 * The proxy rewrites the URL so that the original OpenAI URL is passed
 * as a query parameter, and the actual request goes to our proxy.
 */
export function createProxyFetch(
    proxyBaseUrl: string,
    authedFetch: typeof fetch,
): typeof fetch {
    return async (
        input: string | URL | Request,
        init?: RequestInit,
    ): Promise<Response> => {
        const originalUrl = typeof input === 'string'
            ? input
            : input instanceof URL
                ? input.toString()
                : input.url;

        const proxiedUrl = `${proxyBaseUrl}?url=${encodeURIComponent(originalUrl)}`;
        return authedFetch(proxiedUrl, init);
    };
}

// ── Prompt Building ──────────────────────────────────────────────────────────

/**
 * Extracts plain text from an array of BlockNote blocks.
 * Used to build AI prompts from editor content.
 */
export function blocksToPlainText(blocks: Block[]): string {
    const lines: string[] = [];
    for (const block of blocks) {
        if (block.content && Array.isArray(block.content)) {
            const text = block.content
                .map((node: any) => {
                    if (typeof node === 'string') return node;
                    if (node.type === 'text') return node.text || '';
                    // Recurse into nested inline content (links, mentions, etc.)
                    if (node.content && Array.isArray(node.content)) {
                        return node.content
                            .map((inner: any) => {
                                if (typeof inner === 'string') return inner;
                                if (inner.type === 'text') return inner.text || '';
                                return '';
                            })
                            .join('');
                    }
                    return '';
                })
                .join('');
            if (text) lines.push(text);
        }
        // Recurse into children
        if (block.children && block.children.length > 0) {
            const childText = blocksToPlainText(block.children);
            if (childText) lines.push(childText);
        }
    }
    return lines.join('\n');
}

/**
 * Builds the OpenAI messages array from a command + editor context.
 */
export function buildPrompt(
    command: AICommand,
    selectedBlocks: Block[],
    allBlocks: Block[],
    customPrompt?: string,
): { role: 'system' | 'user'; content: string }[] {
    const selectedText = blocksToPlainText(selectedBlocks);
    const fullDocText = blocksToPlainText(allBlocks);

    const userContent = customPrompt
        ? customPrompt + (selectedText ? `\n\nSelected text:\n${selectedText}` : `\n\nFull document:\n${fullDocText}`)
        : command.userPromptTemplate(selectedText, fullDocText);

    return [
        { role: 'system' as const, content: command.systemPrompt + '\nReturn your response as well-formatted HTML using <p>, <h2>, <h3>, <ul>, <ol>, <strong>, and <em> tags. Do not wrap in a code block.' },
        { role: 'user' as const, content: userContent },
    ];
}

// ── Response Parsing ─────────────────────────────────────────────────────────

/**
 * Parses an AI response (HTML or markdown) into BlockNote blocks.
 *
 * Tries HTML first (since our prompts ask for HTML-formatted output),
 * falls back to markdown parsing if HTML parsing returns empty.
 */
export async function parseAIResponse(
    editor: BlockNoteEditor,
    responseText: string,
): Promise<PartialBlock[]> {
    if (!responseText.trim()) {
        return [];
    }

    // Try HTML parsing first
    try {
        const htmlBlocks = await editor.tryParseHTMLToBlocks(responseText);
        if (htmlBlocks && htmlBlocks.length > 0) {
            return htmlBlocks;
        }
    } catch {
        // HTML parsing failed, try markdown
    }

    // Fallback to markdown parsing
    try {
        const mdBlocks = await editor.tryParseMarkdownToBlocks(responseText);
        if (mdBlocks && mdBlocks.length > 0) {
            return mdBlocks;
        }
    } catch {
        // Markdown parsing also failed
    }

    // Last resort: wrap raw text in a paragraph block
    return [{
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: responseText, styles: {} }],
    }];
}

// ── Block Operations ─────────────────────────────────────────────────────────

/**
 * Applies AI-generated blocks to the editor, wrapped in a transaction
 * so the entire operation can be undone with a single Cmd+Z.
 *
 * Operation behavior is determined by `BlockOperationHints`:
 * - `update: true` → replace selected blocks with AI output (even if output is longer)
 * - `add: true, update: false` → insert AI output after the last selected block
 * - `add: true, update: true` → same as update (replaceBlocks handles inserting longer content)
 */
export function applyAIBlocks(
    editor: BlockNoteEditor,
    newBlocks: PartialBlock[],
    selectedBlockIds: string[],
    hints: BlockOperationHints,
): void {
    if (newBlocks.length === 0) return;

    editor.transact(() => {
        if (hints.update && selectedBlockIds.length > 0) {
            // Replace selected blocks with AI output
            editor.replaceBlocks(selectedBlockIds, newBlocks);
        } else if (hints.add) {
            // Insert after the last selected block, or at end of document
            const referenceId = selectedBlockIds.length > 0
                ? selectedBlockIds[selectedBlockIds.length - 1]
                : editor.document[editor.document.length - 1]?.id;

            if (referenceId) {
                editor.insertBlocks(newBlocks, referenceId, 'after');
            }
        }
    });
}

// ── Main AI Invocation ───────────────────────────────────────────────────────

/**
 * Invokes an AI command on the editor.
 *
 * This is the main entry point — replaces `AIExtension.invokeAI()`.
 * Uses Vercel AI SDK's `streamText()` for streaming, applies results
 * via `editor.transact()` for single-undo behavior.
 *
 * Returns an abort function to cancel the streaming request.
 */
export async function invokeAI(
    editor: BlockNoteEditor,
    config: AIPluginConfig,
    options: AIInvokeOptions,
): Promise<() => void> {
    const { command, customPrompt, onStream, onComplete, onError, onAbortReady } = options;

    // Get selected blocks or fall back to full document
    const selection = editor.getSelection();
    const selectedBlocks = selection?.blocks ?? [];
    const selectedBlockIds = selectedBlocks.map((b: Block) => b.id);
    const allBlocks = editor.document;

    // Build prompt messages
    const messages = buildPrompt(command, selectedBlocks, allBlocks, customPrompt);

    // Set up abort controller for cancellation
    const abortController = new AbortController();
    const abortFn = () => abortController.abort();

    // Fire abort function IMMEDIATELY so callers can cancel mid-stream
    onAbortReady?.(abortFn);

    try {
        // Dynamic import to avoid bundling AI SDK when not needed
        const { streamText } = await import('ai');
        const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');

        // Create model with proxy fetch
        const proxyFetch = createProxyFetch(config.proxyBaseUrl, config.authedFetch);
        const model = createOpenAICompatible({
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'proxy-managed',
            name: 'openai-proxy',
            fetch: proxyFetch,
        })(config.model ?? 'gpt-4o-mini');

        // Stream the response
        const result = streamText({
            model,
            messages,
            abortSignal: abortController.signal,
        });

        // Accumulate and stream text
        let accumulated = '';
        const textStream = (await result).textStream;

        for await (const chunk of textStream) {
            accumulated += chunk;
            onStream?.(accumulated);
        }

        // Parse final response and apply to editor
        if (!accumulated.trim()) {
            onError?.(new Error('AI returned an empty response. Try a different prompt.'));
            return () => { };
        }

        const newBlocks = await parseAIResponse(editor, accumulated);
        applyAIBlocks(editor, newBlocks, selectedBlockIds, command.blockOps);

        onComplete?.();
    } catch (err: unknown) {
        if (abortController.signal.aborted) {
            // User cancelled — silently close, not an error
            onComplete?.();
            return () => { };
        }
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
    }

    return () => abortController.abort();
}
