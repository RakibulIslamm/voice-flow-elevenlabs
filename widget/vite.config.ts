import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Builds a single IIFE bundle to `../public/widget.js`. Customers embed
// it with one <script> tag — no module bundler, no CSS file, no peer
// React. Preact + the ElevenLabs browser SDK get inlined.
export default defineConfig({
  plugins: [preact()],
  define: {
    // Strip dev-only invariant code from preact so the production bundle
    // doesn't carry warnings or stack-trace helpers.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'VoiceFlowWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      output: {
        // Single bundle — no chunk splitting, no extra files in public/.
        inlineDynamicImports: true,
        // We don't want a hashed filename; customers paste a stable URL.
        assetFileNames: '[name][extname]',
      },
    },
    outDir: resolve(__dirname, '../public'),
    emptyOutDir: false, // public/ has other files we must not wipe
    sourcemap: false,
  },
});
