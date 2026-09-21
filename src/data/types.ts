// ============ 数据层：核心类型 ============

/** 可被校验/修正的酒款字段 */
export type WineField =
  | "name"
  | "appellationId"
  | "variety"
  | "vintage"
  | "bottlingYear"
  | "drinkStart"
  | "drinkEnd"
  | "notes";

/** 法定产区目录条目 */
export interface Appellation {
  id: string;
  region: string;
  name: string;
  /** 该法定产区允许的法定品种 */
  legalVarieties: string[];
}

/** 酒款某一版本的完整快照（版本链中的一环） */
export interface WineVersion {
  version: number;
  /** 生成该版本的原因；首版为“录入”，其余为讲师修正时填写的原因 */
  reason: string;
  createdAt: string;
  snapshot: WineSnapshot;
}

/** 酒款字段快照，也用于批次抽中的题目副本 */
export interface WineSnapshot {
  name: string;
  appellationId: string;
  variety: string;
  vintage: number;
  bottlingYear: number;
  drinkStart: number;
  drinkEnd: number;
  notes: string;
}

/** 酒款资料（当前版本 + 版本链） */
export interface Wine extends WineSnapshot {
  id: string;
  currentVersion: number;
  versions: WineVersion[];
  createdAt: string;
  updatedAt: string;
}

/** 校验规则编码 */
export type RuleCode =
  | "VARIETY_NOT_LEGAL"
  | "VINTAGE_BEFORE_BOTTLING"
  | "DRINK_WINDOW_INVERTED";

export const RULE_LABELS: Record<RuleCode, string> = {
  VARIETY_NOT_LEGAL: "品种不符法定产区",
  VINTAGE_BEFORE_BOTTLING: "年份早于灌装",
  DRINK_WINDOW_INVERTED: "适饮区间倒置",
};

/** 一条字段级冲突：酒款 / 字段 / 原值 / 规则 */
export interface FieldConflict {
  wineId: string;
  wineName: string;
  field: WineField;
  /** 触发规则时的原始值（用于事后追溯，修正不抹除） */
  originalValue: string;
  rule: RuleCode;
  detail: string;
}

/** 校验结果 */
export interface ValidationResult {
  ok: boolean;
  conflicts: FieldConflict[];
}

/** 批次中的一道题：酒款快照副本 + 学员作答状态 */
export interface BatchItem {
  wineId: string;
  version: number;
  snapshot: WineSnapshot;
  /** 学员是否已完成该题（三款全部完成后批次才可提交复核） */
  done: boolean;
  /** 讲师复核时已就该题生成新版本，旧题仍保留展示 */
  superseded?: boolean;
}

export type BatchStatus = "in_training" | "in_review" | "archived";

/** 训练批次 */
export interface Batch {
  id: string;
  createdAt: string;
  status: BatchStatus;
  items: BatchItem[];
  /** 归档时复核该批次的讲师 */
  reviewer?: string;
  archivedAt?: string;
  /** 复核期间对酒款发起的修正记录 */
  corrections: BatchCorrection[];
}

/** 批次复核中发起的一次酒款修正 */
export interface BatchCorrection {
  wineId: string;
  fromVersion: number;
  toVersion: number;
  reason: string;
  createdAt: string;
}

/** 持久化根结构 */
export interface CellarState {
  wines: Wine[];
  batches: Batch[];
}

export const FIELD_LABELS: Record<WineField, string> = {
  name: "酒款名称",
  appellationId: "产区",
  variety: "葡萄品种",
  vintage: "年份",
  bottlingYear: "灌装年份",
  drinkStart: "适饮起始",
  drinkEnd: "适饮截止",
  notes: "香气/备注",
};
