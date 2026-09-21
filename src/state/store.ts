import type {
  Batch,
  CellarState,
  Wine,
  WineSnapshot,
} from "../data/types";
import { createSeedState } from "../data/seed";
import { validateWine } from "../domain/validation";
import { BATCH_SIZE, canArchive, canSubmitForReview, nextStatus } from "../domain/batches";

// ============ 状态层：闭环状态机 + 版本链 + 持久化 ============

const STORAGE_KEY = "hxwl-08-cellar-v1";

export type CellarAction =
  | { type: "ADD_WINE"; draft: WineSnapshot }
  | { type: "UPDATE_WINE"; id: string; draft: WineSnapshot }
  | { type: "DRAW_BATCH"; items: Batch["items"] }
  | { type: "TOGGLE_ITEM_DONE"; batchId: string; wineId: string }
  | { type: "SUBMIT_REVIEW"; batchId: string }
  | {
      type: "CORRECT_WINE";
      batchId: string;
      wineId: string;
      draft: WineSnapshot;
      reason: string;
    }
  | { type: "ARCHIVE_BATCH"; batchId: string; reviewer: string }
  | { type: "RESET_DEMO" };

export function loadState(): CellarState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw) as CellarState;
    if (!Array.isArray(parsed.wines) || !Array.isArray(parsed.batches)) {
      return createSeedState();
    }
    return parsed;
  } catch {
    return createSeedState();
  }
}

export function saveState(state: CellarState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式或配额不足时静默降级为内存态
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function nextWineId(wines: Wine[]): string {
  const max = wines.reduce((m, w) => {
    const n = Number(w.id.replace(/^W-/, ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `W-${String(max + 1).padStart(3, "0")}`;
}

function nextBatchId(batches: Batch[]): string {
  const max = batches.reduce((m, b) => {
    const n = Number(b.id.replace(/^B-/, ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 1000);
  return `B-${max + 1}`;
}

function newWine(id: string, draft: WineSnapshot, now: string): Wine {
  return {
    ...draft,
    id,
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
    versions: [{ version: 1, reason: "录入", createdAt: now, snapshot: { ...draft } }],
  };
}

/** 讲师修正：生成带原因的新版本并保留旧版本（旧题快照留在批次中） */
function applyCorrection(wine: Wine, draft: WineSnapshot, reason: string, now: string): Wine {
  const version = wine.currentVersion + 1;
  return {
    ...wine,
    ...draft,
    currentVersion: version,
    updatedAt: now,
    versions: [
      ...wine.versions,
      { version, reason, createdAt: now, snapshot: { ...draft } },
    ],
  };
}

export function cellarReducer(state: CellarState, action: CellarAction): CellarState {
  const now = new Date().toISOString();

  switch (action.type) {
    case "ADD_WINE": {
      const wine = newWine(nextWineId(state.wines), action.draft, now);
      return { ...state, wines: [...state.wines, wine] };
    }

    case "UPDATE_WINE": {
      // 仅允许修正从未进入批次的冲突资料，直接覆盖当前字段、不另开版本
      const referenced = state.batches.some((b) => b.items.some((it) => it.wineId === action.id));
      if (referenced) return state;
      return {
        ...state,
        wines: state.wines.map((w) =>
          w.id === action.id ? { ...w, ...action.draft, updatedAt: now } : w,
        ),
      };
    }

    case "DRAW_BATCH": {
      if (action.items.length !== BATCH_SIZE) return state;
      const batch: Batch = {
        id: nextBatchId(state.batches),
        createdAt: now,
        status: "in_training",
        items: action.items,
        corrections: [],
      };
      return { ...state, batches: [batch, ...state.batches] };
    }

    case "TOGGLE_ITEM_DONE": {
      return {
        ...state,
        batches: state.batches.map((b) => {
          if (b.id !== action.batchId || b.status !== "in_training") return b;
          return {
            ...b,
            items: b.items.map((it) =>
              it.wineId === action.wineId ? { ...it, done: !it.done } : it,
            ),
          };
        }),
      };
    }

    case "SUBMIT_REVIEW": {
      return {
        ...state,
        batches: state.batches.map((b) => {
          if (b.id !== action.batchId || !canSubmitForReview(b)) return b;
          return { ...b, status: nextStatus(b.status) ?? b.status };
        }),
      };
    }

    case "CORRECT_WINE": {
      const batch = state.batches.find((b) => b.id === action.batchId);
      if (!batch || batch.status !== "in_review") return state;
      const wine = state.wines.find((w) => w.id === action.wineId);
      if (!wine || !action.reason.trim()) return state;
      // 修正后的资料仍须通过核验，否则不产生新版本
      if (!validateWine({ ...action.draft, id: wine.id }).ok) return state;

      const fromVersion = wine.currentVersion;
      const updated = applyCorrection(wine, action.draft, action.reason.trim(), now);
      return {
        ...state,
        wines: state.wines.map((w) => (w.id === wine.id ? updated : w)),
        batches: state.batches.map((b) =>
          b.id === batch.id
            ? {
                ...b,
                items: b.items.map((it) =>
                  it.wineId === wine.id && it.version === fromVersion
                    ? { ...it, superseded: true }
                    : it,
                ),
                corrections: [
                  ...b.corrections,
                  {
                    wineId: wine.id,
                    fromVersion,
                    toVersion: updated.currentVersion,
                    reason: action.reason.trim(),
                    createdAt: now,
                  },
                ],
              }
            : b,
        ),
      };
    }

    case "ARCHIVE_BATCH": {
      return {
        ...state,
        batches: state.batches.map((b) => {
          if (b.id !== action.batchId || !canArchive(b, action.reviewer)) return b;
          return {
            ...b,
            status: "archived",
            reviewer: action.reviewer.trim(),
            archivedAt: now,
          };
        }),
      };
    }

    case "RESET_DEMO": {
      clearPersisted();
      return createSeedState();
    }

    default:
      return state;
  }
}
