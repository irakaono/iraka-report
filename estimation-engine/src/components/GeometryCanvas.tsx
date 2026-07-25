// Konva キャンバス（e0.3 UX）: 背景 + Polygon編集 + スナップ + ズーム/パン + 縮尺較正 + 自動閉じ
// 座標は world（vertices と同じ空間）。stage.scale/position で拡大縮小・パン。
import { Stage, Layer, Line, Circle, Rect, Text } from 'react-konva';
import { Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type { Measurement, Vertex } from '../geometry/types';
import { snap } from '../geometry/snap';

interface Props {
  width: number;
  height: number;
  background: HTMLImageElement | null;
  gridStep: number; // = scale(px/m)
  zoom: number;
  stagePos: { x: number; y: number };
  spaceHeld: boolean;
  snapOn: boolean;
  draft: Vertex[];
  drawing: boolean;
  areaM2: number;
  selectedVertex: number | null;
  measurements: Measurement[];
  selectedId: string | null;
  calibrating: boolean;
  calibPts: Vertex[];
  onAddVertex: (p: Vertex) => void;
  onMoveVertex: (i: number, p: Vertex) => void;
  onVertexDragStart: () => void;
  onSelectVertex: (i: number | null) => void;
  onSelectMeasurement?: (id: string) => void; // 保存済み図形をクリックで選択（削除・編集への入口）
  onFinish: () => void;
  onZoomPan: (zoom: number, pos: { x: number; y: number }) => void;
  onCalibClick: (p: Vertex) => void;
}

const flat = (vs: Vertex[]): number[] => vs.reduce<number[]>((a, [x, y]) => (a.push(x, y), a), []);
const worldPointer = (stage: Konva.Stage | null): Vertex | null => {
  const p = stage?.getRelativePointerPosition();
  return p ? [p.x, p.y] : null;
};

export default function GeometryCanvas(props: Props) {
  const {
    width, height, background, gridStep, zoom, stagePos, spaceHeld, snapOn,
    draft, drawing, areaM2, selectedVertex, measurements, selectedId,
    calibrating, calibPts,
    onAddVertex, onMoveVertex, onVertexDragStart, onSelectVertex, onSelectMeasurement, onFinish, onZoomPan, onCalibClick,
  } = props;

  const z = zoom || 1;
  const thr = 12 / z; // world 単位のスナップ/自動閉じしきい値（画面上 ~12px）
  const otherVerts = measurements.flatMap((m) => m.vertices);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const worldBefore = { x: (pointer.x - stagePos.x) / z, y: (pointer.y - stagePos.y) / z };
    const factor = 1.08;
    const next = e.evt.deltaY > 0 ? z / factor : z * factor;
    const newScale = Math.min(20, Math.max(0.1, next));
    onZoomPan(newScale, {
      x: pointer.x - worldBefore.x * newScale,
      y: pointer.y - worldBefore.y * newScale,
    });
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (spaceHeld) return;          // Space+ドラッグ=パン
    if (e.evt.button !== 0) return; // 左のみ
    const stage = e.target.getStage();
    const w = worldPointer(stage);
    if (!w) return;

    if (calibrating) { onCalibClick(w); return; }
    if (!drawing) return;
    if (e.target.getClassName() === 'Circle') return; // 頂点操作は別

    // 自動閉じ: 最初の頂点に近づいたら確定
    if (draft.length >= 3) {
      const f = draft[0];
      if (Math.hypot(f[0] - w[0], f[1] - w[1]) < thr) { onFinish(); return; }
    }

    const p = snapOn
      ? snap(w, { targets: [...otherVerts, ...draft], prev: draft[draft.length - 1], ortho: e.evt.shiftKey, threshold: 10 / z })
      : w;
    onAddVertex(p);
  };

  const handleContextMenu = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    if (drawing && draft.length >= 3) onFinish();
  };

  const handleStageDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Stage 自体のドラッグ（パン）のみ反映
    if (e.target === e.target.getStage()) {
      onZoomPan(z, { x: e.target.x(), y: e.target.y() });
    }
  };

  const centroid = (vs: Vertex[]): Vertex => {
    const s = vs.reduce((a, [x, y]) => [a[0] + x, a[1] + y] as Vertex, [0, 0] as Vertex);
    return [s[0] / vs.length, s[1] / vs.length];
  };

  return (
    <div className="canvas-box">
      <Stage
        width={width}
        height={height}
        scaleX={z}
        scaleY={z}
        x={stagePos.x}
        y={stagePos.y}
        draggable={spaceHeld}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onDragEnd={handleStageDragEnd}
        style={{ cursor: spaceHeld ? 'grab' : calibrating ? 'crosshair' : drawing ? 'crosshair' : 'default' }}
      >
        <Layer>
          {background ? (
            <KonvaImage image={background} x={0} y={0} />
          ) : (
            <>
              <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
              {gridLines(width, height, gridStep, z)}
            </>
          )}

          {/* 保存済み Measurement */}
          {measurements.map((m) => {
            const sel = m.measurementId === selectedId;
            return (
              <Line
                key={m.measurementId}
                points={flat(m.vertices)}
                closed
                stroke={sel ? '#e8590c' : '#1f4e79'}
                strokeWidth={(sel ? 3 : 2) / z}
                fill={sel ? 'rgba(232,89,12,0.16)' : 'rgba(31,78,121,0.08)'}
                // 描画中でなければ、図形クリックで選択（→プロパティで削除/編集）
                onMouseDown={(e) => { if (drawing || !onSelectMeasurement) return; e.cancelBubble = true; onSelectMeasurement(m.measurementId); }}
                onTap={(e) => { if (drawing || !onSelectMeasurement) return; e.cancelBubble = true; onSelectMeasurement(m.measurementId); }}
              />
            );
          })}

          {/* 描画中 Polygon */}
          {draft.length > 0 && (
            <Line
              points={flat(draft)}
              closed={!drawing}
              stroke="#2e74b5"
              strokeWidth={2 / z}
              dash={drawing ? [6 / z, 4 / z] : undefined}
              fill={drawing ? undefined : 'rgba(46,116,181,0.12)'}
            />
          )}

          {/* 面積ラベル（重心付近・counter-scale で読みやすく） */}
          {draft.length >= 3 && (() => {
            const c = centroid(draft);
            return (
              <Text
                x={c[0]}
                y={c[1]}
                text={`${areaM2.toFixed(2)} ㎡`}
                fontSize={14 / z}
                fontStyle="bold"
                fill="#1f4e79"
                offsetX={20 / z}
                offsetY={8 / z}
              />
            );
          })()}

          {/* 描画中の頂点（ドラッグ可・画面上サイズ一定） */}
          {draft.map((p, i) => (
            <Circle
              key={i}
              x={p[0]}
              y={p[1]}
              radius={7 / z}
              hitStrokeWidth={16 / z}
              fill={i === selectedVertex ? '#e8590c' : '#2e74b5'}
              stroke="#ffffff"
              strokeWidth={2 / z}
              draggable
              onDragStart={() => onVertexDragStart()}
              onDragMove={(e) => {
                const node = e.target;
                let np: Vertex = [node.x(), node.y()];
                if (snapOn) {
                  const targets = [...otherVerts, ...draft.filter((_, j) => j !== i)];
                  np = snap(np, { targets, prev: draft[(i - 1 + draft.length) % draft.length], ortho: e.evt.shiftKey, threshold: 10 / z });
                  node.position({ x: np[0], y: np[1] });
                }
                onMoveVertex(i, np);
              }}
              onMouseDown={(e) => { e.cancelBubble = true; onSelectVertex(i); }}
              onClick={(e) => { e.cancelBubble = true; onSelectVertex(i); }}
            />
          ))}

          {/* 縮尺較正の2点と線 */}
          {calibrating && calibPts.length > 0 && (
            <>
              {calibPts.length === 2 && (
                <Line points={flat(calibPts)} stroke="#e8590c" strokeWidth={2 / z} dash={[6 / z, 4 / z]} />
              )}
              {calibPts.map((p, i) => (
                <Circle key={'c' + i} x={p[0]} y={p[1]} radius={6 / z} fill="#e8590c" stroke="#fff" strokeWidth={2 / z} />
              ))}
            </>
          )}
        </Layer>
      </Stage>
    </div>
  );
}

function gridLines(w: number, h: number, step: number, z: number) {
  const items = [];
  const s = Math.max(10, step);
  const sw = 1 / z;
  for (let x = 0; x <= w; x += s) {
    items.push(<Line key={'gx' + x} points={[x, 0, x, h]} stroke="#eef2f6" strokeWidth={sw} />);
  }
  for (let y = 0; y <= h; y += s) {
    items.push(<Line key={'gy' + y} points={[0, y, w, y]} stroke="#eef2f6" strokeWidth={sw} />);
  }
  return items;
}
