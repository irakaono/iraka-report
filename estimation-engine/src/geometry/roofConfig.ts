// 甍AI Roof Configuration — 合成可能な契約（sub-Configuration の合成）。
//   Roof Configuration は一枚岩ではない。屋根の仕事（雨樋だけ/棟だけ/カバー/葺き替え/太陽光追加）が
//   独立しているのと同じく、契約も独立した sub-Configuration の合成にする。
//   各 sub は専用 Compiler が RawFacts から独立生成し、buildRoofConfiguration（Builder）が束ねる。
//   ★これは Recognizer↔Geometry の唯一の契約。Geometry/数量/見積の Compiler 群はこの型しか見ない。
//   正の設計：claude/ROOF-CONFIGURATION.md（親：claude/CONFIGURATION_ARCHITECTURE.md）。
//   ★スコープ：甍AI は屋根専門。Roof Configuration は Building Configuration（小泉建設AI）の子。

export type Dir = 'south' | 'east' | 'north' | 'west';
// 屋根の辺の役割（水上納まり＝flashing 雨押え / shed_ridge 片棟 / grip つかみ込み を含む）。
export type ConfigEdgeRole = 'eave' | 'ridge' | 'hip' | 'valley' | 'gable' | 'flashing' | 'shed_ridge' | 'grip';

export interface EdgeConfig { role: ConfigEdgeRole; dir?: Dir; overhang?: number }   // Eave/Ridge/Valley/Flashing Compiler
export interface DrainConfig { eaves?: Dir[] }                                        // Gutter Compiler（雨樋を付ける辺の方位）
export interface MaterialConfig { type?: string }                                     // Roofing Material Compiler
export interface SolarConfig { present?: boolean }                                    // Solar Compiler

// 屋根1面/1系統。各フィールドが sub-Configuration（＝各 sub-Compiler の出力）。
export interface RoofUnit {
  id: string;
  shape?: string;                        // Roof Shape Compiler（片流れ/切妻/寄棟…）
  slope?: number;                        // Roof Slope Compiler（寸）
  edges?: EdgeConfig[];                  // Eave/Ridge/Valley/Flashing Compiler
  drain?: DrainConfig;                   // Gutter Compiler
  material?: MaterialConfig;             // Roofing Material Compiler
  solar?: SolarConfig;                   // Solar Compiler
  detail?: Record<string, unknown>;      // 矩計・納まり（Detail）
}
export interface RoofConfiguration { roofs: RoofUnit[] }

// Roof Configuration Builder：各 sub-Config を積んだ RoofUnit[] を束ねる（合成の唯一の入口）。
export function buildRoofConfiguration(units: RoofUnit[]): RoofConfiguration {
  return { roofs: units };
}
