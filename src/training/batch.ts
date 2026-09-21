import { getAppellation } from "../data/appellations";
import type { AppState, Batch, Wine } from "../data/types";
import { validateWine } from "../validation/rules";

/**
 * 训练批次层：
 * - drawCandidates 纯函数计算可抽池：核验通过的当前版本 + 未被未完成批次占用
 * - drawBatch 按“三款不同产区”抽取；同一酒款在未完成批次里只出现一次
 * - transition* 为批次状态机守卫，讲师复核后才能归档
 */

export type BatchError =
  | "NOT_ENOUGH_REGIONS"
  | "INVALID_STATUS"
  | "REVIEW_NOTE_REQUIRED";

export class FlowError extends Error {
  constructor(readonly code: BatchError) {
    super(code);
    this.name = "FlowError";
  }
}

/** 可进入训练池：核验无阻断冲突 + 是当前有效版本 */
export function eligibleWines(wines: Wine[]): Wine[] {
  return wines.filter(
    (w) => w.status === "active" && validateWine({ ...w }).length === 0
  );
}

/** 未完成（训练中 / 待复核 / 已复核未归档）批次占用的版本链根 id */
export function occupiedRootIds(state: AppState): Set<string> {
  const idToRoot = new Map(state.wines.map((w) => [w.id, w.rootId]));
  const roots = new Set<string>();
  for (const batch of state.batches) {
    if (batch.status === "archived") continue;
    for (const item of batch.items) {
      roots.add(idToRoot.get(item.wineId) ?? item.wineId);
    }
  }
  return roots;
}

export interface DrawPool {
  pool: Wine[];
  /** 按产区分组，用于判断“三款不同产区”是否可凑齐 */
  byRegion: Map<string, Wine[]>;
  availableRegions: string[];
}

export function buildDrawPool(state: AppState): DrawPool {
  // 占用按版本链（同一酒款）计：修正出新版本也不能在旧批次未完成前再出现
  const occupiedRoots = occupiedRootIds(state);
  const pool = eligibleWines(state.wines).filter((w) => !occupiedRoots.has(w.rootId));
  const byRegion = new Map<string, Wine[]>();
  for (const wine of pool) {
    const region = getAppellation(wine.appellationId)?.region ?? "未知产区";
    const list = byRegion.get(region) ?? [];
    list.push(wine);
    byRegion.set(region, list);
  }
  for (const list of byRegion.values()) {
    list.sort((a, b) => b.createdAt - a.createdAt);
  }
  const availableRegions = [...byRegion.keys()].sort();
  return { pool, byRegion, availableRegions };
}

function defaultRng(): number {
  return Math.random();
}

/**
 * 抽取三款不同产区的酒款。
 * 每个产区至多取一款（池内按录入时间倒序，rng 在同产区多酒款间打散）。
 * 不足 3 个产区抛 NOT_ENOUGH_REGIONS。
 */
export function drawBatch(
  state: AppState,
  rng: () => number = defaultRng
): Wine[] {
  const { byRegion, availableRegions } = buildDrawPool(state);
  if (availableRegions.length < 3) {
    throw new FlowError("NOT_ENOUGH_REGIONS");
  }
  const regions = [...availableRegions];
  // Fisher–Yates 打散产区顺序
  for (let i = regions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [regions[i], regions[j]] = [regions[j], regions[i]];
  }
  const picked: Wine[] = [];
  for (const region of regions.slice(0, 3)) {
    const candidates = byRegion.get(region)!;
    picked.push(candidates[Math.floor(rng() * candidates.length)]);
  }
  return picked;
}

// —— 批次状态机：open → completed → reviewed → archived ——

export function completeBatch(batch: Batch): Batch {
  if (batch.status !== "open") throw new FlowError("INVALID_STATUS");
  return { ...batch, status: "completed", completedAt: Date.now() };
}

export function reviewBatch(batch: Batch, note: string): Batch {
  if (batch.status !== "completed") throw new FlowError("INVALID_STATUS");
  if (!note.trim()) throw new FlowError("REVIEW_NOTE_REQUIRED");
  return { ...batch, status: "reviewed", reviewNote: note.trim(), reviewedAt: Date.now() };
}

export function archiveBatch(batch: Batch): Batch {
  // 讲师复核后才能归档
  if (batch.status !== "reviewed") throw new FlowError("INVALID_STATUS");
  return { ...batch, status: "archived", archivedAt: Date.now() };
}

/** 复核发现问题，讲师重新打开批次组织复训（已抽酒款不重复，占用仍保留） */
export function reopenBatch(batch: Batch): Batch {
  if (batch.status !== "completed") throw new FlowError("INVALID_STATUS");
  return { ...batch, status: "open", completedAt: null };
}
