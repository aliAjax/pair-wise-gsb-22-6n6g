import type { Batch, BatchItem, BatchStatus, Wine, WineSnapshot } from "../data/types";

// ============ 校验层：训练批次规则（纯函数） ============

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function snapshotOf(w: Wine): WineSnapshot {
  return {
    name: w.name,
    appellationId: w.appellationId,
    variety: w.variety,
    vintage: w.vintage,
    bottlingYear: w.bottlingYear,
    drinkStart: w.drinkStart,
    drinkEnd: w.drinkEnd,
    notes: w.notes,
  };
}

export const BATCH_SIZE = 3;

export interface DrawResult {
  ok: boolean;
  reason?: string;
  items?: BatchItem[];
}

/**
 * 抽取一批训练题：
 * - 只从入训池（无校验冲突）抽取
 * - 三款必须来自不同产区
 * - 同一酒款在未完成（未归档）批次中只出现一次
 */
export function drawBatch(wines: Wine[], batches: Batch[], trainableIds: Set<string>): DrawResult {
  const occupied = new Set<string>();
  for (const b of batches) {
    if (b.status !== "archived") {
      for (const it of b.items) occupied.add(it.wineId);
    }
  }

  const pool = wines.filter((w) => trainableIds.has(w.id) && !occupied.has(w.id));
  if (pool.length < BATCH_SIZE) {
    return {
      ok: false,
      reason: `可抽取酒款不足：需要 ${BATCH_SIZE} 款当前未占用且通过核验的酒款，当前仅 ${pool.length} 款`,
    };
  }

  // 从不同产区各取一款，直到凑满三款
  const picked: Wine[] = [];
  const usedRegions = new Set<string>();
  for (const w of shuffle(pool)) {
    if (usedRegions.has(w.appellationId)) continue;
    usedRegions.add(w.appellationId);
    picked.push(w);
    if (picked.length === BATCH_SIZE) break;
  }

  if (picked.length < BATCH_SIZE) {
    return {
      ok: false,
      reason: `不同产区数量不足：三款题目须分属三个不同产区，当前仅有 ${picked.length} 个可选产区`,
    };
  }

  return {
    ok: true,
    items: picked.map((w) => ({
      wineId: w.id,
      version: w.currentVersion,
      snapshot: snapshotOf(w),
      done: false,
    })),
  };
}

const FLOW: Record<BatchStatus, "in_training" | "in_review" | "archived" | null> = {
  in_training: "in_review",
  in_review: "archived",
  archived: null,
};

export function nextStatus(status: BatchStatus): BatchStatus | null {
  return FLOW[status];
}

/** 训练 -> 待复核：三款题全部完成才可提交 */
export function canSubmitForReview(batch: Batch): boolean {
  return batch.status === "in_training" && batch.items.length === BATCH_SIZE && batch.items.every((i) => i.done);
}

/** 待复核 -> 归档：讲师复核后才能归档 */
export function canArchive(batch: Batch, reviewer: string): boolean {
  return batch.status === "in_review" && reviewer.trim().length > 0;
}

/** 讲师修正酒款时，给批次中的题目打上“旧题保留、等待新版”标记 */
export function markItemSuperseded(batch: Batch, wineId: string, oldVersion: number): Batch {
  return {
    ...batch,
    items: batch.items.map((it) =>
      it.wineId === wineId && it.version === oldVersion ? { ...it, superseded: true } : it,
    ),
  };
}
