/**
 * Knowledge Layer
 * KnowledgeJSONを読み込んで参照可能にする
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const K_BASE = join(__dir, '../../iraka_knowledge');

function load(path) {
  return JSON.parse(readFileSync(join(K_BASE, path), 'utf8'));
}

export const RULES   = load('rules/rules_all.json').rules;
export const DRAIN   = load('makers/panasonic_drainage.json');
export const VENT    = load('makers/iroof_capacity.json');

// RuleID → Ruleオブジェクトのマップ
export const RULE = Object.fromEntries(RULES.map(r => [r.id, r]));

// 降雨強度テーブル
export const RAINFALL = {
  saitama:140, tokyo:140, kanagawa:140, chiba:140,
  tochigi:140, gunma:140, ibaraki:140,
  osaka:120, aichi:120,
  okinawa:160, kochi:160,
  hokkaido:100, yamagata:100, niigata:100
};

// 勾配伸び率テーブル (RULE-100)
export const SLOPE_RATE = {
  1: 1.005, 1.5: 1.011, 2: 1.020, 2.5: 1.031,
  3: 1.044, 3.5: 1.059, 4: 1.077, 4.5: 1.098,
  5: 1.118, 5.5: 1.141, 6: 1.166, 6.5: 1.193,
  7: 1.221, 7.5: 1.250, 8: 1.281, 9: 1.345, 10: 1.414
};

export function getSlopeRate(sun) {
  // 一番近い値を返す
  const keys = Object.keys(SLOPE_RATE).map(Number).sort((a,b)=>a-b);
  const nearest = keys.reduce((prev, curr) =>
    Math.abs(curr - sun) < Math.abs(prev - sun) ? curr : prev
  );
  return SLOPE_RATE[nearest];
}

// 降雨強度 → 許容投影面積
export function getDrainageCapacity(location) {
  const rain = RAINFALL[location] ?? 140;
  const cap  = DRAIN.capacity.find(c => c.rainfall_mmh === rain);
  return { rainfall: rain, capacity_m2: cap?.area_m2 ?? 69 };
}
