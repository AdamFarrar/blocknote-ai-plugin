import { defineConfig } from 'tsup';
import { copyFileSync } from 'fs';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: [
        'react',
        'react-dom',
        '@blocknote/core',
        '@blocknote/react',
        '@floating-ui/react',
        'ai',
        '@ai-sdk/openai-compatible',
        'lucide-react',
    ],
    onSuccess: async () => {
        copyFileSync('src/styles.css', 'dist/styles.css');
        console.log('✓ Copied styles.css to dist/');
    },
});
