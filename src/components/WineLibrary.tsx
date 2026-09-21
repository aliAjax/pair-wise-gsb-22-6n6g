import { useMemo, useState } from "react";
import { getAppellation } from "../data/appellations";
import type { Wine } from "../data/types";
import { conflictsByWine } from "../domain/validation";
import { useCellar } from "../state/CellarContext";
import { formatDate, formatYearRange } from "./format";

// ============ 页面层：酒款库与版本链 ============

type Filter = "all" | "trainable" | "pending";

function VersionChain({ wine }: { wine: Wine }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="version-chain">
      <button type="button" className="link-action" onClick={() => setOpen((v) => !v)}>
        版本链 v{wine.currentVersion}（{wine.versions.length} 版）{open ? " ▲" : " ▼"}
      </button>
      {open && (
        <ol className="version-list">
          {[...wine.versions].reverse().map((v) => {
            const appellation = getAppellation(v.snapshot.appellationId);
            return (
              <li key={v.version} className={v.version === wine.currentVersion ? "current" : ""}>
                <div className="version-head">
                  <span className="version-no">v{v.version}</span>
                  <span className="version-reason">{v.reason}</span>
                  <span className="cell-sub">{formatDate(v.createdAt)}</span>
                </div>
                {v.version === wine.currentVersion && <span className="now-tag">当前版本</span>}
                <p className="version-snapshot">
                  {appellation?.name ?? v.snapshot.appellationId} · {v.snapshot.variety} ·{" "}
                  {v.snapshot.vintage} 年份 / {v.snapshot.bottlingYear} 灌装 · 适饮{" "}
                  {formatYearRange(v.snapshot.drinkStart, v.snapshot.drinkEnd)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function WineCard({ wine, hasConflict }: { wine: Wine; hasConflict: boolean }) {
  const appellation = getAppellation(wine.appellationId);
  return (
    <article className={`wine-card ${hasConflict ? "is-pending" : "is-ok"}`}>
      <div className="wine-card-head">
        <div>
          <h3>{wine.name}</h3>
          <span className="cell-sub">{wine.id} · 更新于 {formatDate(wine.updatedAt)}</span>
        </div>
        <span className={`wine-badge ${hasConflict ? "badge-pending" : "badge-ok"}`}>
          {hasConflict ? "待核 · 不入训" : "入训池"}
        </span>
      </div>

      <dl className="wine-meta">
        <div>
          <dt>产区</dt>
          <dd>{appellation ? `${appellation.region} · ${appellation.name}` : wine.appellationId}</dd>
        </div>
        <div>
          <dt>法定品种</dt>
          <dd>{wine.variety}</dd>
        </div>
        <div>
          <dt>年份 / 灌装</dt>
          <dd>
            {wine.vintage} / {wine.bottlingYear}
          </dd>
        </div>
        <div>
          <dt>适饮区间</dt>
          <dd className={wine.drinkStart > wine.drinkEnd ? "bad-range" : ""}>
            {formatYearRange(wine.drinkStart, wine.drinkEnd)}
          </dd>
        </div>
        {wine.notes && (
          <div className="wide">
            <dt>香气 / 备注</dt>
            <dd>{wine.notes}</dd>
          </div>
        )}
      </dl>

      <VersionChain wine={wine} />
    </article>
  );
}

export function WineLibrary() {
  const { state } = useCellar();
  const [filter, setFilter] = useState<Filter>("all");
  const conflictMap = useMemo(() => conflictsByWine(state.wines), [state.wines]);

  const shown = state.wines.filter((w) => {
    if (filter === "pending") return conflictMap.has(w.id);
    if (filter === "trainable") return !conflictMap.has(w.id);
    return true;
  });

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>酒款资料</p>
          <h2>酒款库（{state.wines.length}）</h2>
        </div>
        <div className="filter-tabs">
          <button className={filter === "all" ? "tab-on" : ""} onClick={() => setFilter("all")}>
            全部
          </button>
          <button className={filter === "trainable" ? "tab-on" : ""} onClick={() => setFilter("trainable")}>
            入训池
          </button>
          <button className={filter === "pending" ? "tab-on" : ""} onClick={() => setFilter("pending")}>
            待核
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="empty-hint">该筛选下暂无酒款。</p>
      ) : (
        <div className="wine-grid">
          {shown.map((w) => (
            <WineCard key={w.id} wine={w} hasConflict={conflictMap.has(w.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
