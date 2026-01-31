import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: 'src/app',
  build: {
    outDir: resolve(__dirname, 'dist/app'),
    emptyOutDir: true,
    target: 'esnext',
    // Disable minification in dev for better error messages
    minify: isDev ? false : 'esbuild',
    // Keep readable variable names in dev
    sourcemap: isDev ? 'inline' : false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/app'),
    },
  },
  // Use React development mode for better errors
  define: {
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
  },
});
