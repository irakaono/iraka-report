// 甍AI Drain Commands / Reducer — 「UI は Model を書き換えない。Command を発行するだけ」。
//   Human/AI/Import が同じ Command を通す。reducer は純関数。Undo/Redo は history.ts。
//   排水経路は Node/Edge Graph を編集する（Polyline は Studio の表示・編集形）。
import type { DrainModel, GutterRun, GutterDrop, DrainNode, DrainEdge } from './drainModel';

export type DrainCommand =
  // 軒樋
  | { type: 'AddRun'; run: GutterRun }
  | { type: 'DeleteRun'; runId: string }
  | { type: 'AddDrop'; runId: string; drop: GutterDrop }
  | { type: 'MoveDrop'; dropId: string; position: number }
  | { type: 'DeleteDrop'; dropId: string }
  // 排水経路 Graph
  | { type: 'AddNode'; node: DrainNode }
  | { type: 'DeleteNode'; nodeId: string }        // 付随する Edge も削除（DanglingSegment を作らない）
  | { type: 'AddEdge'; edge: DrainEdge }
  | { type: 'DeleteEdge'; edgeId: string };

const mapRuns = (m: DrainModel, fn: (r: GutterRun) => GutterRun): DrainModel => ({ ...m, runs: m.runs.map(fn) });

export function drainReducer(model: DrainModel, cmd: DrainCommand): DrainModel {
  switch (cmd.type) {
    case 'AddRun':
      if (model.runs.some((r) => r.id === cmd.run.id)) return model;
      return { ...model, runs: [...model.runs, cmd.run] };
    case 'DeleteRun':
      if (!model.runs.some((r) => r.id === cmd.runId)) return model;
      return { ...model, runs: model.runs.filter((r) => r.id !== cmd.runId) };
    case 'AddDrop':
      if (!model.runs.some((r) => r.id === cmd.runId)) return model;
      return mapRuns(model, (r) => (r.id === cmd.runId ? { ...r, drops: [...r.drops, cmd.drop] } : r));
    case 'MoveDrop':
      if (!model.runs.some((r) => r.drops.some((d) => d.id === cmd.dropId))) return model;
      return mapRuns(model, (r) => ({ ...r, drops: r.drops.map((d) => (d.id === cmd.dropId ? { ...d, position: cmd.position } : d)) }));
    case 'DeleteDrop':
      if (!model.runs.some((r) => r.drops.some((d) => d.id === cmd.dropId))) return model;
      return mapRuns(model, (r) => ({ ...r, drops: r.drops.filter((d) => d.id !== cmd.dropId) }));
    case 'AddNode':
      if (model.graph.nodes.some((n) => n.id === cmd.node.id)) return model;
      return { ...model, graph: { ...model.graph, nodes: [...model.graph.nodes, cmd.node] } };
    case 'DeleteNode': {
      if (!model.graph.nodes.some((n) => n.id === cmd.nodeId)) return model;
      return { ...model, graph: {
        nodes: model.graph.nodes.filter((n) => n.id !== cmd.nodeId),
        edges: model.graph.edges.filter((e) => e.from !== cmd.nodeId && e.to !== cmd.nodeId), // 付随Edgeも除去
      } };
    }
    case 'AddEdge':
      if (model.graph.edges.some((e) => e.id === cmd.edge.id)) return model;
      return { ...model, graph: { ...model.graph, edges: [...model.graph.edges, cmd.edge] } };
    case 'DeleteEdge':
      if (!model.graph.edges.some((e) => e.id === cmd.edgeId)) return model;
      return { ...model, graph: { ...model.graph, edges: model.graph.edges.filter((e) => e.id !== cmd.edgeId) } };
    default:
      return model;
  }
}
