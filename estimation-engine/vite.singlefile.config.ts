import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 単一ファイル版ビルド: JS/CSS を index.html に全部インライン化する。
// 出力 dist-single/index.html を GitHub にそのまま1枚置けば、src/ も Actions も不要で動く。
// base は無関係（外部アセット参照が無いため）。pdfjs は実行時に CDN から読む（従来どおり）。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
});
