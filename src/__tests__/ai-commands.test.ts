/**
 * AI Commands Test Suite
 *
 * Validates the structure, uniqueness, and configuration of all
 * AI commands in the registry.
 *
 * @agent @test-engineer
 * @phase 1A
 */

import { describe, it, expect } from 'vitest';
import {
    ALL_AI_COMMANDS,
    CATEGORY_ORDER,
    CATEGORY_LABELS,
    getCommandsByCategory,
    getCommandByKey,
    filterCommands,
    type AICommand,
    type AICommandCategory,
} from '../ai-commands';

describe('AI Commands Registry', () => {
    describe('ALL_AI_COMMANDS', () => {
        it('exports exactly 15 built-in commands', () => {
            expect(ALL_AI_COMMANDS).toHaveLength(15);
        });

        it('all commands have required fields', () => {
            for (const cmd of ALL_AI_COMMANDS) {
                expect(cmd.key).toBeTruthy();
                expect(typeof cmd.key).toBe('string');
                expect(cmd.title).toBeTruthy();
                expect(typeof cmd.title).toBe('string');
                expect(CATEGORY_ORDER).toContain(cmd.category);
                expect(cmd.icon).toBeDefined();
                expect(Array.isArray(cmd.aliases)).toBe(true);
                expect(cmd.aliases.length).toBeGreaterThan(0);
                expect(['selection', 'document', 'both']).toContain(cmd.scope);
                expect(cmd.systemPrompt).toBeTruthy();
                expect(typeof cmd.userPromptTemplate).toBe('function');
                expect(cmd.blockOps).toBeDefined();
                expect(typeof cmd.blockOps.add).toBe('boolean');
                expect(typeof cmd.blockOps.delete).toBe('boolean');
                expect(typeof cmd.blockOps.update).toBe('boolean');
            }
        });

        it('all command keys are unique', () => {
            const keys = ALL_AI_COMMANDS.map((cmd) => cmd.key);
            const uniqueKeys = new Set(keys);
            expect(uniqueKeys.size).toBe(keys.length);
        });

        it('no command key contains spaces or uppercase', () => {
            for (const cmd of ALL_AI_COMMANDS) {
                expect(cmd.key).not.toMatch(/\s/);
                expect(cmd.key).toBe(cmd.key.toLowerCase());
            }
        });
    });

    describe('Category configuration', () => {
        it('CATEGORY_ORDER has all 4 categories', () => {
            expect(CATEGORY_ORDER).toEqual(['content', 'editing', 'seo', 'language']);
        });

        it('CATEGORY_LABELS has a label for every category', () => {
            for (const cat of CATEGORY_ORDER) {
                expect(CATEGORY_LABELS[cat]).toBeTruthy();
                expect(typeof CATEGORY_LABELS[cat]).toBe('string');
            }
        });

        it('every command belongs to a valid category', () => {
            for (const cmd of ALL_AI_COMMANDS) {
                expect(CATEGORY_ORDER).toContain(cmd.category);
            }
        });

        it('every category has at least one command', () => {
            for (const cat of CATEGORY_ORDER) {
                const cmds = ALL_AI_COMMANDS.filter((c) => c.category === cat);
                expect(cmds.length).toBeGreaterThan(0);
            }
        });
    });

    describe('Content commands', () => {
        const contentCmds = ALL_AI_COMMANDS.filter((c) => c.category === 'content');

        it('has 5 content commands', () => {
            expect(contentCmds).toHaveLength(5);
        });

        it('includes continue_writing', () => {
            expect(contentCmds.find((c) => c.key === 'continue_writing')).toBeDefined();
        });

        it('includes expand_section', () => {
            expect(contentCmds.find((c) => c.key === 'expand_section')).toBeDefined();
        });

        it('includes summarize', () => {
            expect(contentCmds.find((c) => c.key === 'summarize')).toBeDefined();
        });

        it('includes simplify_text', () => {
            expect(contentCmds.find((c) => c.key === 'simplify_text')).toBeDefined();
        });

        it('includes add_cta', () => {
            expect(contentCmds.find((c) => c.key === 'add_cta')).toBeDefined();
        });
    });

    describe('Editing commands', () => {
        const editingCmds = ALL_AI_COMMANDS.filter((c) => c.category === 'editing');

        it('has 4 editing commands', () => {
            expect(editingCmds).toHaveLength(4);
        });

        it('includes fix_spelling, improve_writing, make_shorter, make_longer', () => {
            const keys = editingCmds.map((c) => c.key);
            expect(keys).toContain('fix_spelling');
            expect(keys).toContain('improve_writing');
            expect(keys).toContain('make_shorter');
            expect(keys).toContain('make_longer');
        });
    });

    describe('SEO commands', () => {
        const seoCmds = ALL_AI_COMMANDS.filter((c) => c.category === 'seo');

        it('has 2 SEO commands', () => {
            expect(seoCmds).toHaveLength(2);
        });

        it('seo_optimize targets selection', () => {
            const cmd = seoCmds.find((c) => c.key === 'seo_optimize');
            expect(cmd?.scope).toBe('selection');
        });

        it('write_meta_description targets document', () => {
            const cmd = seoCmds.find((c) => c.key === 'write_meta_description');
            expect(cmd?.scope).toBe('document');
        });
    });

    describe('Language commands', () => {
        const langCmds = ALL_AI_COMMANDS.filter((c) => c.category === 'language');

        it('has 4 language commands', () => {
            expect(langCmds).toHaveLength(4);
        });

        it('includes translate and 3 tone commands', () => {
            const keys = langCmds.map((c) => c.key);
            expect(keys).toContain('translate');
            expect(keys).toContain('tone_professional');
            expect(keys).toContain('tone_casual');
            expect(keys).toContain('tone_confident');
        });
    });

    describe('Prompt templates', () => {
        it('selection-scoped commands use selectedText in their prompts', () => {
            const selectionCmds = ALL_AI_COMMANDS.filter(
                (c) => c.scope === 'selection',
            );
            for (const cmd of selectionCmds) {
                const result = cmd.userPromptTemplate('test selection text');
                expect(result).toContain('test selection text');
            }
        });

        it('document-scoped commands use fullDoc in their prompts', () => {
            const docCmds = ALL_AI_COMMANDS.filter((c) => c.scope === 'document');
            for (const cmd of docCmds) {
                const result = cmd.userPromptTemplate('', 'full document text');
                expect(result).toContain('full document text');
            }
        });

        it('both-scoped commands handle selection when provided', () => {
            const bothCmds = ALL_AI_COMMANDS.filter((c) => c.scope === 'both');
            for (const cmd of bothCmds) {
                const withSelection = cmd.userPromptTemplate('selected text', 'full doc');
                expect(withSelection).toContain('selected text');
            }
        });

        it('both-scoped commands fall back to fullDoc when no selection', () => {
            const bothCmds = ALL_AI_COMMANDS.filter((c) => c.scope === 'both');
            for (const cmd of bothCmds) {
                const withoutSelection = cmd.userPromptTemplate('', 'full doc content');
                expect(withoutSelection).toContain('full doc content');
            }
        });
    });

    describe('Block operation hints', () => {
        it('update-only commands set update=true, add=false', () => {
            const updateOnly = ALL_AI_COMMANDS.filter(
                (c) => c.blockOps.update && !c.blockOps.add,
            );
            expect(updateOnly.length).toBeGreaterThan(0);
            for (const cmd of updateOnly) {
                expect(cmd.blockOps.delete).toBe(false);
            }
        });

        it('add-only commands set add=true, update=false', () => {
            const addOnly = ALL_AI_COMMANDS.filter(
                (c) => c.blockOps.add && !c.blockOps.update,
            );
            expect(addOnly.length).toBeGreaterThan(0);
        });

        it('no command sets delete=true (we never auto-delete)', () => {
            for (const cmd of ALL_AI_COMMANDS) {
                expect(cmd.blockOps.delete).toBe(false);
            }
        });
    });

    describe('getCommandsByCategory()', () => {
        it('returns tuples in CATEGORY_ORDER', () => {
            const grouped = getCommandsByCategory();
            expect(grouped).toHaveLength(CATEGORY_ORDER.length);
            grouped.forEach(([cat], i) => {
                expect(cat).toBe(CATEGORY_ORDER[i]);
            });
        });

        it('all commands are included in exactly one category', () => {
            const grouped = getCommandsByCategory();
            const allGrouped = grouped.flatMap(([, cmds]) => cmds);
            expect(allGrouped).toHaveLength(ALL_AI_COMMANDS.length);
        });
    });

    describe('getCommandByKey()', () => {
        it('finds existing commands', () => {
            expect(getCommandByKey('seo_optimize')).toBeDefined();
            expect(getCommandByKey('seo_optimize')?.title).toBe('SEO Optimize');
        });

        it('returns undefined for unknown keys', () => {
            expect(getCommandByKey('nonexistent')).toBeUndefined();
        });
    });

    describe('filterCommands()', () => {
        it('returns all commands for empty query', () => {
            expect(filterCommands('')).toHaveLength(ALL_AI_COMMANDS.length);
        });

        it('filters by title', () => {
            const results = filterCommands('seo');
            expect(results.length).toBeGreaterThan(0);
            expect(results.some((c) => c.key === 'seo_optimize')).toBe(true);
        });

        it('filters by alias', () => {
            const results = filterCommands('cta');
            expect(results.some((c) => c.key === 'add_cta')).toBe(true);
        });

        it('is case-insensitive', () => {
            const upper = filterCommands('SEO');
            const lower = filterCommands('seo');
            expect(upper).toEqual(lower);
        });

        it('returns empty for nonsense query', () => {
            expect(filterCommands('zzzznonexistent')).toHaveLength(0);
        });
    });

    describe('Custom command parity (Phase 0 audit)', () => {
        it('seo_optimize matches original prompt intent', () => {
            const cmd = getCommandByKey('seo_optimize')!;
            const prompt = cmd.userPromptTemplate('sample text');
            expect(prompt).toContain('search engine');
            expect(prompt).toContain('real estate');
            expect(prompt).toContain('keyword-stuff');
        });

        it('write_meta_description matches original prompt intent', () => {
            const cmd = getCommandByKey('write_meta_description')!;
            const prompt = cmd.userPromptTemplate('', 'full article');
            expect(prompt).toContain('155 characters');
            expect(prompt).toContain('meta description');
        });

        it('expand_section matches original prompt intent', () => {
            const cmd = getCommandByKey('expand_section')!;
            const prompt = cmd.userPromptTemplate('section text');
            expect(prompt).toContain('2-3 additional paragraphs');
        });

        it('simplify_text matches original prompt intent', () => {
            const cmd = getCommandByKey('simplify_text')!;
            const prompt = cmd.userPromptTemplate('complex text');
            expect(prompt).toContain('shorter sentences');
            expect(prompt).toContain('jargon');
        });

        it('add_cta matches original prompt intent', () => {
            const cmd = getCommandByKey('add_cta')!;
            const prompt = cmd.userPromptTemplate('section');
            expect(prompt).toContain('call-to-action');
            expect(prompt).toContain('action verbs');
        });
    });
});
