// src/ai-plugin.ts
function createProxyFetch(proxyBaseUrl, authedFetch) {
  return async (input, init) => {
    const originalUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const proxiedUrl = `${proxyBaseUrl}?url=${encodeURIComponent(originalUrl)}`;
    return authedFetch(proxiedUrl, init);
  };
}
function blocksToPlainText(blocks) {
  const lines = [];
  for (const block of blocks) {
    if (block.content && Array.isArray(block.content)) {
      const text = block.content.map((node) => {
        if (typeof node === "string") return node;
        if (node.type === "text") return node.text || "";
        if (node.content && Array.isArray(node.content)) {
          return node.content.map((inner) => {
            if (typeof inner === "string") return inner;
            if (inner.type === "text") return inner.text || "";
            return "";
          }).join("");
        }
        return "";
      }).join("");
      if (text) lines.push(text);
    }
    if (block.children && block.children.length > 0) {
      const childText = blocksToPlainText(block.children);
      if (childText) lines.push(childText);
    }
  }
  return lines.join("\n");
}
function buildPrompt(command, selectedBlocks, allBlocks, customPrompt) {
  const selectedText = blocksToPlainText(selectedBlocks);
  const fullDocText = blocksToPlainText(allBlocks);
  const userContent = customPrompt ? customPrompt + (selectedText ? `

Selected text:
${selectedText}` : `

Full document:
${fullDocText}`) : command.userPromptTemplate(selectedText, fullDocText);
  return [
    { role: "system", content: command.systemPrompt + "\nReturn your response as well-formatted HTML using <p>, <h2>, <h3>, <ul>, <ol>, <strong>, and <em> tags. Do not wrap in a code block." },
    { role: "user", content: userContent }
  ];
}
async function parseAIResponse(editor, responseText) {
  if (!responseText.trim()) {
    return [];
  }
  try {
    const htmlBlocks = await editor.tryParseHTMLToBlocks(responseText);
    if (htmlBlocks && htmlBlocks.length > 0) {
      return htmlBlocks;
    }
  } catch {
  }
  try {
    const mdBlocks = await editor.tryParseMarkdownToBlocks(responseText);
    if (mdBlocks && mdBlocks.length > 0) {
      return mdBlocks;
    }
  } catch {
  }
  return [{
    type: "paragraph",
    content: [{ type: "text", text: responseText, styles: {} }]
  }];
}
function applyAIBlocks(editor, newBlocks, selectedBlockIds, hints) {
  if (newBlocks.length === 0) return;
  editor.transact(() => {
    if (hints.update && selectedBlockIds.length > 0) {
      editor.replaceBlocks(selectedBlockIds, newBlocks);
    } else if (hints.add) {
      const referenceId = selectedBlockIds.length > 0 ? selectedBlockIds[selectedBlockIds.length - 1] : editor.document[editor.document.length - 1]?.id;
      if (referenceId) {
        editor.insertBlocks(newBlocks, referenceId, "after");
      }
    }
  });
}
async function invokeAI(editor, config, options) {
  const { command, customPrompt, onStream, onComplete, onError, onAbortReady } = options;
  const selection = editor.getSelection();
  const selectedBlocks = selection?.blocks ?? [];
  const selectedBlockIds = selectedBlocks.map((b) => b.id);
  const allBlocks = editor.document;
  const messages = buildPrompt(command, selectedBlocks, allBlocks, customPrompt);
  const abortController = new AbortController();
  const abortFn = () => abortController.abort();
  onAbortReady?.(abortFn);
  try {
    const { streamText } = await import("ai");
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const proxyFetch = createProxyFetch(config.proxyBaseUrl, config.authedFetch);
    const model = createOpenAICompatible({
      baseURL: "https://api.openai.com/v1",
      apiKey: "proxy-managed",
      name: "openai-proxy",
      fetch: proxyFetch
    })(config.model ?? "gpt-4o-mini");
    const result = streamText({
      model,
      messages,
      abortSignal: abortController.signal
    });
    let accumulated = "";
    const textStream = (await result).textStream;
    for await (const chunk of textStream) {
      accumulated += chunk;
      onStream?.(accumulated);
    }
    if (!accumulated.trim()) {
      onError?.(new Error("AI returned an empty response. Try a different prompt."));
      return () => {
      };
    }
    const newBlocks = await parseAIResponse(editor, accumulated);
    applyAIBlocks(editor, newBlocks, selectedBlockIds, command.blockOps);
    onComplete?.();
  } catch (err) {
    if (abortController.signal.aborted) {
      onComplete?.();
      return () => {
      };
    }
    const error = err instanceof Error ? err : new Error(String(err));
    onError?.(error);
  }
  return () => abortController.abort();
}

// src/ai-commands.ts
import {
  Sparkles,
  FileText,
  Expand,
  Minimize2,
  Megaphone,
  Wand2,
  Type,
  Languages,
  ArrowDownToLine,
  ArrowUpToLine,
  CheckCheck,
  PenLine,
  MessageSquare,
  ListCollapse,
  Search
} from "lucide-react";
var CATEGORY_ORDER = ["content", "editing", "seo", "language"];
var CATEGORY_LABELS = {
  content: "Content",
  editing: "Editing",
  seo: "SEO",
  language: "Language"
};
var continueWriting = {
  key: "continue_writing",
  title: "Continue Writing",
  category: "content",
  icon: PenLine,
  aliases: ["continue", "keep writing", "more"],
  scope: "both",
  systemPrompt: "You are a professional content writer. Continue writing from where the text left off, matching the existing tone, style, and formatting.",
  userPromptTemplate: (selected, fullDoc) => selected ? `Continue writing from this text:

${selected}` : `Continue writing this article:

${fullDoc}`,
  blockOps: { add: true, delete: false, update: false }
};
var expandSection = {
  key: "expand_section",
  title: "Expand Section",
  category: "content",
  icon: Expand,
  aliases: ["expand", "elaborate", "more detail", "longer"],
  scope: "selection",
  systemPrompt: "You are a professional content writer specializing in real estate and lead generation.",
  userPromptTemplate: (selected) => `Expand the selected section with more detail, concrete examples, and actionable insights. Keep the same tone and formatting style. Add approximately 2-3 additional paragraphs of relevant content.

Selected text:
${selected}`,
  blockOps: { add: true, delete: false, update: true }
};
var summarize = {
  key: "summarize",
  title: "Summarize",
  category: "content",
  icon: ListCollapse,
  aliases: ["summarize", "tldr", "summary", "brief"],
  scope: "both",
  systemPrompt: "You are a concise writer. Summarize the given text into key points while preserving the most important information.",
  userPromptTemplate: (selected, fullDoc) => selected ? `Summarize this text concisely:

${selected}` : `Summarize this article into key points:

${fullDoc}`,
  blockOps: { add: false, delete: false, update: true }
};
var simplifyText = {
  key: "simplify_text",
  title: "Simplify",
  category: "content",
  icon: Minimize2,
  aliases: ["simplify", "simpler", "plain language", "easier"],
  scope: "selection",
  systemPrompt: "You are a plain-language editor. Simplify text for a general audience.",
  userPromptTemplate: (selected) => `Simplify the selected text for a general audience. Use shorter sentences, common words, and remove jargon. Keep the core meaning intact.

Selected text:
${selected}`,
  blockOps: { add: false, delete: false, update: true }
};
var addCallToAction = {
  key: "add_cta",
  title: "Add Call to Action",
  category: "content",
  icon: Megaphone,
  aliases: ["cta", "call to action", "conversion"],
  scope: "selection",
  systemPrompt: "You are a conversion copywriter for a real estate technology platform.",
  userPromptTemplate: (selected) => `Add a compelling call-to-action at the end of the selected section. It should encourage the reader to take the next step \u2014 whether that's exploring lead packages, scheduling a consultation, or trying the platform. Keep it natural and non-pushy. Use strong action verbs.

Selected text:
${selected}`,
  blockOps: { add: true, delete: false, update: false }
};
var fixSpelling = {
  key: "fix_spelling",
  title: "Fix Spelling & Grammar",
  category: "editing",
  icon: CheckCheck,
  aliases: ["spelling", "grammar", "fix", "proofread", "typo"],
  scope: "selection",
  systemPrompt: "You are a meticulous proofreader. Fix spelling and grammar errors without changing meaning or style.",
  userPromptTemplate: (selected) => `Fix any spelling and grammar errors in this text. Do not change the meaning, tone, or structure:

${selected}`,
  blockOps: { add: false, delete: false, update: true }
};
var improveWriting = {
  key: "improve_writing",
  title: "Improve Writing",
  category: "editing",
  icon: Wand2,
  aliases: ["improve", "enhance", "better", "rewrite"],
  scope: "selection",
  systemPrompt: "You are an expert editor. Improve the clarity, flow, and impact of the text while preserving the original message.",
  userPromptTemplate: (selected) => `Improve the writing quality of this text. Enhance clarity, flow, and impact while keeping the original message:

${selected}`,
  blockOps: { add: false, delete: false, update: true }
};
var makeShorter = {
  key: "make_shorter",
  title: "Make Shorter",
  category: "editing",
  icon: ArrowDownToLine,
  aliases: ["shorter", "concise", "trim", "reduce"],
  scope: "selection",
  systemPrompt: "You are a concise editor. Shorten text while preserving key information.",
  userPromptTemplate: (selected) => `Make this text significantly shorter while keeping the key information and meaning:

${selected}`,
  blockOps: { add: false, delete: false, update: true }
};
var makeLonger = {
  key: "make_longer",
  title: "Make Longer",
  category: "editing",
  icon: ArrowUpToLine,
  aliases: ["longer", "extend", "more words"],
  scope: "selection",
  systemPrompt: "You are a content expander. Add detail, examples, and depth to the text.",
  userPromptTemplate: (selected) => `Make this text longer by adding more detail, examples, and depth. Maintain the same style and tone:

${selected}`,
  blockOps: { add: false, delete: false, update: true }
};
var seoOptimize = {
  key: "seo_optimize",
  title: "SEO Optimize",
  category: "seo",
  icon: Search,
  aliases: ["seo", "optimize", "search engine"],
  scope: "selection",
  systemPrompt: "You are an SEO specialist for real estate and lead generation content.",
  userPromptTemplate: (selected) => `Optimize the selected text for search engine rankings. Naturally incorporate relevant keywords related to real estate investing, seller leads, and property acquisition. Keep the tone professional but approachable. Do not keyword-stuff.

Selected text:
${selected}`,
  blockOps: { add: false, delete: false, update: true }
};
var writeMetaDescription = {
  key: "write_meta_description",
  title: "Write Meta Description",
  category: "seo",
  icon: FileText,
  aliases: ["meta", "description", "seo description", "serp"],
  scope: "document",
  systemPrompt: "You are an SEO copywriter. Write compelling meta descriptions for search results.",
  userPromptTemplate: (_selected, fullDoc) => `Based on the full article content, write a compelling meta description for search results. It must be under 155 characters, include a clear value proposition, and encourage clicks. Write it as a single paragraph \u2014 do not include labels or quotes. Insert it as a new paragraph at the cursor position.

Article content:
${fullDoc}`,
  blockOps: { add: true, delete: false, update: false }
};
var customPromptCommand = {
  key: "custom_prompt",
  title: "Custom Instruction",
  category: "content",
  icon: Sparkles,
  aliases: ["custom", "instruction", "prompt", "ask"],
  scope: "both",
  systemPrompt: "You are a helpful writing assistant. Follow the user's instructions exactly. Produce clear, well-structured content appropriate for a professional article.",
  userPromptTemplate: (selected, fullDoc) => selected ? `Apply this instruction to the selected text:

${selected}` : `Apply this instruction to the document:

${fullDoc}`,
  blockOps: { add: true, delete: false, update: true }
};
var translate = {
  key: "translate",
  title: "Translate",
  category: "language",
  icon: Languages,
  aliases: ["translate", "spanish", "french", "language"],
  scope: "selection",
  systemPrompt: "You are a professional translator. Translate text accurately while preserving tone and formatting.",
  userPromptTemplate: (selected) => `Translate the following text to the target language specified by the user. If no language is specified, translate to Spanish. Preserve formatting:

${selected}`,
  blockOps: { add: false, delete: false, update: true }
};
var toneProfessional = {
  key: "tone_professional",
  title: "Tone: Professional",
  category: "language",
  icon: Type,
  aliases: ["professional", "formal", "business"],
  scope: "selection",
  systemPrompt: "You are a tone editor. Rewrite text in a professional, formal business tone.",
  userPromptTemplate: (selected) => `Rewrite this text in a professional, formal business tone. Preserve the meaning and key information:

${selected}`,
  blockOps: { add: false, delete: false, update: true }
};
var toneCasual = {
  key: "tone_casual",
  title: "Tone: Casual",
  category: "language",
  icon: MessageSquare,
  aliases: ["casual", "friendly", "informal", "relaxed"],
  scope: "selection",
  systemPrompt: "You are a tone editor. Rewrite text in a casual, friendly, approachable tone.",
  userPromptTemplate: (selected) => `Rewrite this text in a casual, friendly tone. Make it approachable while keeping the core message:

${selected}`,
  blockOps: { add: false, delete: false, update: true }
};
var toneConfident = {
  key: "tone_confident",
  title: "Tone: Confident",
  category: "language",
  icon: Sparkles,
  aliases: ["confident", "bold", "assertive", "strong"],
  scope: "selection",
  systemPrompt: "You are a tone editor. Rewrite text in a confident, assertive voice.",
  userPromptTemplate: (selected) => `Rewrite this text in a confident, assertive voice. Use strong verbs and decisive language:

${selected}`,
  blockOps: { add: false, delete: false, update: true }
};
var ALL_AI_COMMANDS = [
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
  toneConfident
];
function getCommandsByCategory() {
  return CATEGORY_ORDER.map((cat) => [
    cat,
    ALL_AI_COMMANDS.filter((cmd) => cmd.category === cat)
  ]);
}
function getCommandByKey(key) {
  return ALL_AI_COMMANDS.find((cmd) => cmd.key === key);
}
function filterCommands(query) {
  const q = query.toLowerCase().trim();
  if (!q) return ALL_AI_COMMANDS;
  return ALL_AI_COMMANDS.filter(
    (cmd) => cmd.title.toLowerCase().includes(q) || cmd.aliases.some((a) => a.toLowerCase().includes(q))
  );
}

// src/AICommandMenu.tsx
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Sparkles as Sparkles2,
  Loader2,
  AlertCircle,
  X,
  Send,
  RotateCcw,
  Check,
  XCircle,
  StopCircle,
  Info
} from "lucide-react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var MAX_PROMPT_LENGTH = 500;
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ").trim();
}
function wordCount(text) {
  const stripped = stripHtml(text);
  if (!stripped) return 0;
  return stripped.split(/\s+/).filter(Boolean).length;
}
function AICommandMenu({
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
  anchorPosition
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef(null);
  const commandListRef = useRef(null);
  const menuRef = useRef(null);
  const menuStyle = useMemo(() => {
    if (!anchorPosition) return { position: "fixed", top: 100, left: 100 };
    const MENU_W = 340;
    const PAD = 16;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    let top = anchorPosition.y + 8;
    let left = anchorPosition.x;
    if (top + PAD > vh) top = vh - PAD;
    if (left + MENU_W + PAD > vw) left = vw - MENU_W - PAD;
    if (left < PAD) left = PAD;
    if (top < PAD) top = PAD;
    return { position: "fixed", top, left };
  }, [anchorPosition]);
  useEffect(() => {
    if (!isOpen || state !== "idle") return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, state, onClose]);
  useEffect(() => {
    if (isOpen && state === "idle") {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen, state]);
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setCustomPrompt("");
      setActiveIndex(-1);
    }
  }, [isOpen]);
  useEffect(() => {
    const handleKeyDown2 = (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        if (state === "loading") {
          onClose();
        } else if (state === "complete") {
          onReject();
        } else if (state === "error") {
          onClose();
        } else if (state === "idle") {
          onClose();
        }
      }
      if (state === "complete") {
        if (e.key === "Enter") {
          e.preventDefault();
          onAccept();
        } else if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          onReject();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown2);
    return () => document.removeEventListener("keydown", handleKeyDown2);
  }, [isOpen, state, onClose, onReject, onAccept]);
  const handleSubmitPrompt = useCallback(() => {
    if (!customPrompt.trim()) return;
    onCommandSelect(customPromptCommand, customPrompt.trim());
  }, [customPrompt, onCommandSelect]);
  const filteredCommands = useMemo(() => filterCommands(searchQuery), [searchQuery]);
  const groupedCommands = useMemo(
    () => CATEGORY_ORDER.map((cat) => [cat, filteredCommands.filter((cmd) => cmd.category === cat)]).filter(([, cmds]) => cmds.length > 0),
    [filteredCommands]
  );
  const flatCommands = useMemo(
    () => groupedCommands.flatMap(([, cmds]) => cmds),
    [groupedCommands]
  );
  const handleKeyDown = useCallback((e) => {
    if (state !== "idle") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev + 1;
        return next >= flatCommands.length ? 0 : next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? flatCommands.length - 1 : next;
      });
    } else if (e.key === "Enter" && activeIndex >= 0 && activeIndex < flatCommands.length) {
      e.preventDefault();
      const cmd = flatCommands[activeIndex];
      if (!(cmd.scope === "selection" && !hasSelection)) {
        onCommandSelect(cmd);
      }
    }
  }, [state, flatCommands, activeIndex, hasSelection, onCommandSelect]);
  useEffect(() => {
    if (activeIndex >= 0 && commandListRef.current) {
      const buttons = commandListRef.current.querySelectorAll("[data-cmd-index]");
      buttons[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);
  useEffect(() => {
    setActiveIndex(-1);
  }, [searchQuery]);
  const dailyRemaining = quota ? quota.daily_limit - quota.daily_requests : null;
  const previewWordCount = useMemo(
    () => streamPreview ? wordCount(streamPreview) : 0,
    [streamPreview]
  );
  const cleanPreview = useMemo(
    () => streamPreview ? stripHtml(streamPreview).slice(0, 400) : "",
    [streamPreview]
  );
  if (!isOpen) return null;
  let cmdFlatIdx = 0;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: menuRef,
      style: menuStyle,
      className: "ai-menu",
      role: "dialog",
      "aria-label": "AI Assistant",
      onKeyDown: handleKeyDown,
      children: [
        /* @__PURE__ */ jsxs("div", { className: "ai-menu__header", children: [
          /* @__PURE__ */ jsxs("div", { className: "ai-menu__header-left", children: [
            /* @__PURE__ */ jsx(Sparkles2, { size: 16, className: "ai-menu__header-icon" }),
            /* @__PURE__ */ jsx("span", { className: "ai-menu__header-title", children: "AI Assistant" })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => {
                if (state === "complete") {
                  onReject();
                } else {
                  onClose();
                }
              },
              className: "ai-menu__close",
              "aria-label": state === "loading" ? "Cancel generation" : "Close",
              title: state === "loading" ? "Cancel generation" : "Close",
              children: /* @__PURE__ */ jsx(X, { size: 14 })
            }
          )
        ] }),
        state === "idle" && /* @__PURE__ */ jsxs(Fragment, { children: [
          !hasSelection && /* @__PURE__ */ jsxs("div", { className: "ai-menu__hint", children: [
            /* @__PURE__ */ jsx(Info, { size: 12 }),
            /* @__PURE__ */ jsx("span", { children: "Select text to unlock editing commands" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "ai-menu__search", children: /* @__PURE__ */ jsx(
            "input",
            {
              ref: searchRef,
              type: "text",
              placeholder: "Search commands...",
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
              className: "ai-menu__search-input",
              role: "combobox",
              "aria-expanded": filteredCommands.length > 0,
              "aria-activedescendant": activeIndex >= 0 ? `ai-cmd-${flatCommands[activeIndex]?.key}` : void 0
            }
          ) }),
          /* @__PURE__ */ jsxs("div", { className: "ai-menu__commands", ref: commandListRef, role: "listbox", children: [
            groupedCommands.map(([category, commands]) => /* @__PURE__ */ jsxs("div", { className: "ai-menu__group", role: "group", "aria-label": CATEGORY_LABELS[category], children: [
              /* @__PURE__ */ jsx("div", { className: "ai-menu__group-label", children: CATEGORY_LABELS[category] }),
              commands.map((cmd) => {
                const idx = cmdFlatIdx++;
                const isDisabled = cmd.scope === "selection" && !hasSelection;
                return /* @__PURE__ */ jsxs(
                  "button",
                  {
                    id: `ai-cmd-${cmd.key}`,
                    className: `ai-menu__command ${idx === activeIndex ? "ai-menu__command--active" : ""}`,
                    onClick: () => onCommandSelect(cmd),
                    disabled: isDisabled,
                    title: isDisabled ? "Select text first" : cmd.title,
                    role: "option",
                    "aria-selected": idx === activeIndex,
                    "data-cmd-index": idx,
                    children: [
                      /* @__PURE__ */ jsx(cmd.icon, { size: 14, className: "ai-menu__command-icon" }),
                      /* @__PURE__ */ jsx("span", { className: "ai-menu__command-title", children: cmd.title }),
                      cmd.scope === "selection" && /* @__PURE__ */ jsx("span", { className: `ai-menu__command-badge ${isDisabled ? "ai-menu__command-badge--disabled" : ""}`, children: "selection" }),
                      cmd.scope === "document" && /* @__PURE__ */ jsx("span", { className: "ai-menu__command-badge ai-menu__command-badge--doc", children: "doc" })
                    ]
                  },
                  cmd.key
                );
              })
            ] }, category)),
            filteredCommands.length === 0 && /* @__PURE__ */ jsxs("div", { className: "ai-menu__empty", children: [
              'No commands match "',
              searchQuery,
              '"'
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "ai-menu__prompt", children: /* @__PURE__ */ jsxs("div", { className: "ai-menu__prompt-wrapper", children: [
            /* @__PURE__ */ jsx(
              "textarea",
              {
                placeholder: hasSelection ? "Or type a custom instruction for the selected text..." : "Or type a custom instruction for the full document...",
                value: customPrompt,
                onChange: (e) => setCustomPrompt(e.target.value.slice(0, MAX_PROMPT_LENGTH)),
                onKeyDown: (e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitPrompt();
                  }
                },
                rows: 2,
                className: "ai-menu__prompt-input"
              }
            ),
            /* @__PURE__ */ jsxs("div", { className: "ai-menu__prompt-footer", children: [
              /* @__PURE__ */ jsxs("span", { className: `ai-menu__prompt-counter ${customPrompt.length > 450 ? "ai-menu__prompt-counter--warn" : ""}`, children: [
                customPrompt.length,
                "/",
                MAX_PROMPT_LENGTH
              ] }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: handleSubmitPrompt,
                  disabled: !customPrompt.trim(),
                  className: "ai-menu__prompt-submit",
                  "aria-label": "Submit prompt",
                  children: /* @__PURE__ */ jsx(Send, { size: 14 })
                }
              )
            ] })
          ] }) })
        ] }),
        state === "loading" && /* @__PURE__ */ jsxs("div", { className: "ai-menu__loading", children: [
          /* @__PURE__ */ jsxs("div", { className: "ai-menu__loading-header", children: [
            /* @__PURE__ */ jsx(Loader2, { size: 16, className: "ai-menu__spinner" }),
            /* @__PURE__ */ jsx("span", { children: "Generating..." }),
            previewWordCount > 0 && /* @__PURE__ */ jsxs("span", { className: "ai-menu__word-count", children: [
              "~",
              previewWordCount,
              " words"
            ] })
          ] }),
          cleanPreview && /* @__PURE__ */ jsx("div", { className: "ai-menu__preview", children: /* @__PURE__ */ jsxs("div", { className: "ai-menu__preview-text", children: [
            cleanPreview,
            (streamPreview?.length ?? 0) > 400 && "..."
          ] }) }),
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: onClose,
              className: "ai-menu__cancel-btn",
              children: [
                /* @__PURE__ */ jsx(StopCircle, { size: 14 }),
                "Stop generating"
              ]
            }
          )
        ] }),
        state === "complete" && /* @__PURE__ */ jsxs("div", { className: "ai-menu__complete", children: [
          /* @__PURE__ */ jsxs("div", { className: "ai-menu__complete-header", children: [
            /* @__PURE__ */ jsx(Check, { size: 16, className: "ai-menu__complete-icon" }),
            /* @__PURE__ */ jsx("span", { children: "Generation complete" }),
            /* @__PURE__ */ jsxs("span", { className: "ai-menu__word-count", children: [
              "~",
              previewWordCount,
              " words"
            ] })
          ] }),
          cleanPreview && /* @__PURE__ */ jsx("div", { className: "ai-menu__preview", children: /* @__PURE__ */ jsxs("div", { className: "ai-menu__preview-text", children: [
            cleanPreview.slice(0, 200),
            cleanPreview.length > 200 && "..."
          ] }) }),
          /* @__PURE__ */ jsxs("div", { className: "ai-menu__complete-actions", children: [
            /* @__PURE__ */ jsxs("button", { onClick: onAccept, className: "ai-menu__accept-btn", children: [
              /* @__PURE__ */ jsx(Check, { size: 14 }),
              "Accept",
              /* @__PURE__ */ jsx("kbd", { className: "ai-menu__kbd", children: "\u21B5" })
            ] }),
            /* @__PURE__ */ jsxs("button", { onClick: onReject, className: "ai-menu__reject-btn", children: [
              /* @__PURE__ */ jsx(XCircle, { size: 14 }),
              "Reject"
            ] }),
            /* @__PURE__ */ jsxs("button", { onClick: onRetry, className: "ai-menu__retry-btn", children: [
              /* @__PURE__ */ jsx(RotateCcw, { size: 14 }),
              "Retry"
            ] })
          ] })
        ] }),
        state === "error" && /* @__PURE__ */ jsxs("div", { className: "ai-menu__error", children: [
          /* @__PURE__ */ jsxs("div", { className: "ai-menu__error-content", children: [
            /* @__PURE__ */ jsx(AlertCircle, { size: 16, className: "ai-menu__error-icon" }),
            /* @__PURE__ */ jsx("span", { className: "ai-menu__error-message", children: errorMessage || "Something went wrong" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "ai-menu__error-actions", children: [
            /* @__PURE__ */ jsxs("button", { onClick: onRetry, className: "ai-menu__retry", children: [
              /* @__PURE__ */ jsx(RotateCcw, { size: 14 }),
              "Retry"
            ] }),
            /* @__PURE__ */ jsx("button", { onClick: onClose, className: "ai-menu__dismiss", children: "Dismiss" })
          ] })
        ] }),
        quota && dailyRemaining !== null && /* @__PURE__ */ jsxs("div", { className: "ai-menu__quota", children: [
          /* @__PURE__ */ jsxs("span", { children: [
            "Credits: ",
            dailyRemaining,
            "/",
            quota.daily_limit,
            " today",
            dailyRemaining <= 0 && /* @__PURE__ */ jsx("span", { className: "ai-menu__quota-warn", children: " (exhausted)" })
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            "Tokens: ",
            (quota.monthly_tokens / 1e3).toFixed(0),
            "K / ",
            (quota.monthly_token_limit / 1e3).toFixed(0),
            "K"
          ] })
        ] })
      ]
    }
  );
}

// src/AIToolbarButton.tsx
import { useComponentsContext } from "@blocknote/react";
import { Sparkles as Sparkles3 } from "lucide-react";
import { jsx as jsx2 } from "react/jsx-runtime";
function AIToolbarButton({ onClick, isActive }) {
  const Components = useComponentsContext();
  if (!Components) return null;
  return /* @__PURE__ */ jsx2(
    Components.FormattingToolbar.Button,
    {
      mainTooltip: "AI Assistant",
      onClick,
      isSelected: isActive,
      children: /* @__PURE__ */ jsx2(
        Sparkles3,
        {
          size: 16,
          className: isActive ? "ai-toolbar-icon--active" : "ai-toolbar-icon"
        }
      )
    }
  );
}
export {
  AICommandMenu,
  AIToolbarButton,
  ALL_AI_COMMANDS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  applyAIBlocks,
  blocksToPlainText,
  buildPrompt,
  createProxyFetch,
  customPromptCommand,
  filterCommands,
  getCommandByKey,
  getCommandsByCategory,
  invokeAI,
  parseAIResponse
};
//# sourceMappingURL=index.js.map