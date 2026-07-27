// 甍AI v1.0 アプリ層：入口(DropLanding) ↔ 積算(RoofStudio) の遷移だけを持つ薄い wrapper。
//   ★エンジン/Studio は不変。ここは「図面を保持して Studio に渡す・図面に戻る」だけ。
import { useState } from 'react';
import DropLanding from './DropLanding';
import type { DrawingSet } from './DropLanding';
import RoofStudio from './RoofStudio';

export default function StudioApp() {
  const [phase, setPhase] = useState<'landing' | 'studio'>('landing');
  const [drawings, setDrawings] = useState<DrawingSet>({ planSrc: null, planName: null, elevationSrc: null, elevationName: null });

  if (phase === 'landing') {
    return <DropLanding onStart={(d) => { setDrawings(d); setPhase('studio'); }} />;
  }
  return (
    <RoofStudio
      planSrc={drawings.planSrc}
      elevationSrc={drawings.elevationSrc}
      scaleHint={drawings.scaleHint ?? null}
      elevHint={drawings.elevHint ?? null}
      onBackToDrawings={() => setPhase('landing')}
    />
  );
}
