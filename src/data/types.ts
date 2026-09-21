/**
 * 领域模型：酒款版本链、训练批次、校验冲突。
 * 数据层 / 校验层 / 批次层共用的唯一类型来源。
 */

/** 法定产区（产区 + 该产区法定品种） */
export interface Appellation {
  id: string;
  /** 产区名，用于“三款不同产区”判定 */
  region: string;
  /** 产区子命名（展示用） */
  name: string;
  /** 法定允许品种 */
  legalVarieties: string[];
}

/** 酒款录入草稿（表单年份可能为空） */
export interface WineDraft {
  name: string;
  appellationId: string;
  vintage: number | null;
  /** 灌装年份：年份不得早于灌装 */
  bottledYear: number | null;
  varieties: string[];
  drinkWindowStart: number | null;
  drinkWindowEnd: number | null;
  notes?: string;
}

export type WineStatus = "active" | "superseded";

/** 酒款的一个不可变版本；修正会追加新版本而非覆盖旧版本 */
export interface Wine extends WineDraft {
  id: string;
  /** 版本链根 id：首版等于自身 id */
  rootId: string;
  /** 上一版本 id，首版为 null */
  parentId: string | null;
  version: number;
  status: WineStatus;
  /** 本版本相对上一版的修正原因（首版为录入） */
  reason: string | null;
  supersededById: string | null;
  createdAt: number;
}

export type BatchStatus = "open" | "completed" | "reviewed" | "archived";

/** 抽批时固化的酒款快照，后续修正不影响旧题 */
export interface BatchItemSnapshot {
  name: string;
  appellationId: string;
  region: string;
  varieties: string[];
  vintage: number;
  bottledYear: number;
  drinkWindowStart: number;
  drinkWindowEnd: number;
}

export interface BatchItem {
  wineId: string;
  snapshot: BatchItemSnapshot;
  /** 讲师复核时修正后指向的新版本 id */
  correctedToId: string | null;
}

export interface Batch {
  id: string;
  status: BatchStatus;
  items: BatchItem[];
  reviewNote: string | null;
  createdAt: number;
  completedAt: number | null;
  reviewedAt: number | null;
  archivedAt: number | null;
}

export interface AppState {
  wines: Wine[];
  batches: Batch[];
}

export const RULE_META = {
  REQUIRED_FIELD_MISSING: "必填字段缺失",
  APPELLATION_UNKNOWN: "产区不在法定产区目录",
  APPELLATION_VARIETY_ILLEGAL: "品种不属于法定产区",
  VINTAGE_BEFORE_BOTTLING: "年份早于灌装年份",
  DRINK_WINDOW_INVERTED: "适饮区间倒置",
} as const;

export type RuleCode = keyof typeof RULE_META;

/** 一条核验冲突：酒款 / 字段 / 原值 / 规则 */
export interface Conflict {
  wineId: string | null;
  wineName: string;
  /** 冲突字段（中文名） */
  field: string;
  /** 触发冲突时的原始值 */
  originalValue: string;
  rule: RuleCode;
  ruleName: string;
  message: string;
  /** 阻断性冲突：存在即不得进入训练 */
  blocking: boolean;
}
