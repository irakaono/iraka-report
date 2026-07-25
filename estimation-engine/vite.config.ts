import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 配信のため base をリポジトリ名に合わせる。
// 例: https://<user>.github.io/iraka-estimation-os/
// ローカル開発(npm run dev)でも問題なく動作する。
export default defineConfig({
  plugins: [react()],
  base: '/iraka-estimation-os/',
});
