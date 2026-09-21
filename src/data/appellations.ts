import type { Appellation } from "./types";

// ============ 数据层：法定产区目录 ============
// 产区与其法定品种的绑定关系，是“品种不符法定产区”规则的依据。

export const APPELLATIONS: Appellation[] = [
  {
    id: "bordeaux-medoc",
    region: "法国 · 波尔多",
    name: "梅多克 AOC",
    legalVarieties: ["赤霞珠", "美乐", "品丽珠", "味而多", "马贝克"],
  },
  {
    id: "bourgogne-cotedor-rouge",
    region: "法国 · 勃艮第",
    name: "金丘红 AOC",
    legalVarieties: ["黑皮诺"],
  },
  {
    id: "rioja-doc",
    region: "西班牙 · 里奥哈",
    name: "里奥哈 DOCa",
    legalVarieties: ["丹魄", "歌海娜", "格拉西亚诺", "马士罗"],
  },
  {
    id: "napa-cabernet",
    region: "美国 · 纳帕谷",
    name: "纳帕谷 AVA",
    legalVarieties: ["赤霞珠", "美乐", "品丽珠", "味而多"],
  },
  {
    id: "barolo-docg",
    region: "意大利 · 皮埃蒙特",
    name: "巴罗洛 DOCG",
    legalVarieties: ["内比奥罗"],
  },
  {
    id: "chablis",
    region: "法国 · 夏布利",
    name: "夏布利 AOC",
    legalVarieties: ["霞多丽"],
  },
  {
    id: "marlborough-sb",
    region: "新西兰 · 马尔堡",
    name: "马尔堡",
    legalVarieties: ["长相思"],
  },
  {
    id: "beaujolais",
    region: "法国 · 博若莱",
    name: "博若莱 AOC",
    legalVarieties: ["佳美"],
  },
];

const appellationMap = new Map(APPELLATIONS.map((a) => [a.id, a]));

export function getAppellation(id: string): Appellation | undefined {
  return appellationMap.get(id);
}

export function isLegalVariety(appellationId: string, variety: string): boolean {
  const a = appellationMap.get(appellationId);
  if (!a || !variety.trim()) return false;
  return a.legalVarieties.includes(variety.trim());
}
