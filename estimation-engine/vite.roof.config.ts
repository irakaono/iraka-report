import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
// Roof Studio 単一ファイルビルド（検証用）。出力 dist-roof/roof.html。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: { outDir: 'dist-roof', assetsInlineLimit: 100000000, cssCodeSplit: false, reportCompressedSize: false, rollupOptions: { input: 'roof.html' } },
});
