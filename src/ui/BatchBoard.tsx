import { useState } from "react";
import type { AppState, Batch } from "../data/types";
import {
  BATCH_STATUS_LABEL,
  makeBatchItem,
} from "../data/store";
import {
  FlowError,
  archiveBatch,
  buildDrawPool,
  completeBatch,
  drawBatch,
  reopenBatch,
  reviewBatch,
} from "../training/batch";
import { store } from "./useStore";

function BatchCard({
  batch,
  notify,
}: {
  batch: Batch;
  notify: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [note, setNote] = useState(batch.reviewNote ?? "");
  const regions = new Set(batch.items.map((i) => i.snapshot.region));

  function apply(fn: (b: Batch) => Batch) {
    try {
      store.updateBatch(batch.id, fn);
    } catch (err) {
      notify(err instanceof FlowError ? `状态不允许该操作（${err.code}）` : "操作失败", "err");
    }
  }

  return (
    <article className={`batch-card status-${batch.status}`}>
      <header className="batch-head">
        <div>
          <h3>批次 {batch.id.slice(0, 10)}</h3>
          <p className="muted">
            {batch.items.length} 款 · 覆盖 {regions.size} 个产区：
            {[...regions].join(" / ")}
          </p>
        </div>
        <span className={`batch-status status-pill-${batch.status}`}>
          {BATCH_STATUS_LABEL[batch.status]}
        </span>
      </header>

      <ul className="batch-items">
        {batch.items.map((item) => (
          <li key={item.wineId} className="batch-item">
            <div>
              <strong>{item.snapshot.name}</strong>
              <span className="muted">
                {" "}
                · {item.snapshot.region} · {item.snapshot.varieties.join("、")} ·{" "}
                {item.snapshot.vintage} 年份
              </span>
            </div>
            <div className="muted small">
              灌装 {item.snapshot.bottledYear} · 适饮 {item.snapshot.drinkWindowStart}–
              {item.snapshot.drinkWindowEnd}
            </div>
            {item.correctedToId && (
              <div className="corrected-link">
                讲师已修正 → 新版本 <code>{item.correctedToId.slice(0, 8)}</code>
                （本题为旧版快照，保留不变）
              </div>
            )}
          </li>
        ))}
      </ul>

      <footer className="batch-actions">
        {batch.status === "open" && (
          <button className="primary-action" onClick={() => apply(completeBatch)}>
            完成训练，提交讲师复核
          </button>
        )}

        {batch.status === "completed" && (
          <div className="review-box">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="讲师复核意见（必填，通过或打回都需记录）"
              rows={2}
            />
            <div className="review-buttons">
              <button className="ghost-action" onClick={() => apply(reopenBatch)}>
                打回重新训练
              </button>
              <button
                className="primary-action"
                onClick={() => {
                  try {
                    store.updateBatch(batch.id, (b) => reviewBatch(b, note));
                    notify("讲师复核通过，待归档", "ok");
                  } catch (err) {
                    notify(
                      err instanceof FlowError && err.code === "REVIEW_NOTE_REQUIRED"
                        ? "请先填写讲师复核意见"
                        : "状态不允许该操作",
                      "err"
                    );
                  }
                }}
              >
                复核通过
              </button>
            </div>
          </div>
        )}

        {batch.status === "reviewed" && (
          <>
            <p className="review-note">讲师复核意见：{batch.reviewNote}</p>
            <button className="primary-action" onClick={() => apply(archiveBatch)}>
              归档（复核后才能归档）
            </button>
          </>
        )}

        {batch.status === "archived" && (
          <p className="review-note">
            已归档 · 讲师复核意见：{batch.reviewNote}
          </p>
        )}
      </footer>
    </article>
  );
}

export function BatchBoard({
  state,
  notify,
}: {
  state: AppState;
  notify: (msg: string, kind?: "ok" | "err") => void;
}) {
  const pool = buildDrawPool(state);

  function createBatch() {
    try {
      const picked = drawBatch(state);
      const batch: Batch = {
        id: `b${Date.now().toString(36)}`,
        status: "open",
        items: picked.map(makeBatchItem),
        reviewNote: null,
        createdAt: Date.now(),
        completedAt: null,
        reviewedAt: null,
        archivedAt: null,
      };
      store.createBatch(batch);
      notify(
        `已开批：${batch.items.map((i) => i.snapshot.name).join(" / ")}`,
        "ok"
      );
    } catch (err) {
      if (err instanceof FlowError && err.code === "NOT_ENOUGH_REGIONS") {
        notify(
          `可用产区不足 3 个（当前 ${pool.availableRegions.length} 个：${pool.availableRegions.join(
            "、"
          )}）；等待未完成批次结束或修正冲突酒款`,
          "err"
        );
      } else {
        notify("开批失败", "err");
      }
    }
  }

  const openCount = state.batches.filter((b) => b.status !== "archived").length;

  return (
    <section className="panel batch-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">训练批次</p>
          <h2>批次闭环</h2>
        </div>
        <div className="draw-info">
          <div className="pool-tags">
            {pool.availableRegions.map((r) => (
              <span key={r} className="pool-tag">
                {r}（{pool.byRegion.get(r)?.length}）
              </span>
            ))}
            {pool.availableRegions.length === 0 && <span className="muted">抽批池为空</span>}
          </div>
          <button className="primary-action" onClick={createBatch}>
            抽取一批（3 款 / 不同产区）
          </button>
        </div>
      </div>

      <p className="hint">
        抽批池 {pool.pool.length} 款合规酒款；进行中批次 {openCount} 个。同一酒款在其批次未完成前不会再次出现，
        归档后自动释放。
      </p>

      {state.batches.length === 0 ? (
        <div className="empty-state">尚无批次，点击右上角开批。</div>
      ) : (
        <div className="batch-grid">
          {state.batches.map((batch) => (
            <BatchCard key={batch.id} batch={batch} notify={notify} />
          ))}
        </div>
      )}
    </section>
  );
}
