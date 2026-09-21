import { useCallback, useMemo, useState } from "react";
import "./styles.css";
import { store, useAppState } from "./ui/useStore";
import { WineForm, type CorrectionRequest } from "./ui/WineForm";
import { WineLibrary } from "./ui/WineLibrary";
import { ConflictPanel } from "./ui/ConflictPanel";
import { BatchBoard } from "./ui/BatchBoard";
import { buildDrawPool } from "./training/batch";
import { validateStoredWine } from "./validation/rules";
import { versionChains } from "./data/store";

interface Toast {
  id: number;
  msg: string;
  kind: "ok" | "err";
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={tone} />
    </article>
  );
}

export default function App() {
  const state = useAppState();
  const [correction, setCorrection] = useState<CorrectionRequest | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const startCorrection = useCallback((req: CorrectionRequest) => {
    setCorrection(req);
    setFormKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const finishCorrection = useCallback(() => {
    setCorrection(null);
    setFormKey((k) => k + 1);
  }, []);

  const stats = useMemo(() => {
    const chains = versionChains(state.wines);
    const conflictWines = state.wines.filter(
      (w) => w.status === "active" && validateStoredWine(w).length > 0
    ).length;
    const pool = buildDrawPool(state);
    const openBatches = state.batches.filter((b) => b.status !== "archived").length;
    const archived = state.batches.filter((b) => b.status === "archived").length;
    const oldVersions = state.wines.filter((w) => w.status === "superseded").length;
    return {
      chains: chains.length,
      conflictWines,
      pool: pool.pool.length,
      regions: pool.availableRegions.length,
      openBatches,
      archived,
      oldVersions,
    };
  }, [state]);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-08 · 盲品看板</p>
          <h1>酒款资料核验与训练批次闭环</h1>
          <p className="subtitle">
            录入绑定产区 / 法定品种 / 年份 / 适饮区间；核验不过不得入训；讲师复核后才能归档；
            修正生成带原因的新版本并保留旧题。
          </p>
        </div>
        <div className="stack-card">
          <span>分层实现</span>
          <strong>data · validation · training · ui</strong>
          <button
            className="ghost-action reset-btn"
            onClick={() => {
              store.resetDemo();
              setCorrection(null);
              setFormKey((k) => k + 1);
              notify("已恢复演示数据", "ok");
            }}
          >
            恢复演示数据
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="版本链（酒款）" value={String(stats.chains)} tone="status-ok" />
        <MetricCard
          label="当前冲突酒款"
          value={String(stats.conflictWines)}
          tone={stats.conflictWines ? "status-danger" : "status-ok"}
        />
        <MetricCard label="可抽池 / 覆盖产区" value={`${stats.pool} / ${stats.regions}`} tone="status-watch" />
        <MetricCard label="进行中 / 已归档批次" value={`${stats.openBatches} / ${stats.archived}`} tone="status-ok" />
        <MetricCard label="保留的旧版本（旧题）" value={String(stats.oldVersions)} tone="status-watch" />
      </section>

      <WineForm
        key={formKey}
        correction={correction}
        onFinish={finishCorrection}
        notify={notify}
      />

      <ConflictPanel wines={state.wines} onCorrect={startCorrection} />

      <BatchBoard state={state} notify={notify} />

      <WineLibrary wines={state.wines} onCorrect={startCorrection} />

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </main>
  );
}
