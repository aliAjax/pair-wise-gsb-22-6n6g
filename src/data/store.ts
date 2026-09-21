import { SEED_WINES } from "./seed";
import type {
  AppState,
  Batch,
  BatchItem,
  BatchItemSnapshot,
  BatchStatus,
  Wine,
  WineDraft,
} from "./types";
import { getAppellation } from "./appellations";
import { validateWine, type ValidationTarget } from "../validation/rules";

/**
 * 数据层：唯一的状态持有者。
 * - 浏览器使用 localStorage 持久化（刷新后酒款、批次、版本链一致）
 * - 非浏览器环境回退到内存（核心逻辑测试使用）
 * 所有写操作都走 store，校验结果随写操作返回给调用方，
 * 但 store 不实现任何规则（规则在 validation/ 与 training/ 中）。
 */

const STORAGE_KEY = "blind-tasting-dashboard:v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => void map.set(key, value),
  };
}

function createDefaultStorage(): StorageLike {
  if (typeof localStorage !== "undefined") return localStorage;
  return createMemoryStorage();
}

export function seedState(): AppState {
  return { wines: SEED_WINES.map((w) => ({ ...w })), batches: [] };
}

export function hydrateState(storage: StorageLike): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.wines) && Array.isArray(parsed.batches)) {
        return parsed;
      }
    }
  } catch {
    // 持久化内容损坏时回退到种子数据
  }
  return seedState();
}

/** addWine 结果：酒款是否可进入训练 + 冲突清单 */
export interface AddWineResult {
  wine: Wine;
  eligible: boolean;
  conflicts: ReturnType<typeof validateWine>;
}

export class Store {
  private state: AppState;
  private listeners = new Set<() => void>();

  constructor(private readonly storage: StorageLike = createDefaultStorage()) {
    this.state = hydrateState(storage);
  }

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: AppState): void {
    this.state = next;
    this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
    this.listeners.forEach((l) => l());
  }

  /**
   * 录入酒款。无论是否核验通过都会落库（便于冲突看板追踪修正），
   * 但不合格酒款永远不会被抽批逻辑选中。
   */
  addWine(draft: WineDraft): AddWineResult {
    const conflicts = validateWine({ ...draft, wineId: null });
    const now = Date.now();
    const id = `w${now.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const wine: Wine = {
      ...draft,
      id,
      rootId: id,
      parentId: null,
      version: 1,
      status: "active",
      reason: null,
      supersededById: null,
      createdAt: now,
    };
    this.commit({ ...this.state, wines: [...this.state.wines, wine] });
    return { wine, eligible: conflicts.length === 0, conflicts };
  }

  /**
   * 讲师复核后修正：追加一个新版本，旧版本 superseded 但完整保留（旧题不动）。
   * 新版本仍走同一套核验；修正结果（通过/仍有冲突）返回给调用方。
   */
  correctWine(wineId: string, draft: WineDraft, reason: string): AddWineResult {
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new Error("修正必须填写原因");
    const old = this.state.wines.find((w) => w.id === wineId);
    if (!old) throw new Error("待修正酒款不存在");
    if (old.status !== "active") throw new Error("只能修正当前有效版本");

    const conflicts = validateWine({ ...draft });
    const now = Date.now();
    const newId = `w${now.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const next: Wine = {
      ...draft,
      id: newId,
      rootId: old.rootId,
      parentId: old.id,
      version: old.version + 1,
      status: "active",
      reason: trimmedReason,
      supersededById: null,
      createdAt: now,
    };
    const superseded: Wine = { ...old, status: "superseded", supersededById: newId };
    const wines = this.state.wines.map((w) => (w.id === old.id ? superseded : w));
    // 已经引用旧版本且尚未归档的批次，把修正指针指向新版本
    const batches = this.state.batches.map((b) =>
      b.status === "archived"
        ? b
        : {
            ...b,
            items: b.items.map((item) =>
              item.wineId === old.id
                ? { ...item, correctedToId: newId }
                : item
            ),
          }
    );
    this.commit({ wines: [...wines, next], batches });
    return { wine: next, eligible: conflicts.length === 0, conflicts };
  }

  createBatch(batch: Batch): void {
    this.commit({ ...this.state, batches: [batch, ...this.state.batches] });
  }

  updateBatch(id: string, updater: (b: Batch) => Batch): void {
    this.commit({
      ...this.state,
      batches: this.state.batches.map((b) => (b.id === id ? updater(b) : b)),
    });
  }

  /** 恢复演示数据（清空所有批次与修正链） */
  resetDemo(): void {
    this.commit(seedState());
  }
}

/** 由酒款生成抽批时的不可变快照 */
export function snapshotWine(wine: Wine): BatchItemSnapshot {
  const appellation = getAppellation(wine.appellationId);
  return {
    name: wine.name,
    appellationId: wine.appellationId,
    region: appellation?.region ?? "未知产区",
    varieties: [...wine.varieties],
    vintage: wine.vintage as number,
    bottledYear: wine.bottledYear as number,
    drinkWindowStart: wine.drinkWindowStart as number,
    drinkWindowEnd: wine.drinkWindowEnd as number,
  };
}

/** 版本链：按根版本分组并按版本号排序 */
export function versionChains(wines: Wine[]): Wine[][] {
  const groups = new Map<string, Wine[]>();
  for (const wine of wines) {
    const list = groups.get(wine.rootId) ?? [];
    list.push(wine);
    groups.set(wine.rootId, list);
  }
  return [...groups.values()]
    .map((list) => list.sort((a, b) => a.version - b.version))
    .sort((a, b) => b[0].createdAt - a[0].createdAt);
}

export function activeWines(wines: Wine[]): Wine[] {
  return wines.filter((w) => w.status === "active");
}

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  open: "训练中",
  completed: "待讲师复核",
  reviewed: "已复核待归档",
  archived: "已归档",
};

export function makeBatchItem(wine: Wine): BatchItem {
  return { wineId: wine.id, snapshot: snapshotWine(wine), correctedToId: null };
}
