import { test } from "node:test";
import assert from "node:assert/strict";
import { validateWine, isEligible } from "../validation/rules";
import {
  buildDrawPool,
  drawBatch,
  eligibleWines,
  occupiedRootIds,
  completeBatch,
  reviewBatch,
  archiveBatch,
  reopenBatch,
  FlowError,
} from "../training/batch";
import { Store, makeBatchItem, versionChains, seedState } from "../data/store";
import type { AppState, Batch, WineDraft } from "../data/types";
import { SEED_WINES } from "../data/seed";

function memoryStore(): Store {
  const map = new Map<string, string>();
  return new Store({
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
  });
}

const validDraft: WineDraft = {
  name: "测试酒款",
  appellationId: "burgundy-red",
  vintage: 2020,
  bottledYear: 2020,
  varieties: ["黑皮诺"],
  drinkWindowStart: 2024,
  drinkWindowEnd: 2034,
};

// ---------- 校验层 ----------

test("合规酒款核验通过", () => {
  const conflicts = validateWine({ ...validDraft });
  assert.equal(conflicts.length, 0);
  assert.equal(isEligible(conflicts), true);
});

test("品种不符法定产区：逐个品种列出冲突且阻断训练", () => {
  const conflicts = validateWine({
    ...validDraft,
    appellationId: "champagne",
    varieties: ["霞多丽", "西拉"],
  });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].rule, "APPELLATION_VARIETY_ILLEGAL");
  assert.equal(conflicts[0].field, "葡萄品种");
  assert.equal(conflicts[0].originalValue, "西拉");
  assert.equal(conflicts[0].blocking, true);
});

test("年份早于灌装年份：阻断", () => {
  const conflicts = validateWine({ ...validDraft, vintage: 2019, bottledYear: 2022 });
  assert.equal(conflicts.some((c) => c.rule === "VINTAGE_BEFORE_BOTTLING"), true);
  assert.equal(isEligible(conflicts), false);
});

test("适饮区间倒置：阻断", () => {
  const conflicts = validateWine({
    ...validDraft,
    drinkWindowStart: 2035,
    drinkWindowEnd: 2030,
  });
  assert.equal(conflicts.some((c) => c.rule === "DRINK_WINDOW_INVERTED"), true);
});

test("必填缺失：年份为空也阻断", () => {
  const conflicts = validateWine({ ...validDraft, vintage: null, varieties: [] });
  const rules = conflicts.map((c) => c.rule);
  assert.ok(rules.includes("REQUIRED_FIELD_MISSING"));
});

// ---------- 抽批层 ----------

test("种子池中只有 5 款合规酒款可进入训练，3 款冲突酒款被排除", () => {
  const state = seedState();
  const eligible = eligibleWines(state.wines);
  assert.equal(eligible.length, 5);
  assert.ok(eligible.every((w) => !w.name.startsWith("误录")));
});

test("每批抽取三款不同产区", () => {
  const state = seedState();
  let seed = 42;
  const picked = drawBatch(state, () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  });
  assert.equal(picked.length, 3);
  const regionOf = (appellationId: string): string => {
    const map: Record<string, string> = {
      "bordeaux-left": "波尔多",
      "bordeaux-right": "波尔多",
      "burgundy-red": "勃艮第",
      "napa-cab": "纳帕谷",
      "rioja-rioja": "里奥哈",
      champagne: "香槟",
    };
    return map[appellationId];
  };
  const regions = picked.map((w) => regionOf(w.appellationId));
  assert.equal(new Set(regions).size, 3);
});

test("同一酒款在未完成批次中只出现一次（占用即不可再抽）", () => {
  const state: AppState = seedState();
  const pool0 = buildDrawPool(state);
  assert.equal(pool0.pool.length, 5);
  const picked = pool0.pool.slice(0, 3);
  const openBatch: Batch = {
    id: "b1",
    status: "open",
    items: picked.map(makeBatchItem),
    reviewNote: null,
    createdAt: Date.now(),
    completedAt: null,
    reviewedAt: null,
    archivedAt: null,
  };
  state.batches = [openBatch];
  const occupied = occupiedRootIds(state);
  assert.equal(occupied.size, 3);
  const pool1 = buildDrawPool(state);
  assert.ok(pool1.pool.every((w) => !occupied.has(w.rootId)));
});

test("已归档批次释放占用，酒款可再次入池", () => {
  const state: AppState = seedState();
  const picked = eligibleWines(state.wines).slice(0, 3);
  state.batches = [
    {
      id: "b1",
      status: "archived",
      items: picked.map(makeBatchItem),
      reviewNote: "无",
      createdAt: Date.now() - 2000,
      completedAt: Date.now() - 1000,
      reviewedAt: Date.now() - 500,
      archivedAt: Date.now(),
    },
  ];
  assert.equal(occupiedRootIds(state).size, 0);
  assert.equal(buildDrawPool(state).pool.length, 5);
});

test("修正产生新版本后，旧批次未完成前同一酒款仍不得再次被抽中", () => {
  const store = memoryStore();
  const picked = drawBatch(store.getState(), () => 0.5);
  store.createBatch({
    id: "b-root",
    status: "open",
    items: picked.map(makeBatchItem),
    reviewNote: null,
    createdAt: Date.now(),
    completedAt: null,
    reviewedAt: null,
    archivedAt: null,
  });
  const target = picked[0];
  store.correctWine(
    target.id,
    {
      name: target.name,
      appellationId: target.appellationId,
      vintage: target.vintage,
      bottledYear: target.bottledYear,
      varieties: target.varieties,
      drinkWindowStart: target.drinkWindowStart,
      drinkWindowEnd: (target.drinkWindowEnd as number) + 1,
    },
    "复核微调适饮期"
  );
  const state = store.getState();
  const occupied = occupiedRootIds(state);
  const newVersion = state.wines.find((w) => w.parentId === target.id)!;
  assert.ok(occupied.has(newVersion.rootId));
  assert.ok(!buildDrawPool(state).pool.some((w) => w.rootId === target.rootId));
});

test("可用产区不足 3 个时无法抽批", () => {
  const state = seedState();
  state.wines = state.wines.filter((w) => w.appellationId !== "champagne");
  // 只剩 4 个产区仍可抽；再压到 2 个
  state.wines = state.wines.filter(
    (w) => !["rioja-rioja", "napa-cab"].includes(w.appellationId)
  );
  assert.throws(() => drawBatch(state, () => 0.5), FlowError);
});

// ---------- 批次状态机 ----------

function freshBatch(state: AppState): Batch {
  const picked = drawBatch(state, () => 0.5);
  return {
    id: "b-flow",
    status: "open",
    items: picked.map(makeBatchItem),
    reviewNote: null,
    createdAt: Date.now(),
    completedAt: null,
    reviewedAt: null,
    archivedAt: null,
  };
}

test("未完成讲师复核不得归档", () => {
  const state = seedState();
  const b = freshBatch(state);
  assert.throws(() => archiveBatch(b), FlowError);
  const completed = completeBatch(b);
  assert.equal(completed.status, "completed");
  assert.throws(() => archiveBatch(completed), FlowError);
  assert.throws(() => reviewBatch(completed, "  "), FlowError);
  const reviewed = reviewBatch(completed, "三款典型性良好");
  assert.equal(reviewed.status, "reviewed");
  const archived = archiveBatch(reviewed);
  assert.equal(archived.status, "archived");
  assert.ok(archived.archivedAt);
});

test("待复核批次可被讲师打回重新训练", () => {
  const state = seedState();
  const completed = completeBatch(freshBatch(state));
  const reopened = reopenBatch(completed);
  assert.equal(reopened.status, "open");
  assert.equal(reopened.completedAt, null);
});

// ---------- 版本链与持久化 ----------

test("修正生成带原因的新版本，旧题保留且被标记 superseded", () => {
  const store = memoryStore();
  const added = store.addWine({
    ...validDraft,
    appellationId: "champagne",
    varieties: ["西拉"], // 故意非法
  });
  assert.equal(added.eligible, false);

  const fixed = store.correctWine(
    added.wine.id,
    { ...validDraft, appellationId: "champagne", varieties: ["黑皮诺"] },
    "品种选错，香槟法定红葡萄应为黑皮诺"
  );
  assert.equal(fixed.eligible, true);
  assert.equal(fixed.wine.version, 2);
  assert.equal(fixed.wine.rootId, added.wine.rootId);
  assert.equal(fixed.wine.parentId, added.wine.id);
  assert.equal(fixed.wine.status, "active");

  const all = store.getState().wines;
  const old = all.find((w) => w.id === added.wine.id)!;
  assert.equal(old.status, "superseded");
  assert.equal(old.supersededById, fixed.wine.id);
  // 旧题保留、原因保留
  assert.equal(old.varieties[0], "西拉");
  assert.equal(fixed.wine.reason, "品种选错，香槟法定红葡萄应为黑皮诺");

  const chains = versionChains(all);
  const chain = chains.find((c) => c[0].rootId === added.wine.rootId)!;
  assert.deepEqual(
    chain.map((w) => w.version),
    [1, 2]
  );
});

test("修正必须带原因，且只能修正当前版本", () => {
  const store = memoryStore();
  const added = store.addWine(validDraft);
  assert.throws(
    () => store.correctWine(added.wine.id, validDraft, "  "),
    /原因/
  );
  const fixed = store.correctWine(added.wine.id, { ...validDraft, vintage: 2018 }, "年份笔误");
  assert.throws(
    () => store.correctWine(added.wine.id, validDraft, "再改一次"),
    /当前有效版本/
  );
  assert.equal(fixed.wine.version, 2);
});

test("刷新后（重新 hydrate）酒款、批次、版本链一致", () => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
  const store1 = new Store(storage);
  const added = store1.addWine(validDraft);
  store1.correctWine(added.wine.id, { ...validDraft, vintage: 2018 }, "年份修正");
  const picked = drawBatch(store1.getState(), () => 0.5);
  store1.createBatch({
    id: "persist-b1",
    status: "open",
    items: picked.map(makeBatchItem),
    reviewNote: null,
    createdAt: Date.now(),
    completedAt: null,
    reviewedAt: null,
    archivedAt: null,
  });

  // 模拟刷新：用同一存储重新构造 store
  const store2 = new Store(storage);
  const state2 = store2.getState();
  const chains = versionChains(state2.wines);
  assert.ok(chains.some((c) => c.some((w) => w.reason === "年份修正")));
  assert.equal(state2.batches.length, 1);
  assert.equal(state2.batches[0].id, "persist-b1");
  assert.equal(state2.batches[0].items.length, 3);
  // 旧版本依旧在
  assert.ok(state2.wines.some((w) => w.id === added.wine.id && w.status === "superseded"));
});

test("未归档批次引用旧版本时，修正会在批次上留下修正指针", () => {
  const store = memoryStore();
  const picked = drawBatch(store.getState(), () => 0.5);
  store.createBatch({
    id: "b-link",
    status: "completed",
    items: picked.map(makeBatchItem),
    reviewNote: null,
    createdAt: Date.now() - 1000,
    completedAt: Date.now(),
    reviewedAt: null,
    archivedAt: null,
  });
  const target = picked[0];
  const appellation = target.appellationId;
  const fixed = store.correctWine(
    target.id,
    {
      name: target.name + "（复核修正）",
      appellationId: appellation,
      vintage: target.vintage,
      bottledYear: target.bottledYear,
      varieties: target.varieties,
      drinkWindowStart: target.drinkWindowStart,
      drinkWindowEnd: (target.drinkWindowEnd as number) + 2,
    },
    "讲师复核：适饮结束年偏短"
  );
  const batch = store.getState().batches.find((b) => b.id === "b-link")!;
  const item = batch.items.find((i) => i.wineId === target.id)!;
  assert.equal(item.correctedToId, fixed.wine.id);
  // 快照（旧题）不被改写
  assert.notEqual(item.snapshot.drinkWindowEnd, (target.drinkWindowEnd as number) + 2);
});

test("种子数据自身结构完整（8 款酒，5 个合规产区）", () => {
  assert.equal(SEED_WINES.length, 8);
  assert.equal(new Set(SEED_WINES.map((w) => w.appellationId)).size >= 5, true);
});
