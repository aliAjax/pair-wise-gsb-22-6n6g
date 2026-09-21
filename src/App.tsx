import { useMemo } from "react";
import "./styles.css";
import { WineEntry } from "./components/WineEntry";
import { ConflictReport } from "./components/ConflictReport";
import { WineLibrary } from "./components/WineLibrary";
import { BatchBoard } from "./components/BatchBoard";
import { CellarProvider, useCellar } from "./state/CellarContext";
import { conflictsByWine } from "./domain/validation";

const project = {
  id: "hxwl-08",
  port: 5108,
  title: "盲品看板 · 酒款资料核验与训练批次闭环",
  subtitle:
    "录入绑定产区、法定品种、年份与适饮区间；三规则不通过不得入训；三款不同产区成批，讲师复核归档，修正带原因留版本，刷新后资料与批次一致。",
  stack: "React + Vite + TypeScript + CSS · 数据 / 校验 / 页面三层分离 · localStorage 持久化",
};

function MetricCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p className="metric-hint">{hint}</p>
      <i className={tone} />
    </article>
  );
}

function Metrics() {
  const { state } = useCellar();
  const conflictMap = useMemo(() => conflictsByWine(state.wines), [state.wines]);
  const pendingCount = conflictMap.size;

  const openBatches = state.batches.filter((b) => b.status !== "archived");
  const reviewCount = state.batches.filter((b) => b.status === "in_review").length;
  const archivedCount = state.batches.filter((b) => b.status === "archived").length;
  const occupiedWines = new Set(openBatches.flatMap((b) => b.items.map((i) => i.wineId))).size;
  const versionCount = state.wines.reduce((n, w) => n + w.versions.length, 0);

  return (
    <section className="metrics-grid">
      <MetricCard
        label="酒款总数 / 待核"
        value={`${state.wines.length} / ${pendingCount}`}
        hint="冲突酒款不得进入训练池"
        tone={pendingCount ? "status-danger" : "status-ok"}
      />
      <MetricCard
        label="可抽取（入训池 − 占用）"
        value={String(Math.max(0, state.wines.length - pendingCount - occupiedWines))}
        hint={`入训池 ${state.wines.length - pendingCount} 款，未归档批次占用 ${occupiedWines} 款`}
        tone="status-ok"
      />
      <MetricCard
        label="进行中 / 待复核"
        value={`${openBatches.length} / ${reviewCount}`}
        hint="三款全部完成才能提交复核"
        tone={reviewCount ? "status-watch" : "status-ok"}
      />
      <MetricCard
        label="已归档 / 版本记录"
        value={`${archivedCount} / ${versionCount}`}
        hint="修正生成带原因新版本，旧题保留"
        tone="status-ok"
      />
    </section>
  );
}

function ResetButton() {
  const { dispatch } = useCellar();
  return (
    <button
      className="ghost-action"
      onClick={() => {
        if (window.confirm("恢复演示数据将清除本机全部酒款、批次与版本链，确定继续？")) {
          dispatch({ type: "RESET_DEMO" });
        }
      }}
    >
      恢复演示数据
    </button>
  );
}

function Board() {
  return (
    <>
      <Metrics />
      <div className="workspace-block">
        <WineEntry />
      </div>
      <div className="workspace-block">
        <BatchBoard />
      </div>
      <div className="workspace-block">
        <ConflictReport />
      </div>
      <div className="workspace-block">
        <WineLibrary />
      </div>
    </>
  );
}

function App() {
  return (
    <CellarProvider>
      <main className="app-shell">
        <section className="hero">
          <div>
            <p className="eyebrow">{project.id} · port {project.port}</p>
            <h1>{project.title}</h1>
            <p className="subtitle">{project.subtitle}</p>
          </div>
          <div className="stack-card">
            <span>实现结构</span>
            <strong>{project.stack}</strong>
            <span className="persist-note">数据实时写入 localStorage，刷新后酒款、批次与版本链一致。</span>
            <ResetButton />
          </div>
        </section>
        <Board />
      </main>
    </CellarProvider>
  );
}

export default App;
