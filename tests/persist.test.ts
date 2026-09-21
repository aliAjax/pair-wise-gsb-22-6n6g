import assert from "node:assert/strict";
import { createSeedState } from "../src/data/seed";
import { drawBatch } from "../src/domain/batches";
import { cellarReducer, loadState, saveState } from "../src/state/store";

// localStorage 桩，模拟浏览器刷新（同一存储对象）
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

let s = createSeedState();
// 抽第二批 + 把第一批走完、发起一次修正、归档
const trainable = new Set(s.wines.filter((w) => w.id !== "W-007").map((w) => w.id));
const r = drawBatch(s.wines, s.batches, trainable);
s = cellarReducer(s, { type: "DRAW_BATCH", items: r.items! });
s = cellarReducer(s, { type: "TOGGLE_ITEM_DONE", batchId: "B-1001", wineId: "W-002" });
s = cellarReducer(s, { type: "TOGGLE_ITEM_DONE", batchId: "B-1001", wineId: "W-003" });
s = cellarReducer(s, { type: "SUBMIT_REVIEW", batchId: "B-1001" });
const w1 = s.wines.find((w) => w.id === "W-001")!;
s = cellarReducer(s, {
  type: "CORRECT_WINE",
  batchId: "B-1001",
  wineId: "W-001",
  draft: {
    name: w1.name, appellationId: w1.appellationId, variety: w1.variety,
    vintage: w1.vintage, bottlingYear: w1.bottlingYear,
    drinkStart: w1.drinkStart, drinkEnd: w1.drinkEnd, notes: "修正后备注",
  },
  reason: "复核修正原因-刷新测试",
});
s = cellarReducer(s, { type: "ARCHIVE_BATCH", batchId: "B-1001", reviewer: "李讲师" });
saveState(s);

// “刷新”：重新 load
const restored = loadState();
assert.equal(restored.wines.length, s.wines.length, "酒款数量一致");
assert.equal(restored.batches.length, s.batches.length, "批次数量一致");
assert.equal(restored.batches.find((b) => b.id === "B-1001")!.status, "archived", "归档状态保持");
assert.equal(restored.batches.find((b) => b.id === "B-1001")!.reviewer, "李讲师");
const v2 = restored.wines.find((w) => w.id === "W-001")!;
assert.equal(v2.currentVersion, 2, "当前版本号保持");
assert.equal(v2.versions[1].reason, "复核修正原因-刷新测试", "版本链原因保持");
assert.equal(
  restored.batches.find((b) => b.id === "B-1001")!.items[0].snapshot.notes,
  "黑醋栗、雪松、铅笔芯，单宁细密",
  "旧题快照保持",
);
assert.equal(restored.batches.find((b) => b.id === "B-1001")!.items[0].superseded, true, "旧题标记保持");
assert.equal(restored.wines.find((w) => w.id === "W-007")!.versions.length, 1, "未修正酒款版本链不变");
console.log("✓ 刷新恢复：酒款、批次状态、版本链、旧题快照与修正轨迹全部一致");
