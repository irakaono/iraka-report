// 甍AI Engine Boundary 自己テスト（ENGINE_BOUNDARY.md の自動ガード）。
//   「Engine は他 Engine を呼ばない。参照してよいのは Model だけ。」を import レベルで固定。
//   Drain Engine は roofModel（Model）のみ参照可。roofEngine/roofQuantities/roofDrawing（Roof Engine）は禁止。
//   Roof Engine は drain* を一切知らない（片方向）。
import { readFileSync } from 'fs';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const read = (f: string) => { try { return readFileSync(`src/geometry/${f}.ts`, 'utf8'); } catch { return ''; } };
const imports = (src: string, mod: string) => new RegExp(`from ['"]\\./${mod}['"]`).test(src);

// Drain Engine は Roof "Engine" を呼ばない（Model=roofModel のみ許可）
const drainFiles = ['drainModel', 'drainQuantities', 'drainDrawing', 'drainCommands', 'drainValidator'];
const roofEngineMods = ['roofEngine', 'roofQuantities', 'roofDrawing'];
for (const f of drainFiles) {
  const src = read(f);
  for (const m of roofEngineMods) ok(!imports(src, m), `${f}.ts は ${m}（Roof Engine）を import しない`);
}

// Roof Engine 側は drain* を一切知らない（片方向依存）
const roofFiles = ['roofModel', 'roofEngine', 'roofQuantities', 'roofDrawing'];
const drainMods = ['drainModel', 'drainQuantities', 'drainDrawing', 'drainCommands', 'drainValidator'];
for (const f of roofFiles) {
  const src = read(f);
  for (const m of drainMods) ok(!imports(src, m), `${f}.ts は ${m}（Drain）を import しない`);
}

// Model は Engine を知らない（roofModel は roofEngine 等を import しない）
ok(!imports(read('roofModel'), 'roofEngine') && !imports(read('roofModel'), 'roofQuantities'), 'roofModel（Model）は Engine を import しない');

if (fails.length) {
  console.error(`❌ Engine Boundary test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Engine Boundary test: 全 ${pass} 件合格（Engine は他Engineを呼ばない・参照はModelだけ）`);
