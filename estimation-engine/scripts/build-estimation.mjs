// estimation.html 再生成（Source → Build → Artifact の再現ビルド）。
//   vite build（studio 設定）→ dist-studio の css/js を単一HTMLへインライン化し、
//   iraka-report 埋め込み用に <head> へ bridge チェーンを注入して ../estimation.html へ出力。
//   使い方: npm run build:estimation （= vite build --config vite.studio.config.ts && node scripts/build-estimation.mjs）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist-studio';
const idx = readFileSync(join(dist, 'studio.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
const cssFile = assets.find((f) => f.endsWith('.css'));
const jsFile = assets.find((f) => f.endsWith('.js'));
if (!cssFile || !jsFile) throw new Error('dist-studio/assets に css/js が見つかりません。先に vite build を実行してください。');
const css = readFileSync(join(dist, 'assets', cssFile), 'utf8');
const js = readFileSync(join(dist, 'assets', jsFile), 'utf8');

// iraka-report 側の共有スクリプト（bridge チェーン）。estimation.html は repo ルートに置かれる前提。
const bridge =
  '<script src="js/config.js"></script>' +
  '<script src="js/db.js"></script>' +
  '<script src="js/project-api.js"></script>' +
  '<script src="js/estimation-bridge.js"></script>';

// ★置換は必ず「関数形」で行う：置換文字列だと注入する css/js 中の `$`（$&, $1 等）が
//   String.replace に特殊解釈され、ミニファイ JS が壊れる（Unexpected token '<' の原因）。
let out = idx
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/, '')
  .replace(/<script[^>]*type="module"[^>]*src="[^"]*"[^>]*><\/script>/, '');
out = out.replace('<head>', () => '<head>' + bridge);
out = out.replace('</head>', () => '<style>' + css + '</style></head>');
out = out.replace('</body>', () => '<script type="module">' + js + '</script></body>');

const target = join('..', 'estimation.html');
writeFileSync(target, out);
console.log('✅ estimation.html を再生成しました → ' + target + ' (' + out.length + ' bytes)');
