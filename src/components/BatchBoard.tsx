import { useMemo, useState } from "react";
import { getAppellation } from "../data/appellations";
import type { Batch, Wine, WineSnapshot } from "../data/types";
import { canArchive, canSubmitForReview, drawBatch } from "../domain/batches";
import { conflictsByWine } from "../domain/validation";
import { useCellar } from "../state/CellarContext";
import { Modal } from "./Modal";
import { WineForm, draftFromWine } from "./WineForm";
import { formatDate, formatYearRange } from "./format";

// ============ 页面层：训练批次闭环 ============

const STATUS_TEXT: Record<Batch["status"], string> = {
  in_training: "训练中",
  in_review: "待讲师复核",
  archived: "已归档",
};

function CorrectionModal({ batch, wine, onClose }: { batch: Batch; wine: Wine; onClose: () => void }) {
  const { dispatch } = useCellar();
  const [reason, setReason] = useState("");

  const submit = (snapshot: WineSnapshot) => {
    if (!reason.trim()) return;
    dispatch({ type: "CORRECT_WINE", batchId: batch.id, wineId: wine.id, draft: snapshot, reason });
    onClose();
  };

  return (
    <Modal title={`修正题目：${wine.name}`} subtitle={`${batch.id} · 复核中 · 从 v${wine.currentVersion} 生成新版本`} onClose={onClose}>
      <p className="panel-hint">
        讲师复核确认资料有误时填写修正。提交后会<b>生成带原因的新版本</b>（v{wine.currentVersion} → v
        {wine.currentVersion + 1}），版本链保留全部旧版本；批次中的旧题快照保留并标记为“旧题已留存”。
        修正后若仍触发规则则无法提交。
      </p>
      <WineForm
        initialDraft={draftFromWine(wine)}
        submitLabel={`提交修正（v${wine.currentVersion + 1}）`}
        onSubmit={submit}
        onCancel={onClose}
        canSubmit={reason.trim().length > 0}
        hint={reason.trim() ? undefined : "请先填写修正原因（必填）"}
        reasonSlot={
          <label className="reason-field">
            <span>修正原因（必填，将写入版本链）</span>
            <textarea
              rows={2}
              value={reason}
              placeholder="例如：原灌装年份录错，酒庄酒标显示与年份同年"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        }
      />
    </Modal>
  );
}

function BatchItemRow({
  batch,
  item,
  wine,
  index,
  onCorrect,
}: {
  batch: Batch;
  item: Batch["items"][number];
  wine: Wine | undefined;
  index: number;
  onCorrect: (wineId: string) => void;
}) {
  const { dispatch } = useCellar();
  const appellation = getAppellation(item.snapshot.appellationId);
  const newerVersion = wine && wine.currentVersion > item.version;

  return (
    <li className={`batch-item ${item.done ? "done" : ""} ${item.superseded ? "superseded" : ""}`}>
      <div className="item-index">{index + 1}</div>
      <div className="item-body">
        <div className="item-head">
          <strong>{item.snapshot.name}</strong>
          <span className="region-tag">{appellation ? `${appellation.region} · ${appellation.name}` : item.snapshot.appellationId}</span>
          {item.superseded && <span className="kept-tag">旧题已留存 v{item.version}</span>}
          {newerVersion && <span className="new-tag">资料已更新至 v{wine!.currentVersion}</span>}
        </div>
        <p className="item-meta">
          {item.snapshot.variety} · {item.snapshot.vintage} 年份 / {item.snapshot.bottlingYear} 灌装 · 适饮{" "}
          {formatYearRange(item.snapshot.drinkStart, item.snapshot.drinkEnd)}
        </p>
        {item.snapshot.notes && <p className="cell-sub">香气：{item.snapshot.notes}</p>}

        <div className="item-actions">
          {batch.status === "in_training" && (
            <label className="done-toggle">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => dispatch({ type: "TOGGLE_ITEM_DONE", batchId: batch.id, wineId: item.wineId })}
              />
              学员已完成
            </label>
          )}
          {batch.status === "in_review" && (
            <button className="link-action" onClick={() => onCorrect(item.wineId)}>
              复核修正 →
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function BatchCard({ batch, wines }: { batch: Batch; wines: Wine[] }) {
  const { dispatch } = useCellar();
  const [reviewer, setReviewer] = useState("");
  const [correctId, setCorrectId] = useState<string | null>(null);
  const correctWine = wines.find((w) => w.id === correctId) ?? null;

  const doneCount = batch.items.filter((i) => i.done).length;
  const regions = new Set(batch.items.map((i) => i.snapshot.appellationId));

  return (
    <article className={`batch-card status-${batch.status}`}>
      <header className="batch-head">
        <div>
          <h3>{batch.id}</h3>
          <span className="cell-sub">建批 {formatDate(batch.createdAt)}</span>
        </div>
        <span className={`batch-status status-pill-${batch.status}`}>{STATUS_TEXT[batch.status]}</span>
      </header>

      <p className="batch-progress">
        产区数：{regions.size}（三款必须不同产区） · 完成：{doneCount}/{batch.items.length}
        {batch.archivedAt && <> · 归档于 {formatDate(batch.archivedAt)}</>}
        {batch.reviewer && <> · 复核讲师：{batch.reviewer}</>}
      </p>

      <ol className="batch-items">
        {batch.items.map((item, i) => (
          <BatchItemRow
            key={item.wineId}
            batch={batch}
            item={item}
            index={i}
            wine={wines.find((w) => w.id === item.wineId)}
            onCorrect={setCorrectId}
          />
        ))}
      </ol>

      {batch.corrections.length > 0 && (
        <div className="correction-log">
          <p className="correction-title">本批修正（带原因版本，旧题保留）：</p>
          <ul>
            {batch.corrections.map((c, i) => {
              const w = wines.find((x) => x.id === c.wineId);
              return (
                <li key={i}>
                  {w?.name ?? c.wineId}：v{c.fromVersion} → v{c.toVersion} · {c.reason}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <footer className="batch-footer">
        {batch.status === "in_training" && (
          <button
            className="primary-action"
            disabled={!canSubmitForReview(batch)}
            onClick={() => dispatch({ type: "SUBMIT_REVIEW", batchId: batch.id })}
            title={canSubmitForReview(batch) ? "" : "三款酒全部完成后才能提交复核"}
          >
            {canSubmitForReview(batch) ? "提交讲师复核" : `完成全部 ${batch.items.length} 款后可提交复核`}
          </button>
        )}

        {batch.status === "in_review" && (
          <div className="archive-row">
            <input
              placeholder="复核讲师姓名"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            />
            <button
              className="primary-action"
              disabled={!canArchive(batch, reviewer)}
              onClick={() => dispatch({ type: "ARCHIVE_BATCH", batchId: batch.id, reviewer })}
            >
              讲师复核通过并归档
            </button>
          </div>
        )}

        {batch.status === "archived" && <span className="archived-note">批次已归档，酒款释放回可抽取池。</span>}
      </footer>

      {correctWine && <CorrectionModal batch={batch} wine={correctWine} onClose={() => setCorrectId(null)} />}
    </article>
  );
}

export function BatchBoard() {
  const { state, dispatch } = useCellar();
  const [error, setError] = useState<string | null>(null);

  const conflictMap = useMemo(() => conflictsByWine(state.wines), [state.wines]);
  const trainableIds = useMemo(
    () => new Set(state.wines.filter((w) => !conflictMap.has(w.id)).map((w) => w.id)),
    [state.wines, conflictMap],
  );

  const occupied = useMemo(() => {
    const s = new Set<string>();
    for (const b of state.batches) {
      if (b.status !== "archived") b.items.forEach((it) => s.add(it.wineId));
    }
    return s;
  }, [state.batches]);

  const handleDraw = () => {
    const r = drawBatch(state.wines, state.batches, trainableIds);
    if (!r.ok || !r.items) {
      setError(r.reason ?? "无法抽取");
      return;
    }
    setError(null);
    dispatch({ type: "DRAW_BATCH", items: r.items });
  };

  const inTraining = state.batches.filter((b) => b.status === "in_training");
  const inReview = state.batches.filter((b) => b.status === "in_review");
  const archived = state.batches.filter((b) => b.status === "archived");

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>训练闭环</p>
          <h2>训练批次（{state.batches.length}）</h2>
        </div>
        <button className="primary-action" onClick={handleDraw}>
          抽取新批次（三款不同产区）
        </button>
      </div>

      <p className="panel-hint">
        抽取规则：只从核验通过的入训池抽取，三款分属不同产区；同一酒款在未完成（未归档）批次中
        <b>只出现一次</b>。当前入训池 {trainableIds.size} 款，其中 {occupied.size} 款被未归档批次占用。
      </p>
      {error && (
        <p className="save-block" onClick={() => setError(null)}>
          抽取失败：{error}（点击关闭）
        </p>
      )}

      {state.batches.length === 0 && <p className="empty-hint">还没有批次，点击右上角抽取第一批。</p>}

      <div className="batch-columns">
        {inTraining.length > 0 && (
          <div>
            <h4 className="col-title">训练中（{inTraining.length}）</h4>
            <div className="batch-stack">{inTraining.map((b) => <BatchCard key={b.id} batch={b} wines={state.wines} />)}</div>
          </div>
        )}
        {inReview.length > 0 && (
          <div>
            <h4 className="col-title">待讲师复核（{inReview.length}）</h4>
            <div className="batch-stack">{inReview.map((b) => <BatchCard key={b.id} batch={b} wines={state.wines} />)}</div>
          </div>
        )}
        {archived.length > 0 && (
          <div>
            <h4 className="col-title">已归档（{archived.length}）</h4>
            <div className="batch-stack batch-muted">{archived.map((b) => <BatchCard key={b.id} batch={b} wines={state.wines} />)}</div>
          </div>
        )}
      </div>
    </section>
  );
}
