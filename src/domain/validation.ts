import { getAppellation, isLegalVariety } from "../data/appellations";
import {
  FIELD_LABELS,
  RULE_LABELS,
  type FieldConflict,
  type ValidationResult,
  type Wine,
  type WineField,
  type WineSnapshot,
} from "../data/types";

// ============ 校验层：酒款资料规则（纯函数） ============
// 三条入训规则：
//   1. 品种必须在所选法定产区的法定品种表内
//   2. 年份不得早于灌装年份
//   3. 适饮区间起始不得晚于截止

type ConflictInput = WineSnapshot & { id: string };

function valueOf(input: ConflictInput, field: WineField): string {
  const v = input[field];
  return v === undefined ? "" : String(v);
}

export function validateWine(input: ConflictInput): ValidationResult {
  const conflicts: FieldConflict[] = [];
  const appellation = getAppellation(input.appellationId);

  // 规则 1：品种不符法定产区
  if (appellation && !isLegalVariety(input.appellationId, input.variety)) {
    conflicts.push({
      wineId: input.id,
      wineName: input.name || "未命名酒款",
      field: "variety",
      originalValue: input.variety.trim(),
      rule: "VARIETY_NOT_LEGAL",
      detail: `“${appellation.name}”法定品种为 ${appellation.legalVarieties.join(
      "、",
    )}，不含“${input.variety.trim()}”`,
    });
  }

  // 规则 2：年份早于灌装
  if (
    Number.isFinite(input.vintage) &&
    Number.isFinite(input.bottlingYear) &&
    input.vintage < input.bottlingYear
  ) {
    conflicts.push({
      wineId: input.id,
      wineName: input.name || "未命名酒款",
      field: "vintage",
      originalValue: `${input.vintage} / 灌装 ${input.bottlingYear}`,
      rule: "VINTAGE_BEFORE_BOTTLING",
      detail: `年份 ${input.vintage} 早于灌装年份 ${input.bottlingYear}`,
    });
  }

  // 规则 3：适饮区间倒置
  if (
    Number.isFinite(input.drinkStart) &&
    Number.isFinite(input.drinkEnd) &&
    input.drinkStart > input.drinkEnd
  ) {
    conflicts.push({
      wineId: input.id,
      wineName: input.name || "未命名酒款",
      field: "drinkStart",
      originalValue: `${input.drinkStart} ~ ${input.drinkEnd}`,
      rule: "DRINK_WINDOW_INVERTED",
      detail: `适饮起始 ${input.drinkStart} 晚于适饮截止 ${input.drinkEnd}`,
    });
  }

  return { ok: conflicts.length === 0, conflicts };
}

/** 按酒款分组的实时冲突索引，供酒款列表、冲突清单、训练抽取共用 */
export function conflictsByWine(wines: Wine[]): Map<string, FieldConflict[]> {
  const map = new Map<string, FieldConflict[]>();
  for (const w of wines) {
    const r = validateWine({ ...w, id: w.id });
    if (r.conflicts.length) map.set(w.id, r.conflicts);
  }
  return map;
}

export function allConflicts(wines: Wine[]): FieldConflict[] {
  return wines.flatMap((w) => validateWine({ ...w, id: w.id }).conflicts);
}

/** 存在任何冲突的酒款不得进入训练池 */
export function isTrainable(wine: Wine): boolean {
  return validateWine({ ...wine, id: wine.id }).ok;
}

export function describeConflict(c: FieldConflict): string {
  return `${RULE_LABELS[c.rule]}｜${FIELD_LABELS[c.field]}原值：${c.originalValue || "（空）"}｜${c.detail}`;
}
