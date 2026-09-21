import { useMemo, useState } from "react";
import type { Wine, WineDraft } from "../data/types";
import { APPELLATIONS, getAppellation } from "../data/appellations";
import { validateWine, type Conflict } from "../validation/rules";
import { store } from "./useStore";

const EMPTY_DRAFT: WineDraft = {
  name: "",
  appellationId: APPELLATIONS[0].id,
  vintage: null,
  bottledYear: null,
  varieties: [],
  drinkWindowStart: null,
  drinkWindowEnd: null,
  notes: "",
};

function draftFromWine(wine: Wine): WineDraft {
  return {
    name: wine.name,
    appellationId: wine.appellationId,
    vintage: wine.vintage,
    bottledYear: wine.bottledYear,
    varieties: [...wine.varieties],
    drinkWindowStart: wine.drinkWindowStart,
    drinkWindowEnd: wine.drinkWindowEnd,
    notes: wine.notes ?? "",
  };
}

export interface CorrectionRequest {
  wine: Wine;
}

export function WineForm({
  correction,
  onFinish,
  notify,
}: {
  correction: CorrectionRequest | null;
  onFinish: () => void;
  notify: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [draft, setDraft] = useState<WineDraft>(
    correction ? draftFromWine(correction.wine) : EMPTY_DRAFT
  );
  const [reason, setReason] = useState("");
  const [customVariety, setCustomVariety] = useState("");

  const appellation = getAppellation(draft.appellationId);
  const liveConflicts: Conflict[] = useMemo(
    () => validateWine({ ...draft }),
    [draft]
  );
  const blockingCount = liveConflicts.length;

  function patch(partial: Partial<WineDraft>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  function changeAppellation(id: string) {
    // 切换产区后保留品种，但由核验层判定是否仍合法
    setDraft((d) => ({ ...d, appellationId: id }));
  }

  function toggleVariety(variety: string) {
    setDraft((d) => ({
      ...d,
      varieties: d.varieties.includes(variety)
        ? d.varieties.filter((v) => v !== variety)
        : [...d.varieties, variety],
    }));
  }

  function addCustomVariety() {
    const v = customVariety.trim();
    if (v && !draft.varieties.includes(v)) {
      patch({ varieties: [...draft.varieties, v] });
    }
    setCustomVariety("");
  }

  function reset() {
    setDraft(EMPTY_DRAFT);
    setReason("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (correction) {
      if (!reason.trim()) {
        notify("修正必须填写原因后才能提交", "err");
        return;
      }
      const result = store.correctWine(correction.wine.id, draft, reason);
      if (result.eligible) {
        notify(`已生成 v${result.wine.version} 并通过核验，旧版本保留`, "ok");
      } else {
        notify(`已生成 v${result.wine.version}，但仍有 ${result.conflicts.length} 条冲突，不能进入训练`, "err");
      }
      setReason("");
      onFinish();
      return;
    }
    const result = store.addWine(draft);
    if (result.eligible) {
      notify(`酒款「${result.wine.name}」核验通过，可进入训练`, "ok");
      reset();
    } else {
      notify(`酒款已保存，但存在 ${result.conflicts.length} 条阻断冲突，不得进入训练`, "err");
      reset();
    }
  }

  return (
    <section className="panel form-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{correction ? "讲师复核修正" : "酒款录入"}</p>
          <h2>{correction ? `修正：${correction.wine.name}（v${correction.wine.version}）` : "录入酒款"}</h2>
        </div>
        {correction && (
          <button type="button" className="ghost-action" onClick={onFinish}>
            取消修正
          </button>
        )}
      </div>

      <form onSubmit={submit} className="wine-form">
        <label className="full">
          <span>酒款名 *</span>
          <input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="例如：波雅克正牌风格"
          />
        </label>

        <label>
          <span>法定产区 *</span>
          <select value={draft.appellationId} onChange={(e) => changeAppellation(e.target.value)}>
            {APPELLATIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.region} · {a.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>葡萄品种 *</span>
          <div className="variety-box">
            <div className="variety-chips">
              {appellation?.legalVarieties.map((v) => {
                const active = draft.varieties.includes(v);
                return (
                  <button
                    type="button"
                    key={v}
                    className={`chip-toggle ${active ? "on" : ""}`}
                    onClick={() => toggleVariety(v)}
                  >
                    {v}
                  </button>
                );
              })}
              {draft.varieties
                .filter((v) => !appellation?.legalVarieties.includes(v))
                .map((v) => (
                  <button
                    type="button"
                    key={v}
                    className="chip-toggle on illegal"
                    title="非法定品种：核验将阻断"
                    onClick={() => toggleVariety(v)}
                  >
                    {v} ✕
                  </button>
                ))}
            </div>
            <div className="variety-add">
              <input
                value={customVariety}
                placeholder="手动添加品种（非法品种会触发核验）"
                onChange={(e) => setCustomVariety(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomVariety();
                  }
                }}
              />
              <button type="button" onClick={addCustomVariety}>
                添加
              </button>
            </div>
          </div>
        </label>

        <label>
          <span>采收年份 *</span>
          <input
            type="number"
            value={draft.vintage ?? ""}
            onChange={(e) =>
              patch({ vintage: e.target.value === "" ? null : Number(e.target.value) })
            }
            placeholder="2018"
          />
        </label>
        <label>
          <span>灌装年份 *</span>
          <input
            type="number"
            value={draft.bottledYear ?? ""}
            onChange={(e) =>
              patch({ bottledYear: e.target.value === "" ? null : Number(e.target.value) })
            }
            placeholder="不得晚于采收年份"
          />
        </label>
        <label>
          <span>适饮起始年 *</span>
          <input
            type="number"
            value={draft.drinkWindowStart ?? ""}
            onChange={(e) =>
              patch({
                drinkWindowStart: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="2024"
          />
        </label>
        <label>
          <span>适饮结束年 *</span>
          <input
            type="number"
            value={draft.drinkWindowEnd ?? ""}
            onChange={(e) =>
              patch({
                drinkWindowEnd: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="不早于起始年"
          />
        </label>

        <label className="full">
          <span>感官备注</span>
          <textarea
            value={draft.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="香气、单宁、酒体等关键词"
            rows={2}
          />
        </label>

        {correction && (
          <label className="full reason-field">
            <span>修正原因 *（将随版本链保留）</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：讲师复核发现品种录错，应为黑皮诺"
              rows={2}
            />
          </label>
        )}

        <div className="full form-footer">
          <div className={`live-check ${blockingCount ? "has-conflict" : "ok"}`}>
            {blockingCount === 0 ? (
              <>
                <i className="dot dot-ok" /> 实时核验通过，可进入训练
              </>
            ) : (
              <>
                <i className="dot dot-err" /> {blockingCount} 条阻断冲突：
                {liveConflicts.map((c) => (
                  <span key={c.rule + c.field + c.originalValue} className="mini-conflict">
                    {c.message}
                  </span>
                ))}
              </>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="ghost-action" onClick={reset}>
              清空
            </button>
            <button type="submit" className="primary-action">
              {correction ? "提交修正并生成新版本" : "录入酒款"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
