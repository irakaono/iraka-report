// 甍AI Material Catalog — Knowledge(Intent taxonomy / Product rules) の TS バインディング。
//   canonical は knowledge/material/*.json（人が編集する Knowledge）。ここは型付きで束ねて公開するだけ（転記しない・drift禁止）。
//   materialAdapter.test.ts が JSON ↔ 本モジュールの一致をガードする。
import type { IntentCatalog } from './materialIntent';
import type { ProductCatalog } from './productCatalog';
import type { AssemblyCatalog } from './executionModel';
import type { PriceBook } from './projection';
import type { CostKnowledge } from './costCompiler';
import type { ScheduleKnowledge } from './scheduleCompiler';
import type { QAKnowledge } from './qaCompiler';
import type { CarbonKnowledge } from './carbonCompiler';
import type { ResourceKnowledge } from './resourceCompiler';
import intentJson from '../../knowledge/material/intent.json';
import panasonicJson from '../../knowledge/material/products.panasonic.json';
import assemblyJson from '../../knowledge/material/assembly.json';
import pricesJson from '../../knowledge/material/prices.example.json';
import costJson from '../../knowledge/material/cost.example.json';
import scheduleJson from '../../knowledge/material/schedule.example.json';
import qaJson from '../../knowledge/material/qa.example.json';
import carbonJson from '../../knowledge/material/carbon.example.json';
import resourceJson from '../../knowledge/material/resource.example.json';

// JSON の文字列は素の string 型で入るため、契約型（union の kind 等）へは unknown 経由でキャスト（値は drift テストで担保）。
export const defaultIntentCatalog: IntentCatalog = { id: intentJson.id, specs: intentJson.specs as unknown as IntentCatalog['specs'] };
export const defaultProductCatalog: ProductCatalog = { id: panasonicJson.id, maker: panasonicJson.maker, rules: panasonicJson.rules as unknown as ProductCatalog['rules'] };
export const defaultAssemblyCatalog: AssemblyCatalog = { id: assemblyJson.id, rules: assemblyJson.rules as unknown as AssemblyCatalog['rules'] };
export const examplePriceBook: PriceBook = { unitPrice: pricesJson.unitPrice as Record<string, number> };
export const exampleCostKnowledge: CostKnowledge = {
  prices: examplePriceBook,
  labor: { wagePerLabor: costJson.wagePerLabor, laborPerUnit: costJson.laborPerUnit as unknown as CostKnowledge['labor']['laborPerUnit'] },
  indirectRate: costJson.indirectRate,
};
export const exampleScheduleKnowledge: ScheduleKnowledge = {
  durationPerUnit: scheduleJson.durationPerUnit as unknown as ScheduleKnowledge['durationPerUnit'],
  precedence: scheduleJson.precedence as unknown as ScheduleKnowledge['precedence'],
};
export const exampleQAProgram: QAKnowledge = { rules: qaJson.rules as unknown as QAKnowledge['rules'] };
export const exampleCarbonProgram: CarbonKnowledge = {
  co2PerUnit: carbonJson.co2PerUnit as Record<string, number>,
  transportRate: carbonJson.transportRate,
  constructionCO2PerUnit: carbonJson.constructionCO2PerUnit as unknown as CarbonKnowledge['constructionCO2PerUnit'],
};
export const exampleResourceProgram: ResourceKnowledge = {
  tradeOfKind: resourceJson.tradeOfKind as unknown as ResourceKnowledge['tradeOfKind'],
  laborPerUnit: resourceJson.laborPerUnit as unknown as ResourceKnowledge['laborPerUnit'],
  crewSize: resourceJson.crewSize as Record<string, number>,
  equipmentOfKind: resourceJson.equipmentOfKind as unknown as ResourceKnowledge['equipmentOfKind'],
};
