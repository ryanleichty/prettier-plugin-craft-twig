/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  resolve: {
    alias: {
      src: resolve(process.cwd(), 'src'),
      '~': resolve(process.cwd(), 'src'),
    },
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'dist/index.js',
      formats: ['umd'],
      fileName: () => 'standalone.js',
      name: 'prettierPluginCraftTwig',
    },
    minify: isProduction,
    outDir: '.vite-standalone',
    rollupOptions: {
      external: ['prettier'],
      output: {
        exports: 'named',
        globals: {
          prettier: 'prettier',
        },
      },
    },
    sourcemap: !isProduction ? 'inline' : false,
  },
  test: {
    globals: true,
    include: ['test/**/index.test.ts', 'test/utils.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['test/vitest-setup.ts'],
  },
});
