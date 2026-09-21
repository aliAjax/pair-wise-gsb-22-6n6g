import type { Wine, WineDraft } from "./types";

/**
 * 演示数据：5 款合规酒款覆盖 5 个不同产区，足够抽出一批；
 * 另有 3 款故意触发核验规则的酒款，用于展示“不得进入训练”与冲突清单。
 * 冲突酒款同样落库（带冲突标识），只是永远不会进入抽批池。
 *
 * 核验口径（按业务规则，非现实酿酒时间线）：年份不得早于灌装年份，
 * 即灌装年份必须 ≤ 采收年份；合规种子数据中灌装年份与年份相同。
 */

let seq = 0;
function w(
  draft: WineDraft & { name: string; appellationId: string },
  createdAt: number
): Wine {
  seq += 1;
  const id = `w${String(seq).padStart(2, "0")}`;
  return {
    ...draft,
    id,
    rootId: id,
    parentId: null,
    version: 1,
    status: "active",
    reason: null,
    supersededById: null,
    createdAt,
  };
}

const base = new Date("2026-09-01T09:00:00").getTime();
const day = 24 * 60 * 60 * 1000;

export const SEED_WINES: Wine[] = [
  w(
    {
      name: "波雅克正牌风格",
      appellationId: "bordeaux-left",
      vintage: 2016,
      bottledYear: 2016,
      varieties: ["赤霞珠", "美乐"],
      drinkWindowStart: 2024,
      drinkWindowEnd: 2046,
      notes: "黑醋栗、雪松、铅笔芯，单宁紧实",
    },
    base
  ),
  w(
    {
      name: "夜圣乔治村级",
      appellationId: "burgundy-red",
      vintage: 2019,
      bottledYear: 2019,
      varieties: ["黑皮诺"],
      drinkWindowStart: 2023,
      drinkWindowEnd: 2034,
      notes: "红樱桃、蘑菇、湿叶，中等酒体",
    },
    base + day
  ),
  w(
    {
      name: "橡树镇赤霞珠",
      appellationId: "napa-cab",
      vintage: 2018,
      bottledYear: 2018,
      varieties: ["赤霞珠"],
      drinkWindowStart: 2023,
      drinkWindowEnd: 2040,
      notes: "成熟黑果、薄荷、烤橡木",
    },
    base + 2 * day
  ),
  w(
    {
      name: "里奥哈珍藏",
      appellationId: "rioja-rioja",
      vintage: 2015,
      bottledYear: 2015,
      varieties: ["丹魄"],
      drinkWindowStart: 2022,
      drinkWindowEnd: 2038,
      notes: "香草、椰子、熟李子，美国桶明显",
    },
    base + 3 * day
  ),
  w(
    {
      name: "白中白干型香槟",
      appellationId: "champagne",
      vintage: 2015,
      bottledYear: 2015,
      varieties: ["霞多丽"],
      drinkWindowStart: 2022,
      drinkWindowEnd: 2035,
      notes: "柑橘、白花、烤杏仁，细腻气泡",
    },
    base + 4 * day
  ),

  // —— 以下 3 款触发核验规则，禁止进入训练 ——
  w(
    {
      // 西拉不属于香槟法定品种
      name: "误录·西拉香槟",
      appellationId: "champagne",
      vintage: 2017,
      bottledYear: 2017,
      varieties: ["西拉"],
      drinkWindowStart: 2022,
      drinkWindowEnd: 2032,
      notes: "录入时选错品种",
    },
    base + 5 * day
  ),
  w(
    {
      // 年份 2014 早于灌装 2020（违反“年份不得早于灌装”）
      name: "误录·年份早于灌装左岸",
      appellationId: "bordeaux-left",
      vintage: 2014,
      bottledYear: 2020,
      varieties: ["赤霞珠"],
      drinkWindowStart: 2026,
      drinkWindowEnd: 2040,
      notes: "年份与灌装年份不合规",
    },
    base + 6 * day
  ),
  w(
    {
      // 适饮区间 2035 > 2030 倒置
      name: "误录·适饮倒置纳帕",
      appellationId: "napa-cab",
      vintage: 2019,
      bottledYear: 2019,
      varieties: ["赤霞珠"],
      drinkWindowStart: 2035,
      drinkWindowEnd: 2030,
      notes: "适饮上下限填反",
    },
    base + 7 * day
  ),
];
