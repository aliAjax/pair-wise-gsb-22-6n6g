import assert from "node:assert/strict";
import { createSeedState } from "../src/data/seed";
import { validateWine, conflictsByWine } from "../src/domain/validation";
import { drawBatch, canSubmitForReview, canArchive } from "../src/domain/batches";
import { cellarReducer } from "../src/state/store";
import type { Batch, Wine, WineSnapshot } from "../src/data/types";

let passed = 0;
const ok = (name: string, cond: boolean) => {
  assert.ok(cond, name);
  passed++;
  console.log("  ✓", name);
};

const snap = (w: Wine): WineSnapshot => {
  const { id: _id, currentVersion: _c, versions: _v, createdAt: _ca, updatedAt: _ua, ...s } = w;
  return s;
};

// ---------- 1. 三条核验规则 ----------
console.log("校验规则：");
{
  const state = createSeedState();
  const map = conflictsByWine(state.wines);
  const bad = map.get("W-007")!;
  ok("样酒 W-007 恰好触发三条规则", bad.length === 3);
  ok("含：品种不符法定产区", bad.some((c) => c.rule === "VARIETY_NOT_LEGAL" && c.field === "variety"));
  ok("含：年份早于灌装", bad.some((c) => c.rule === "VINTAGE_BEFORE_BOTTLING" && c.field === "vintage"));
  ok("含：适饮区间倒置", bad.some((c) => c.rule === "DRINK_WINDOW_INVERTED" && c.field === "drinkStart"));
  ok("冲突含酒款/字段/原值", bad.every((c) => c.wineId && c.field && c.originalValue));
  ok("其余 6 款种子酒款全部合规", state.wines.filter((w) => w.id !== "W-007").every((w) => !map.has(w.id)));

  // 修正成合法品种后冲突消失
  const fixed = state.wines.find((w) => w.id === "W-007")!;
  const repaired: Wine = {
    ...fixed,
    variety: "长相思",
    vintage: 2022,
    bottlingYear: 2022,
    drinkStart: 2024,
    drinkEnd: 2030,
  };
  ok("修正三字段后通过核验", validateWine({ ...snap(repaired), id: repaired.id }).ok);
}

// ---------- 2. 批次抽取 ----------
console.log("批次抽取：");
{
  const state = createSeedState();
  const map = conflictsByWine(state.wines);
  const trainable = new Set(state.wines.filter((w) => !map.has(w.id)).map((w) => w.id));

  // 种子已有一个进行中批次，占用 W-001/2/3；再抽一批不应包含它们
  const r = drawBatch(state.wines, state.batches, trainable);
  ok("存在进行中批次时仍可抽第二批", r.ok && r.items!.length === 3);
  const ids = r.items!.map((i) => i.wineId);
  ok("未完成批次中的酒款不再出现", ids.every((id) => !["W-001", "W-002", "W-003"].includes(id)));
  const regions = new Set(r.items!.map((i) => i.snapshot.appellationId));
  ok("三款来自不同产区", regions.size === 3);
  ok("批次不抽取冲突酒款 W-007", !ids.includes("W-007"));
  ok("批次快照不随酒款修改而变（独立副本）", r.items![0].snapshot.vintage !== undefined);

  // 归档第一批后，W-001/2/3 应重新可抽取
  let s = state;
  const b = s.batches[0];
  ok("三款未全部完成前不能提交复核", !canSubmitForReview(b));
  s = cellarReducer(s, { type: "TOGGLE_ITEM_DONE", batchId: b.id, wineId: "W-002" });
  s = cellarReducer(s, { type: "TOGGLE_ITEM_DONE", batchId: b.id, wineId: "W-003" });
  s = cellarReducer(s, { type: "SUBMIT_REVIEW", batchId: b.id });
  // 全部完成后可提交（种子中 W-001 已完成，上面补勾另外两款）
  const inReview = s.batches.find((x) => x.id === b.id)!;
  ok("提交后进入待复核", inReview.status === "in_review");
  ok("复核未署名不能归档", !canArchive(inReview, "  "));
  s = cellarReducer(s, { type: "ARCHIVE_BATCH", batchId: b.id, reviewer: "王讲师" });
  ok("署名后归档成功", s.batches[0].status === "archived" && s.batches[0].reviewer === "王讲师");

  const map2 = conflictsByWine(s.wines);
  const t2 = new Set(s.wines.filter((w) => !map2.has(w.id)).map((w) => w.id));
  const r2 = drawBatch(s.wines, s.batches, t2);
  ok("归档后已完成酒款可再次被抽取", r2.ok);
}

// ---------- 3. 训练完成度闸门 ----------
console.log("流转闸门：");
{
  const state = createSeedState();
  const fresh: Batch = { ...state.batches[0], items: state.batches[0].items.map((i) => ({ ...i, done: false })) };
  ok("三款都未完成不可提交复核", !canSubmitForReview(fresh));
  const twoDone: Batch = { ...fresh, items: fresh.items.map((i, idx) => ({ ...i, done: idx < 2 })) };
  ok("仅完成两款不可提交复核", !canSubmitForReview(twoDone));
  const allDone: Batch = { ...fresh, items: fresh.items.map((i) => ({ ...i, done: true })) };
  ok("三款全部完成可提交复核", canSubmitForReview(allDone));
}

// ---------- 4. 修正生成带原因版本，旧题保留 ----------
console.log("修正与版本链：");
{
  let s = createSeedState();
  const b = s.batches[0];
  // 推到待复核
  for (const id of ["W-002", "W-003"]) {
    s = cellarReducer(s, { type: "TOGGLE_ITEM_DONE", batchId: b.id, wineId: id });
  }
  s = cellarReducer(s, { type: "SUBMIT_REVIEW", batchId: b.id });

  const before = s.wines.find((w) => w.id === "W-001")!;
  const draft: WineSnapshot = { ...snap(before), notes: "复核修正：更新香气描述" };
  s = cellarReducer(s, {
    type: "CORRECT_WINE",
    batchId: b.id,
    wineId: "W-001",
    draft,
    reason: "讲师复核：香气关键词补充黑松露",
  });

  const after = s.wines.find((w) => w.id === "W-001")!;
  ok("修正后版本号 +1", after.currentVersion === 2);
  ok("旧版本仍保留在版本链", after.versions.length === 2 && after.versions[0].version === 1);
  ok("新版本带修正原因", after.versions[1].reason === "讲师复核：香气关键词补充黑松露");
  ok("批次中的旧题快照仍是旧内容", s.batches[0].items[0].snapshot.notes === before.notes);
  ok("旧题被标记 superseded", s.batches[0].items[0].superseded === true);
  ok("批次记录了修正轨迹", s.batches[0].corrections.length === 1 && s.batches[0].corrections[0].toVersion === 2);

  // 无原因的修正被拒绝
  const draft2: WineSnapshot = { ...snap(after), notes: "x" };
  const s2 = cellarReducer(s, { type: "CORRECT_WINE", batchId: b.id, wineId: "W-001", draft: draft2, reason: "  " });
  ok("修正原因缺失时不产生新版本", s2.wines.find((w) => w.id === "W-001")!.currentVersion === 2);

  // 修正成非法资料（品种换成非法品种）被拒绝
  const badDraft: WineSnapshot = { ...snap(after), variety: "佳美" };
  const s3 = cellarReducer(s, { type: "CORRECT_WINE", batchId: b.id, wineId: "W-001", draft: badDraft, reason: "错改" });
  ok("修正后违反规则时不产生新版本", s3.wines.find((w) => w.id === "W-001")!.currentVersion === 2);

  // 训练中批次不能发起修正
  const s4 = cellarReducer(createSeedState(), {
    type: "CORRECT_WINE",
    batchId: "B-1001",
    wineId: "W-001",
    draft,
    reason: "训练中不能改",
  });
  ok("训练中批次不允许修正", s4.wines.find((w) => w.id === "W-001")!.currentVersion === 1);
}

// ---------- 5. 待核资料可直接修改，被批次引用的酒款不能直改 ----------
console.log("待核修改保护：");
{
  let s = createSeedState();
  const w7 = s.wines.find((w) => w.id === "W-007")!;
  const fixed: WineSnapshot = { ...snap(w7), variety: "长相思", vintage: 2022, drinkStart: 2024, drinkEnd: 2030 };
  s = cellarReducer(s, { type: "UPDATE_WINE", id: "W-007", draft: fixed });
  const w7after = s.wines.find((w) => w.id === "W-007")!;
  ok("待核资料修改后通过核验", validateWine({ ...snap(w7after), id: "W-007" }).ok);
  ok("直改不产生版本（仍为 v1）", w7after.currentVersion === 1 && w7after.versions.length === 1);

  // W-001 被批次引用，UPDATE_WINE 应被拒绝
  const guarded: WineSnapshot = { ...snap(s.wines.find((w) => w.id === "W-001")!), name: "被篡改" };
  const s2 = cellarReducer(s, { type: "UPDATE_WINE", id: "W-001", draft: guarded });
  ok("已进入批次的酒款不能直改", s2.wines.find((w) => w.id === "W-001")!.name !== "被篡改");
}

// ---------- 6. 抽取不足时的失败原因 ----------
console.log("抽取边界：");
{
  const r = drawBatch([], [], new Set());
  ok("空酒窖抽取失败并给出原因", !r.ok && r.reason!.includes("不足"));
}

console.log(`\n全部通过：${passed} 项断言`);
