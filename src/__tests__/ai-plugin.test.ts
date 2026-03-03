/**
 * AI Plugin Core Test Suite
 *
 * Tests for createProxyFetch, buildPrompt, parseAIResponse,
 * applyAIBlocks, and blocksToPlainText.
 *
 * @agent @test-engineer
 * @phase 1A
 */

import { describe, it, expect, vi } from 'vitest';
import {
    createProxyFetch,
    buildPrompt,
    parseAIResponse,
    applyAIBlocks,
    blocksToPlainText,
} from '../ai-plugin';
import type { AICommand, BlockOperationHints } from '../ai-commands';

// ── Mock Helpers ─────────────────────────────────────────────────────────────

function makeMockBlock(id: string, text: string) {
    return {
        id,
        type: 'paragraph',
        props: {},
        content: [{ type: 'text', text }],
        children: [],
    } as any;
}

function makeMockCommand(overrides: Partial<AICommand> = {}): AICommand {
    return {
        key: 'test_command',
        title: 'Test Command',
        category: 'content',
        icon: {} as any,
        aliases: ['test'],
        scope: 'selection',
        systemPrompt: 'You are a helpful assistant.',
        userPromptTemplate: (selected, fullDoc) =>
            selected ? `Edit: ${selected}` : `Analyze: ${fullDoc}`,
        blockOps: { add: false, delete: false, update: true },
        ...overrides,
    };
}

function makeMockEditor(blocks: any[] = []) {
    return {
        document: blocks,
        getSelection: vi.fn().mockReturnValue({ blocks }),
        transact: vi.fn((fn: () => void) => fn()),
        replaceBlocks: vi.fn(),
        insertBlocks: vi.fn(),
        tryParseHTMLToBlocks: vi.fn().mockResolvedValue([]),
        tryParseMarkdownToBlocks: vi.fn().mockResolvedValue([]),
    } as any;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createProxyFetch', () => {
    it('rewrites URL through proxy', async () => {
        const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
        const proxyFetch = createProxyFetch('https://proxy.example.com/fn', mockFetch);

        await proxyFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });

        expect(mockFetch).toHaveBeenCalledWith(
            'https://proxy.example.com/fn?url=https%3A%2F%2Fapi.openai.com%2Fv1%2Fchat%2Fcompletions',
            { method: 'POST' },
        );
    });

    it('handles URL objects', async () => {
        const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
        const proxyFetch = createProxyFetch('https://proxy.example.com/fn', mockFetch);

        await proxyFetch(new URL('https://api.openai.com/v1/models'));

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('url=https%3A%2F%2Fapi.openai.com%2Fv1%2Fmodels'),
            undefined,
        );
    });

    it('passes headers through to the underlying fetch', async () => {
        const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
        const proxyFetch = createProxyFetch('https://proxy.example.com/fn', mockFetch);

        const init = {
            method: 'POST',
            headers: { 'Authorization': 'Bearer test-token', 'Apikey': 'test-key' },
        };
        await proxyFetch('https://api.openai.com/v1/chat', init);

        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: { 'Authorization': 'Bearer test-token', 'Apikey': 'test-key' },
            }),
        );
    });

    it('encodes special characters in URLs', async () => {
        const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
        const proxyFetch = createProxyFetch('https://proxy.example.com/fn', mockFetch);

        await proxyFetch('https://api.openai.com/v1/chat?model=gpt-4&temp=0.7');

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('url=');
        // Ensure the original URL is properly encoded
        expect(calledUrl).not.toContain('&temp=');
    });
});

describe('blocksToPlainText', () => {
    it('extracts text from simple text blocks', () => {
        const blocks = [
            makeMockBlock('1', 'Hello world'),
            makeMockBlock('2', 'Second paragraph'),
        ];
        expect(blocksToPlainText(blocks)).toBe('Hello world\nSecond paragraph');
    });

    it('handles empty content gracefully', () => {
        const blocks = [{ id: '1', type: 'paragraph', content: [], children: [] } as any];
        expect(blocksToPlainText(blocks)).toBe('');
    });

    it('handles blocks with no content property', () => {
        const blocks = [{ id: '1', type: 'image', props: {}, children: [] } as any];
        expect(blocksToPlainText(blocks)).toBe('');
    });

    it('recurses into children', () => {
        const blocks = [{
            id: '1',
            type: 'paragraph',
            content: [{ type: 'text', text: 'Parent' }],
            children: [makeMockBlock('2', 'Child')],
        } as any];
        expect(blocksToPlainText(blocks)).toContain('Parent');
        expect(blocksToPlainText(blocks)).toContain('Child');
    });

    it('returns empty string for empty block array', () => {
        expect(blocksToPlainText([])).toBe('');
    });

    it('extracts text from link inline content (BUG-3 fix)', () => {
        const blocks = [{
            id: '1',
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Visit ' },
                { type: 'link', href: 'https://realty.com', content: [{ type: 'text', text: 'our website' }] },
                { type: 'text', text: ' today' },
            ],
            children: [],
        } as any];
        const result = blocksToPlainText(blocks);
        expect(result).toBe('Visit our website today');
    });
});

describe('buildPrompt', () => {
    it('builds system + user messages', () => {
        const command = makeMockCommand();
        const blocks = [makeMockBlock('1', 'selected text')];
        const allBlocks = [makeMockBlock('1', 'selected text'), makeMockBlock('2', 'other text')];

        const messages = buildPrompt(command, blocks, allBlocks);

        expect(messages).toHaveLength(2);
        expect(messages[0].role).toBe('system');
        expect(messages[0].content).toContain('You are a helpful assistant.');
        expect(messages[0].content).toContain('well-formatted HTML');
        expect(messages[1].role).toBe('user');
        expect(messages[1].content).toContain('selected text');
    });

    it('uses customPrompt when provided, with selected text appended', () => {
        const command = makeMockCommand();
        const blocks = [makeMockBlock('1', 'my selection')];
        const allBlocks = blocks;

        const messages = buildPrompt(command, blocks, allBlocks, 'Make this funny');

        expect(messages[1].content).toContain('Make this funny');
        expect(messages[1].content).toContain('my selection');
    });

    it('uses customPrompt with fullDoc when no selection', () => {
        const command = makeMockCommand();
        const allBlocks = [makeMockBlock('1', 'full document content')];

        const messages = buildPrompt(command, [], allBlocks, 'Analyze this');

        expect(messages[1].content).toContain('Analyze this');
        expect(messages[1].content).toContain('full document content');
    });

    it('calls command.userPromptTemplate when no customPrompt', () => {
        const template = vi.fn().mockReturnValue('generated prompt');
        const command = makeMockCommand({ userPromptTemplate: template });
        const blocks = [makeMockBlock('1', 'test')];

        buildPrompt(command, blocks, blocks);

        expect(template).toHaveBeenCalledWith('test', 'test');
    });
});

describe('parseAIResponse', () => {
    it('tries HTML parsing first', async () => {
        const editor = makeMockEditor();
        const htmlBlocks = [makeMockBlock('new', 'parsed html')];
        editor.tryParseHTMLToBlocks.mockResolvedValue(htmlBlocks);

        const result = await parseAIResponse(editor, '<p>Hello</p>');

        expect(editor.tryParseHTMLToBlocks).toHaveBeenCalledWith('<p>Hello</p>');
        expect(result).toEqual(htmlBlocks);
    });

    it('falls back to markdown when HTML returns empty', async () => {
        const editor = makeMockEditor();
        editor.tryParseHTMLToBlocks.mockResolvedValue([]);
        const mdBlocks = [makeMockBlock('new', 'parsed md')];
        editor.tryParseMarkdownToBlocks.mockResolvedValue(mdBlocks);

        const result = await parseAIResponse(editor, '## Heading\n\nSome text');

        expect(editor.tryParseMarkdownToBlocks).toHaveBeenCalled();
        expect(result).toEqual(mdBlocks);
    });

    it('falls back to plain paragraph when both parsers fail', async () => {
        const editor = makeMockEditor();
        editor.tryParseHTMLToBlocks.mockRejectedValue(new Error('parse error'));
        editor.tryParseMarkdownToBlocks.mockRejectedValue(new Error('parse error'));

        const result = await parseAIResponse(editor, 'just plain text');

        expect(result).toEqual([{
            type: 'paragraph',
            content: [{ type: 'text', text: 'just plain text', styles: {} }],
        }]);
    });

    it('returns empty array for empty/whitespace input', async () => {
        const editor = makeMockEditor();
        expect(await parseAIResponse(editor, '')).toEqual([]);
        expect(await parseAIResponse(editor, '   ')).toEqual([]);
    });

    it('handles HTML parse returning undefined gracefully', async () => {
        const editor = makeMockEditor();
        editor.tryParseHTMLToBlocks.mockResolvedValue(undefined);
        editor.tryParseMarkdownToBlocks.mockResolvedValue([makeMockBlock('1', 'fallback')]);

        const result = await parseAIResponse(editor, 'some content');
        expect(result).toBeDefined();
    });
});

describe('applyAIBlocks', () => {
    it('replaces blocks when update=true with selection', () => {
        const editor = makeMockEditor([makeMockBlock('1', 'old')]);
        const newBlocks = [makeMockBlock('new', 'replacement')];
        const hints: BlockOperationHints = { add: false, delete: false, update: true };

        applyAIBlocks(editor, newBlocks, ['1'], hints);

        expect(editor.transact).toHaveBeenCalled();
        expect(editor.replaceBlocks).toHaveBeenCalledWith(['1'], newBlocks);
    });

    it('inserts blocks when add=true, update=false', () => {
        const doc = [makeMockBlock('1', 'existing')];
        const editor = makeMockEditor(doc);
        const newBlocks = [makeMockBlock('new', 'added')];
        const hints: BlockOperationHints = { add: true, delete: false, update: false };

        applyAIBlocks(editor, newBlocks, ['1'], hints);

        expect(editor.transact).toHaveBeenCalled();
        expect(editor.insertBlocks).toHaveBeenCalledWith(newBlocks, '1', 'after');
    });

    it('inserts at end of document when no selection and add=true', () => {
        const doc = [makeMockBlock('last', 'last block')];
        const editor = makeMockEditor(doc);
        const newBlocks = [makeMockBlock('new', 'appended')];
        const hints: BlockOperationHints = { add: true, delete: false, update: false };

        applyAIBlocks(editor, newBlocks, [], hints);

        expect(editor.insertBlocks).toHaveBeenCalledWith(newBlocks, 'last', 'after');
    });

    it('wraps operations in editor.transact for single undo', () => {
        const editor = makeMockEditor([makeMockBlock('1', 'text')]);
        const hints: BlockOperationHints = { add: false, delete: false, update: true };

        applyAIBlocks(editor, [makeMockBlock('new', 'text')], ['1'], hints);

        expect(editor.transact).toHaveBeenCalledTimes(1);
        expect(typeof editor.transact.mock.calls[0][0]).toBe('function');
    });

    it('does nothing for empty newBlocks', () => {
        const editor = makeMockEditor([makeMockBlock('1', 'text')]);
        const hints: BlockOperationHints = { add: false, delete: false, update: true };

        applyAIBlocks(editor, [], ['1'], hints);

        expect(editor.transact).not.toHaveBeenCalled();
    });
});

describe('invokeAI', () => {
    // We need to dynamically import to test
    // Mock the AI SDK modules
    vi.mock('ai', () => ({
        streamText: vi.fn().mockReturnValue(Promise.resolve({
            textStream: (async function* () {
                yield 'Hello ';
                yield 'world';
            })(),
        })),
    }));

    vi.mock('@ai-sdk/openai-compatible', () => ({
        createOpenAICompatible: vi.fn().mockReturnValue(() => 'mock-model'),
    }));

    it('calls onStream with accumulated text', async () => {
        const { invokeAI } = await import('../ai-plugin');
        const editor = makeMockEditor([makeMockBlock('1', 'test')]);
        editor.tryParseHTMLToBlocks.mockResolvedValue([makeMockBlock('r', 'result')]);

        const onStream = vi.fn();
        const onComplete = vi.fn();
        const command = makeMockCommand();

        await invokeAI(editor, {
            authedFetch: vi.fn().mockResolvedValue(new Response('ok')),
            proxyBaseUrl: 'https://proxy.example.com',
        }, {
            command,
            onStream,
            onComplete,
        });

        // onStream should have been called with accumulated chunks
        expect(onStream).toHaveBeenCalled();
        expect(onComplete).toHaveBeenCalled();
    });

    it('calls onError on failure', async () => {
        // Override streamText to throw
        const ai = await import('ai');
        (ai.streamText as any).mockReturnValueOnce(Promise.reject(new Error('Network error')));

        const { invokeAI } = await import('../ai-plugin');
        const editor = makeMockEditor([makeMockBlock('1', 'test')]);
        const onError = vi.fn();

        await invokeAI(editor, {
            authedFetch: vi.fn(),
            proxyBaseUrl: 'https://proxy.example.com',
        }, {
            command: makeMockCommand(),
            onError,
        });

        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('returns an abort function', async () => {
        const { invokeAI } = await import('../ai-plugin');
        const editor = makeMockEditor([makeMockBlock('1', 'test')]);
        editor.tryParseHTMLToBlocks.mockResolvedValue([]);

        const abort = await invokeAI(editor, {
            authedFetch: vi.fn().mockResolvedValue(new Response('ok')),
            proxyBaseUrl: 'https://proxy.example.com',
        }, {
            command: makeMockCommand(),
        });

        expect(typeof abort).toBe('function');
    });
});
