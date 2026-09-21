import { getAppellation } from "../data/appellations";
import type { Conflict, RuleCode, Wine, WineDraft } from "../data/types";
import { RULE_META } from "../data/types";

export type { Conflict } from "../data/types";

/**
 * 核验规则（数据层与页面层都不自行实现规则，统一走这里）：
 *  R1 必填字段缺失（阻断）
 *  R2 品种不符法定产区（阻断）——非法定品种逐个列冲突
 *  R3 年份早于灌装年份（阻断）
 *  R4 适饮区间倒置（起始年份 > 结束年份，阻断）
 * 存在任一阻断冲突的酒款不得进入训练批次。
 */

export interface ValidationTarget extends WineDraft {
  /** 修正时携带酒款版本 id；录入预检时为 null */
  wineId?: string | null;
}

function conflict(
  partial: Omit<Conflict, "ruleName"> & { rule: RuleCode }
): Conflict {
  return { ...partial, ruleName: RULE_META[partial.rule] };
}

function displayYear(value: number | null): string {
  return value === null || Number.isNaN(value) ? "空" : String(value);
}

/**
 * 纯函数：校验酒款草稿。返回全部阻断冲突；
 * conflicts 为空数组即为通过、可进入训练。
 */
export function validateWine(target: ValidationTarget): Conflict[] {
  const conflicts: Conflict[] = [];
  const id = target.wineId ?? null;
  const name = target.name?.trim() || "（未命名酒款）";

  const required: Array<{ label: string; value: string | number | null }> = [
    { label: "酒款名", value: target.name?.trim() ? target.name.trim() : null },
    { label: "产区", value: target.appellationId || null },
    { label: "年份", value: target.vintage },
    { label: "灌装年份", value: target.bottledYear },
    {
      label: "适饮起始",
      value: target.drinkWindowStart,
    },
    { label: "适饮结束", value: target.drinkWindowEnd },
  ];
  for (const field of required) {
    if (field.value === null || field.value === "" || Number.isNaN(field.value as number)) {
      conflicts.push(
        conflict({
          wineId: id,
          wineName: name,
          field: field.label,
          originalValue: "空",
          rule: "REQUIRED_FIELD_MISSING",
          message: `${field.label}为必填项`,
          blocking: true,
        })
      );
    }
  }
  if (!target.varieties || target.varieties.length === 0) {
    conflicts.push(
      conflict({
        wineId: id,
        wineName: name,
        field: "葡萄品种",
        originalValue: "空",
        rule: "REQUIRED_FIELD_MISSING",
        message: "至少填写一个葡萄品种",
        blocking: true,
      })
    );
  }

  const appellation = target.appellationId
    ? getAppellation(target.appellationId)
    : undefined;
  if (target.appellationId && !appellation) {
    conflicts.push(
      conflict({
        wineId: id,
        wineName: name,
        field: "产区",
        originalValue: target.appellationId,
        rule: "APPELLATION_UNKNOWN",
        message: "产区不在法定产区目录内",
        blocking: true,
      })
    );
  }

  // R2：品种不符法定产区（每个非法品种各列一条，便于讲师定位）
  if (appellation && target.varieties.length > 0) {
    for (const variety of target.varieties) {
      if (!appellation.legalVarieties.includes(variety)) {
        conflicts.push(
          conflict({
            wineId: id,
            wineName: name,
            field: "葡萄品种",
            originalValue: variety,
            rule: "APPELLATION_VARIETY_ILLEGAL",
            message: `「${variety}」不属于${appellation.region}${appellation.name}法定品种（法定：${appellation.legalVarieties.join(
              "、"
            )}）`,
            blocking: true,
          })
        );
      }
    }
  }

  // R3：年份早于灌装年份
  if (
    target.vintage !== null &&
    target.bottledYear !== null &&
    !Number.isNaN(target.vintage) &&
    !Number.isNaN(target.bottledYear) &&
    target.vintage < target.bottledYear
  ) {
    conflicts.push(
      conflict({
        wineId: id,
        wineName: name,
        field: "年份/灌装年份",
        originalValue: `${displayYear(target.vintage)} / ${displayYear(target.bottledYear)}`,
        rule: "VINTAGE_BEFORE_BOTTLING",
        message: `采收年份 ${target.vintage} 早于灌装年份 ${target.bottledYear}，年份不得早于灌装`,
        blocking: true,
      })
    );
  }

  // R4：适饮区间倒置
  if (
    target.drinkWindowStart !== null &&
    target.drinkWindowEnd !== null &&
    !Number.isNaN(target.drinkWindowStart) &&
    !Number.isNaN(target.drinkWindowEnd) &&
    target.drinkWindowStart > target.drinkWindowEnd
  ) {
    conflicts.push(
      conflict({
        wineId: id,
        wineName: name,
        field: "适饮区间",
        originalValue: `${displayYear(target.drinkWindowStart)} ~ ${displayYear(target.drinkWindowEnd)}`,
        rule: "DRINK_WINDOW_INVERTED",
        message: `适饮区间 ${target.drinkWindowStart} ~ ${target.drinkWindowEnd} 倒置，起始年份不得晚于结束年份`,
        blocking: true,
      })
    );
  }

  return conflicts;
}

/** 是否可进入训练（无阻断冲突） */
export function isEligible(conflicts: Conflict[]): boolean {
  return conflicts.filter((c) => c.blocking).length === 0;
}

/** 对一个已落库版本做核验（酒款库“冲突”徽标与冲突看板共用） */
export function validateStoredWine(wine: Wine): Conflict[] {
  return validateWine({ ...wine, wineId: wine.id });
}
