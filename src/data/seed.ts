import type { CellarState, Wine, WineSnapshot } from "./types";

// ============ 数据层：初始种子数据 ============
// 规则口径（与需求逐条对应）：
//   品种不符法定产区 -> 品种不在产区法定品种表内
//   年份早于灌装     -> 年份 < 灌装年份
//   适饮区间倒置     -> 适饮起始 > 适饮截止
// 因此合规种子酒款的年份均不早于灌装年份；
// 最后一款“马尔堡样酒（待核）”同时触发全部三条规则，用于演示冲突清单。

interface SeedWine extends WineSnapshot {
  id: string;
  createdAt: string;
}

const SEED_WINES: SeedWine[] = [
  {
    id: "W-001",
    name: "左岸古堡正牌",
    appellationId: "bordeaux-medoc",
    variety: "赤霞珠",
    vintage: 2018,
    bottlingYear: 2018,
    drinkStart: 2023,
    drinkEnd: 2048,
    notes: "黑醋栗、雪松、铅笔芯，单宁细密",
    createdAt: "2026-09-10T09:12:00.000Z",
  },
  {
    id: "W-002",
    name: "热夫雷-香贝丹村级",
    appellationId: "bourgogne-cotedor-rouge",
    variety: "黑皮诺",
    vintage: 2019,
    bottlingYear: 2019,
    drinkStart: 2022,
    drinkEnd: 2039,
    notes: "红樱桃、蘑菇、湿叶，中等酒体",
    createdAt: "2026-09-10T09:18:00.000Z",
  },
  {
    id: "W-003",
    name: "里奥哈特级珍藏",
    appellationId: "rioja-doc",
    variety: "丹魄",
    vintage: 2012,
    bottlingYear: 2012,
    drinkStart: 2018,
    drinkEnd: 2042,
    notes: "香草、椰子、熟李子，美式橡木明显",
    createdAt: "2026-09-10T09:25:00.000Z",
  },
  {
    id: "W-004",
    name: "纳帕谷庄园赤霞珠",
    appellationId: "napa-cabernet",
    variety: "赤霞珠",
    vintage: 2016,
    bottlingYear: 2016,
    drinkStart: 2020,
    drinkEnd: 2040,
    notes: "熟黑果、薄荷、烤橡木，酒体饱满",
    createdAt: "2026-09-11T14:02:00.000Z",
  },
  {
    id: "W-005",
    name: "巴罗洛村酒王",
    appellationId: "barolo-docg",
    variety: "内比奥罗",
    vintage: 2017,
    bottlingYear: 2017,
    drinkStart: 2025,
    drinkEnd: 2047,
    notes: "玫瑰、焦油、红樱桃，高酸高单宁",
    createdAt: "2026-09-11T14:10:00.000Z",
  },
  {
    id: "W-006",
    name: "夏布利一级园干白",
    appellationId: "chablis",
    variety: "霞多丽",
    vintage: 2020,
    bottlingYear: 2020,
    drinkStart: 2022,
    drinkEnd: 2030,
    notes: "柠檬、白桃、燧石矿物质",
    createdAt: "2026-09-12T08:40:00.000Z",
  },
  {
    id: "W-007",
    name: "马尔堡样酒（待核）",
    appellationId: "marlborough-sb",
    // 冲突1：佳美不是马尔堡法定品种
    variety: "佳美",
    // 冲突2：年份 2021 早于灌装 2022
    vintage: 2021,
    bottlingYear: 2022,
    // 冲突3：适饮区间倒置（2030 > 2026）
    drinkStart: 2030,
    drinkEnd: 2026,
    notes: "录入信息待核验",
    createdAt: "2026-09-15T11:00:00.000Z",
  },
];

function toWine(s: SeedWine): Wine {
  const { id, createdAt, ...snapshot } = s;
  return {
    ...snapshot,
    id,
    createdAt,
    updatedAt: createdAt,
    currentVersion: 1,
    versions: [
      { version: 1, reason: "录入", createdAt, snapshot: { ...snapshot } },
    ],
  };
}

export function createSeedState(): CellarState {
  const wines = SEED_WINES.map(toWine);
  const find = (id: string) => wines.find((w) => w.id === id)!;
  const item = (w: Wine, done: boolean) => {
    const snapshot: WineSnapshot = {
      name: w.name,
      appellationId: w.appellationId,
      variety: w.variety,
      vintage: w.vintage,
      bottlingYear: w.bottlingYear,
      drinkStart: w.drinkStart,
      drinkEnd: w.drinkEnd,
      notes: w.notes,
    };
    return { wineId: w.id, version: w.currentVersion, snapshot, done };
  };

  return {
    wines,
    batches: [
      {
        id: "B-1001",
        createdAt: "2026-09-19T10:00:00.000Z",
        // 三款分属波尔多 / 勃艮第 / 里奥哈三个不同产区
        status: "in_training",
        items: [item(find("W-001"), true), item(find("W-002"), false), item(find("W-003"), false)],
        corrections: [],
      },
    ],
  };
}
