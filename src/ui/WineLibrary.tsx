import { useMemo } from "react";
import type { Wine } from "../data/types";
import { getAppellation } from "../data/appellations";
import { validateStoredWine } from "../validation/rules";
import { versionChains } from "../data/store";
import type { CorrectionRequest } from "./WineForm";

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function WineLibrary({
  wines,
  onCorrect,
}: {
  wines: Wine[];
  onCorrect: (req: CorrectionRequest) => void;
}) {
  const chains = useMemo(() => versionChains(wines), [wines]);

  return (
    <section className="panel wine-library">
      <div className="section-heading">
        <div>
          <p className="eyebrow">版本链</p>
          <h2>酒款资料库</h2>
        </div>
        <p className="hint">
          共 {wines.length} 个版本 / {chains.length} 条版本链；修正只追加新版本，旧题完整保留。
        </p>
      </div>

      <div className="chain-grid">
        {chains.map((chain) => {
          const latest = chain[chain.length - 1];
          const latestConflicts = validateStoredWine(latest);
          const appellation = getAppellation(latest.appellationId);
          return (
            <article key={latest.rootId} className="chain-card">
              <header className="chain-head">
                <div>
                  <h3>{latest.name}</h3>
                  <p className="muted">
                    {appellation?.region} · {appellation?.name}
                  </p>
                </div>
                {latest.status === "active" ? (
                  latestConflicts.length === 0 ? (
                    <span className="badge badge-ok">可入池</span>
                  ) : (
                    <span className="badge badge-danger">{latestConflicts.length} 冲突</span>
                  )
                ) : (
                  <span className="badge badge-muted">已废止</span>
                )}
              </header>

              <dl className="wine-facts">
                <div>
                  <dt>年份</dt>
                  <dd>{latest.vintage}</dd>
                </div>
                <div>
                  <dt>灌装</dt>
                  <dd>{latest.bottledYear}</dd>
                </div>
                <div>
                  <dt>适饮区间</dt>
                  <dd>
                    {latest.drinkWindowStart}–{latest.drinkWindowEnd}
                  </dd>
                </div>
                <div className="full">
                  <dt>品种</dt>
                  <dd>
                    {latest.varieties.map((v) => {
                      const legal = appellation?.legalVarieties.includes(v);
                      return (
                        <span key={v} className={`variety-pill ${legal ? "" : "illegal"}`}>
                          {v}
                        </span>
                      );
                    })}
                  </dd>
                </div>
                {latest.notes && (
                  <div className="full">
                    <dt>备注</dt>
                    <dd className="muted">{latest.notes}</dd>
                  </div>
                )}
              </dl>

              {chain.length > 1 && (
                <ol className="version-list">
                  {chain.map((w) => {
                    const c = validateStoredWine(w);
                    return (
                      <li
                        key={w.id}
                        className={`version-node ${w.status === "active" ? "active" : "old"}`}
                      >
                        <div className="version-line">
                          <strong>v{w.version}</strong>
                          <span className="muted">{fmtDate(w.createdAt)}</span>
                          {w.status === "superseded" && (
                            <span className="tag tag-old">旧题保留</span>
                          )}
                          {w.status === "active" && <span className="tag tag-current">当前版本</span>}
                          {c.length > 0 && (
                            <span className="tag tag-conflict">{c.length} 条冲突</span>
                          )}
                        </div>
                        <p className="version-reason">
                          {w.reason ? `修正原因：${w.reason}` : "首次录入"}
                        </p>
                        <p className="version-snapshot muted">
                          {w.vintage} 年 / 灌装 {w.bottledYear} · 适饮 {w.drinkWindowStart}–
                          {w.drinkWindowEnd} · {w.varieties.join("、")}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}

              {latest.status === "active" && (
                <footer className="chain-actions">
                  <button className="ghost-action" onClick={() => onCorrect({ wine: latest })}>
                    发起修正（保留旧题）
                  </button>
                </footer>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
