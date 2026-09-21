import { useMemo, useState } from "react";
import {
  FIELD_LABELS,
  RULE_LABELS,
  type FieldConflict,
  type Wine,
  type WineSnapshot,
} from "../data/types";
import { conflictsByWine } from "../domain/validation";
import { getAppellation } from "../data/appellations";
import { useCellar } from "../state/CellarContext";
import { Modal } from "./Modal";
import { WineForm, draftFromWine } from "./WineForm";

// ============ 页面层：冲突清单与待核修改 ============

function ConflictRow({
  c,
  showWine,
  rowSpan,
}: {
  c: FieldConflict;
  showWine?: boolean;
  rowSpan?: number;
}) {
  return (
    <tr>
      {showWine ? (
        <td rowSpan={rowSpan} className="wine-cell">
          <strong>{c.wineName}</strong>
          <span className="cell-sub">{c.wineId}</span>
        </td>
      ) : null}
      <td>{FIELD_LABELS[c.field]}</td>
      <td>
        <code className="old-value">{c.originalValue || "（空）"}</code>
      </td>
      <td>
        <span className="rule-tag">{RULE_LABELS[c.rule]}</span>
        <span className="cell-sub">{c.detail}</span>
      </td>
      <td className="fix-cell"></td>
    </tr>
  );
}

function FixModal({ wine, onClose }: { wine: Wine; onClose: () => void }) {
  const { dispatch } = useCellar();
  const submit = (snapshot: WineSnapshot) => {
    dispatch({ type: "UPDATE_WINE", id: wine.id, draft: snapshot });
    onClose();
  };
  return (
    <Modal title={`修改待核资料：${wine.name}`} subtitle={wine.id} onClose={onClose}>
      <p className="panel-hint">
        该酒款尚未进入任何批次，可直接修改字段；通过全部规则后自动转入训练池，不产生版本记录。
      </p>
      <WineForm
        initialDraft={draftFromWine(wine)}
        submitLabel="保存修改并重新核验"
        onSubmit={submit}
        onCancel={onClose}
      />
    </Modal>
  );
}

export function ConflictReport() {
  const { state } = useCellar();
  const [fixId, setFixId] = useState<string | null>(null);

  const conflictMap = useMemo(() => conflictsByWine(state.wines), [state.wines]);
  const rows = useMemo(
    () => state.wines.flatMap((w) => conflictMap.get(w.id) ?? []),
    [state.wines, conflictMap],
  );
  const fixWine = state.wines.find((w) => w.id === fixId) ?? null;

  return (
    <section className="panel" id="conflicts">
      <div className="section-heading">
        <div>
          <p>核验结果</p>
          <h2>冲突清单（{rows.length}）</h2>
        </div>
        <span className={rows.length ? "rule-badge danger" : "rule-badge ok"}>
          {rows.length ? "存在不得入训酒款" : "全部通过核验"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="empty-hint">当前无冲突，全部酒款均可参与训练抽取。</p>
      ) : (
        <div className="table-wrap">
          <table className="conflict-table">
            <thead>
              <tr>
                <th>酒款</th>
                <th>字段</th>
                <th>原值</th>
                <th>违反规则 / 说明</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.wines
                .filter((w) => conflictMap.has(w.id))
                .map((w) => {
                  const list = conflictMap.get(w.id)!;
                  const appellation = getAppellation(w.appellationId);
                  return (
                    <ConflictRows
                      key={w.id}
                      wine={w}
                      conflicts={list}
                      appellationText={
                        appellation ? `${appellation.region} · ${appellation.name}` : w.appellationId
                      }
                      onFix={() => setFixId(w.id)}
                    />
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {fixWine && <FixModal wine={fixWine} onClose={() => setFixId(null)} />}
    </section>
  );
}

function ConflictRows({
  wine,
  conflicts,
  appellationText,
  onFix,
}: {
  wine: Wine;
  conflicts: FieldConflict[];
  appellationText: string;
  onFix: () => void;
}) {
  return (
    <>
      {conflicts.map((c, i) => (
        <ConflictRow key={c.rule + c.field} c={c} showWine={i === 0} rowSpan={conflicts.length} />
      ))}
      <tr className="fix-row">
        <td colSpan={5}>
          <span className="cell-sub fix-context">{wine.id} · {appellationText}</span>
          <button className="link-action" onClick={onFix}>
            修改该酒款资料 →
          </button>
        </td>
      </tr>
    </>
  );
}
