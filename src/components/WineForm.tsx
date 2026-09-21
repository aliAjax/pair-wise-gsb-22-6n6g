import { useMemo, useState } from "react";
import { APPELLATIONS, getAppellation } from "../data/appellations";
import {
  FIELD_LABELS,
  RULE_LABELS,
  type Wine,
  type WineSnapshot,
} from "../data/types";
import { validateWine } from "../domain/validation";

// ============ 页面层：酒款表单（录入 / 修改待核 / 讲师修正共用） ============

export interface WineFormDraft {
  name: string;
  appellationId: string;
  variety: string;
  vintage: string;
  bottlingYear: string;
  drinkStart: string;
  drinkEnd: string;
  notes: string;
}

export const EMPTY_DRAFT: WineFormDraft = {
  name: "",
  appellationId: "",
  variety: "",
  vintage: "",
  bottlingYear: "",
  drinkStart: "",
  drinkEnd: "",
  notes: "",
};

export function draftFromWine(w: Wine): WineFormDraft {
  return {
    name: w.name,
    appellationId: w.appellationId,
    variety: w.variety,
    vintage: String(w.vintage),
    bottlingYear: String(w.bottlingYear),
    drinkStart: String(w.drinkStart),
    drinkEnd: String(w.drinkEnd),
    notes: w.notes,
  };
}

type FieldErrors = Partial<Record<keyof WineFormDraft, string>>;

function parseYear(value: string): number | null {
  if (!/^\d{4}$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n >= 1900 && n <= 2100 ? n : null;
}

export function parseDraft(draft: WineFormDraft): {
  snapshot: WineSnapshot | null;
  fieldErrors: FieldErrors;
} {
  const fieldErrors: FieldErrors = {};
  if (!draft.name.trim()) fieldErrors.name = "请填写酒款名称";
  if (!draft.appellationId) fieldErrors.appellationId = "请选择法定产区";
  if (!draft.variety.trim()) fieldErrors.variety = "请填写葡萄品种";

  const vintage = parseYear(draft.vintage);
  const bottlingYear = parseYear(draft.bottlingYear);
  const drinkStart = parseYear(draft.drinkStart);
  const drinkEnd = parseYear(draft.drinkEnd);
  if (vintage === null) fieldErrors.vintage = "请填写 1900–2100 的四位年份";
  if (bottlingYear === null) fieldErrors.bottlingYear = "请填写 1900–2100 的四位年份";
  if (drinkStart === null) fieldErrors.drinkStart = "请填写四位年份";
  if (drinkEnd === null) fieldErrors.drinkEnd = "请填写四位年份";

  if (Object.keys(fieldErrors).length) return { snapshot: null, fieldErrors };

  const snapshot: WineSnapshot = {
    name: draft.name.trim(),
    appellationId: draft.appellationId,
    variety: draft.variety.trim(),
    vintage: vintage!,
    bottlingYear: bottlingYear!,
    drinkStart: drinkStart!,
    drinkEnd: drinkEnd!,
    notes: draft.notes.trim(),
  };
  return { snapshot, fieldErrors };
}

interface WineFormProps {
  initialDraft?: WineFormDraft;
  /** 提交按钮文案，随场景变化：录入 / 保存修改 / 提交修正 */
  submitLabel: string;
  onSubmit: (snapshot: WineSnapshot) => void;
  onCancel?: () => void;
  /** 修正场景：必须填写修正原因且校验通过才允许提交 */
  reasonSlot?: React.ReactNode;
  canSubmit?: boolean;
  /** 字段级错误之外的补充阻塞提示（如修正原因未填） */
  hint?: React.ReactNode;
}

export function WineForm({
  initialDraft = EMPTY_DRAFT,
  submitLabel,
  onSubmit,
  onCancel,
  reasonSlot,
  canSubmit,
  hint,
}: WineFormProps) {
  const [draft, setDraft] = useState<WineFormDraft>(initialDraft);
  const set = (k: keyof WineFormDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const appellation = getAppellation(draft.appellationId);

  const { snapshot, fieldErrors } = useMemo(() => parseDraft(draft), [draft]);

  // 实时规则校验（用临时 id，仅用于预览）
  const previewConflicts = useMemo(
    () => (snapshot ? validateWine({ ...snapshot, id: "__preview__" }).conflicts : []),
    [snapshot],
  );

  const blocked = canSubmit === false;
  const formValid = snapshot !== null && !blocked;
  const conflictSet = new Set(previewConflicts.map((c) => c.field));

  const submit = () => {
    if (!formValid || !snapshot) return;
    onSubmit(snapshot);
    if (!onCancel) setDraft(EMPTY_DRAFT);
  };

  const yearField = (
    key: "vintage" | "bottlingYear" | "drinkStart" | "drinkEnd",
    label: string,
  ) => (
    <label className={conflictSet.has(key) ? "field-conflict" : ""}>
      <span>{label}</span>
      <input
        inputMode="numeric"
        placeholder="四位年份"
        value={draft[key]}
        onChange={(e) => set(key, e.target.value)}
      />
      {fieldErrors[key] && <em className="field-error">{fieldErrors[key]}</em>}
    </label>
  );

  return (
    <div className="wine-form">
      <div className="field-grid">
        <label className="span-2">
          <span>{FIELD_LABELS.name}</span>
          <input value={draft.name} placeholder="例如：左岸古堡正牌" onChange={(e) => set("name", e.target.value)} />
          {fieldErrors.name && <em className="field-error">{fieldErrors.name}</em>}
        </label>

        <label>
          <span>{FIELD_LABELS.appellationId}（绑定法定品种）</span>
          <select value={draft.appellationId} onChange={(e) => set("appellationId", e.target.value)}>
            <option value="">请选择产区…</option>
            {APPELLATIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.region} · {a.name}
              </option>
            ))}
          </select>
          {fieldErrors.appellationId && <em className="field-error">{fieldErrors.appellationId}</em>}
        </label>

        <label className={conflictSet.has("variety") ? "field-conflict" : ""}>
          <span>{FIELD_LABELS.variety}</span>
          <input
            value={draft.variety}
            placeholder="选择或输入品种"
            list="legal-variety-list"
            onChange={(e) => set("variety", e.target.value)}
          />
          <datalist id="legal-variety-list">
            {(appellation?.legalVarieties ?? []).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          {fieldErrors.variety && <em className="field-error">{fieldErrors.variety}</em>}
        </label>

        {yearField("vintage", FIELD_LABELS.vintage)}
        {yearField("bottlingYear", FIELD_LABELS.bottlingYear)}
        {yearField("drinkStart", FIELD_LABELS.drinkStart)}
        {yearField("drinkEnd", FIELD_LABELS.drinkEnd)}

        <label className="span-2">
          <span>{FIELD_LABELS.notes}</span>
          <textarea rows={2} value={draft.notes} placeholder="香气关键词、侍酒备注" onChange={(e) => set("notes", e.target.value)} />
        </label>
      </div>

      {appellation && (
        <p className="legal-hint">
          <strong>{appellation.name}</strong> 法定品种：
          {appellation.legalVarieties.map((v) => (
            <button
              type="button"
              key={v}
              className={`chip-tag ${draft.variety === v ? "chip-on" : ""}`}
              onClick={() => set("variety", v)}
            >
              {v}
            </button>
          ))}
        </p>
      )}

      {previewConflicts.length > 0 && (
        <div className="conflict-preview">
          <p className="conflict-title">触发 {previewConflicts.length} 条入训规则，保存后将进入“待核”状态、不进入训练池：</p>
          <ul>
            {previewConflicts.map((c) => (
              <li key={c.rule + c.field}>
                <b>{RULE_LABELS[c.rule]}</b>（{FIELD_LABELS[c.field]}）：{c.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reasonSlot}
      {hint && <p className="form-hint">{hint}</p>}

      <div className="form-actions">
        <button className="primary-action" disabled={!formValid} onClick={submit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            取消
          </button>
        )}
      </div>
    </div>
  );
}
