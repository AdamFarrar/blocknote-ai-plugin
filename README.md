# blocknote-ai-plugin

AI-powered editing commands for [BlockNote](https://www.blocknotejs.org/) editors. Streaming, proxy-ready, zero `@blocknote/xl-ai` dependencies.

## Prerequisites

> **This package is a plugin for BlockNote.** You must have a working BlockNote editor in your project before installing this plugin. If you haven't set up BlockNote yet, follow the [BlockNote Getting Started guide](https://www.blocknotejs.org/docs/getting-started) first.

### Required peer dependencies

Your project **must** have these installed:

```bash
npm install @blocknote/core @blocknote/react @blocknote/mantine
npm install ai @ai-sdk/openai-compatible
npm install @floating-ui/react lucide-react
```

| Package | Why |
|---------|-----|
| `@blocknote/core` | BlockNote's core editor engine |
| `@blocknote/react` | React bindings for BlockNote |
| `ai` | Vercel AI SDK for streaming |
| `@ai-sdk/openai-compatible` | OpenAI-compatible model provider |
| `@floating-ui/react` | Menu positioning |
| `lucide-react` | Icons |

## Installation

Install directly from GitHub:

```bash
npm install github:AdamFarrar/blocknote-ai-plugin
```

Then import the stylesheet in your app entry point:

```ts
import 'blocknote-ai-plugin/styles.css';
```

## Quick Start

```tsx
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import {
  invokeAI,
  AICommandMenu,
  AIToolbarButton,
  ALL_AI_COMMANDS,
  type AIPluginConfig,
  type AIMenuState,
} from 'blocknote-ai-plugin';
import 'blocknote-ai-plugin/styles.css';

function MyEditor() {
  const editor = useCreateBlockNote();
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiState, setAIState] = useState<AIMenuState>('idle');

  // Configure the AI proxy
  const aiConfig: AIPluginConfig = {
    authedFetch: async (url, init) => {
      // Your authenticated fetch — inject JWT/session token
      const session = await supabase.auth.getSession();
      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
      });
    },
    proxyBaseUrl: 'https://your-project.supabase.co/functions/v1/ai-article-assist',
    model: 'gpt-4o-mini', // optional, defaults to gpt-4o-mini
  };

  const handleCommand = async (command, customPrompt?) => {
    setAIState('loading');
    try {
      await invokeAI(editor, aiConfig, {
        command,
        customPrompt,
        onStream: (text) => { /* update preview */ },
        onComplete: () => setAIState('complete'),
        onError: (err) => setAIState('error'),
      });
    } catch {
      setAIState('error');
    }
  };

  return (
    <>
      <BlockNoteView editor={editor} />
      <AICommandMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        onCommandSelect={handleCommand}
        onRetry={() => { /* retry last command */ }}
        onAccept={() => setAIState('idle')}
        onReject={() => { /* undo + reset */ }}
        state={aiState}
        hasSelection={/* check editor selection */}
      />
    </>
  );
}
```

## What's Included

### Core (`ai-plugin.ts`)
- **`invokeAI()`** — Main entry point. Streams AI responses and applies them to the editor.
- **`createProxyFetch()`** — Routes requests through your proxy (keeps API keys server-side).
- **`buildPrompt()`** — Builds OpenAI messages from command + editor context.
- **`parseAIResponse()`** — Parses HTML/markdown AI output into BlockNote blocks.
- **`applyAIBlocks()`** — Applies blocks to the editor in a single undo-able transaction.

### Commands (`ai-commands.ts`)
15 built-in commands across 4 categories:

| Category | Commands |
|----------|----------|
| **Content** | Continue Writing, Expand Section, Summarize, Simplify, Add CTA |
| **Editing** | Fix Spelling & Grammar, Improve Writing, Make Shorter, Make Longer |
| **SEO** | SEO Optimize, Write Meta Description |
| **Language** | Translate, Tone: Professional, Tone: Casual, Tone: Confident |

### Components
- **`<AICommandMenu />`** — Full floating panel with search, categories, free-text prompt, streaming preview, accept/reject flow, and quota display.
- **`<AIToolbarButton />`** — Sparkle icon button for BlockNote's formatting toolbar.

### Styles
- **`styles.css`** — Dark/light mode compatible. Import separately.

## Proxy Edge Function

This plugin expects an **authenticated proxy** between your frontend and OpenAI. The proxy:
- Injects your `OPENAI_API_KEY` from server secrets
- Validates user authentication (JWT)
- Enforces rate limits (daily requests + monthly tokens)
- Logs all AI usage for auditing

See the [proxy example](https://github.com/AdamFarrar/blocknote-ai-plugin/tree/main/examples/proxy) for a Supabase Edge Function implementation.

## API Reference

### `AIPluginConfig`

```ts
interface AIPluginConfig {
  authedFetch: typeof fetch;  // Your authenticated fetch wrapper
  proxyBaseUrl: string;       // URL of your AI proxy endpoint
  model?: string;             // OpenAI model (default: 'gpt-4o-mini')
}
```

### `AICommand`

```ts
interface AICommand {
  key: string;                // Unique identifier
  title: string;              // Display name
  category: AICommandCategory; // 'content' | 'editing' | 'seo' | 'language'
  icon: LucideIcon;           // Icon component
  aliases: string[];          // Search aliases
  scope: AICommandScope;      // 'selection' | 'document' | 'both'
  systemPrompt: string;       // System message for OpenAI
  userPromptTemplate: (selectedText: string, fullDoc?: string) => string;
  blockOps: BlockOperationHints;
}
```

## License

MIT
