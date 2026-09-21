import type { Appellation } from "./types";

/**
 * 法定产区目录。抽批按 region 保证三款不同产区；
 * 品种必须命中该产区的 legalVarieties，否则核验阻断。
 */
export const APPELLATIONS: Appellation[] = [
  {
    id: "bordeaux-left",
    region: "波尔多",
    name: "梅多克（左岸）",
    legalVarieties: ["赤霞珠", "美乐", "品丽珠", "小维尔多", "马尔贝克"],
  },
  {
    id: "bordeaux-right",
    region: "波尔多",
    name: "圣埃美隆（右岸）",
    legalVarieties: ["美乐", "品丽珠", "赤霞珠"],
  },
  {
    id: "burgundy-red",
    region: "勃艮第",
    name: "夜丘红葡萄酒",
    legalVarieties: ["黑皮诺"],
  },
  {
    id: "napa-cab",
    region: "纳帕谷",
    name: "纳帕赤霞珠",
    legalVarieties: ["赤霞珠", "美乐", "品丽珠"],
  },
  {
    id: "rioja-rioja",
    region: "里奥哈",
    name: "DOCa 里奥哈",
    legalVarieties: ["丹魄", "歌海娜", "格拉西亚诺", "马士罗"],
  },
  {
    id: "champagne",
    region: "香槟",
    name: "香槟起泡酒",
    legalVarieties: ["霞多丽", "黑皮诺", "莫尼耶皮诺"],
  },
];

export function getAppellation(id: string): Appellation | undefined {
  return APPELLATIONS.find((a) => a.id === id);
}
