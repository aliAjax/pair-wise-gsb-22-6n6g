import { useMemo } from "react";
import type { Conflict, Wine } from "../data/types";
import { validateStoredWine } from "../validation/rules";
import type { CorrectionRequest } from "./WineForm";

/**
 * 冲突看板：只列当前有效版本上的阻断冲突。
 * 每条冲突给出 酒款 / 字段 / 原值 / 规则，并可直接发起修正。
 */
export function ConflictPanel({
  wines,
  onCorrect,
}: {
  wines: Wine[];
  onCorrect: (req: CorrectionRequest) => void;
}) {
  const rows = useMemo(() => {
    const out: Array<{ wine: Wine; conflicts: Conflict[] }> = [];
    for (const wine of wines) {
      if (wine.status !== "active") continue;
      const conflicts = validateStoredWine(wine);
      if (conflicts.length > 0) out.push({ wine, conflicts });
    }
    return out;
  }, [wines]);

  const total = rows.reduce((sum, r) => sum + r.conflicts.length, 0);

  return (
    <section className="panel conflict-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">核验闭环</p>
          <h2>冲突酒款 {total > 0 && <span className="badge badge-danger">{total}</span>}</h2>
        </div>
        <p className="hint">存在阻断冲突的酒款已落库，但不得进入训练，修正生成新版本后方可入池。</p>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <i className="dot dot-ok" /> 当前没有阻断冲突，酒款资料全部合规。
        </div>
      ) : (
        <div className="table-wrap">
          <table className="conflict-table">
            <thead>
              <tr>
                <th>酒款</th>
                <th>字段</th>
                <th>原值</th>
                <th>触发规则</th>
                <th>说明</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap(({ wine, conflicts }) =>
                conflicts.map((c, idx) => (
                  <tr key={`${wine.id}-${c.rule}-${c.field}-${idx}`}>
                    <td className="cell-wine">
                      {idx === 0 ? wine.name : ""}
                      {idx === 0 && (
                        <span className="muted">
                          v{wine.version}
                        </span>
                      )}
                    </td>
                    <td>{c.field}</td>
                    <td><code>{c.originalValue}</code></td>
                    <td>
                      <span className="rule-tag">{c.ruleName}</span>
                    </td>
                    <td className="cell-message">{c.message}</td>
                    <td>
                      {idx === 0 && (
                        <button className="ghost-action" onClick={() => onCorrect({ wine })}>
                          修正
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
