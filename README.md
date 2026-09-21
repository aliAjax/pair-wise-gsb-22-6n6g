# hxwl-08 葡萄酒盲品训练 · 酒款资料核验与训练批次闭环

录入酒款绑定产区、法定品种、年份、灌装年份与适饮区间；核验不通过的酒款不得进入训练；
每批抽取三款不同产区且同一酒款未完成前只出现一次；讲师复核后才能归档；
复核修正在版本链上追加带原因的新版本并保留旧题；刷新后数据一致。

## 技术栈

React 19 + Vite + TypeScript + CSS（无其他运行时依赖）

## 分层实现（数据 / 校验 / 页面分开）

```
src/
├── data/                 # 数据层：只存数据，不实现规则
│   ├── types.ts          # 领域模型：Wine 版本链、Batch、Conflict 及规则元数据
│   ├── appellations.ts   # 法定产区目录（产区 → 法定品种）
│   ├── seed.ts           # 5 款合规 + 3 款故意违规的演示酒款
│   └── store.ts          # Store：localStorage 持久化、版本追加、批次写入
├── validation/
│   └── rules.ts          # 纯函数核验规则（无 IO、无 React）
├── training/
│   └── batch.ts          # 纯函数：抽批池、三款不同产区抽取、批次状态机
├── ui/                   # 页面层：只调用上面三层
│   ├── useStore.ts       # useSyncExternalStore 订阅
│   ├── WineForm.tsx      # 录入 / 复核修正表单（实时核验预览）
│   ├── ConflictPanel.tsx # 冲突清单：酒款 / 字段 / 原值 / 规则
│   ├── BatchBoard.tsx    # 抽批、完成、讲师复核、归档
│   └── WineLibrary.tsx   # 版本链视图（旧题保留）
└── __tests__/core.test.ts
```

## 核验规则（阻断即不得进入训练）

| 规则 | 字段 | 触发条件 |
| --- | --- | --- |
| `REQUIRED_FIELD_MISSING` | 全部必填项 | 酒款名 / 产区 / 年份 / 灌装 / 适饮起止 / 品种缺失 |
| `APPELLATION_VARIETY_ILLEGAL` | 葡萄品种 | 品种不属于所选产区的法定品种（每个非法品种单列一条） |
| `VINTAGE_BEFORE_BOTTLING` | 年份/灌装年份 | 采收年份早于灌装年份 |
| `DRINK_WINDOW_INVERTED` | 适饮区间 | 适饮起始年晚于结束年 |

冲突酒款仍会落库并出现在冲突看板（酒款 / 字段 / 原值 / 规则 / 说明），但永远不会进入抽批池。

## 批次闭环

- 抽批池 = 核验通过的当前版本 − 未完成批次占用（按版本链根 id 计）
- 一批 3 款，产区互不相同；不足 3 个产区时禁止开批
- 同一酒款（含修正出的新版本）在其批次未归档前不会再次出现，归档后释放
- 状态机：`训练中 → 待讲师复核 →（复核意见必填）→ 已复核 → 归档`
- 讲师可在待复核阶段打回复训；**未复核不能归档**
- 批次内固化酒款快照；之后修正生成新版本，旧题快照不变，仅登记“已修正”指针

## 版本链

修正不覆盖旧数据：旧版本标记 `superseded` 并完整保留，新版本带 `reason`、`parentId`、
自增 `version` 指向同一 `rootId`。酒款库按版本链展示全部历史版本与修正原因。

## 持久化

单一状态对象（wines + batches）写入 `localStorage`（键 `blind-tasting-dashboard:v1`），
刷新后由 store 重新 hydrate，酒款、批次、版本链保持一致。页面右上角可恢复演示数据。

## 本地运行

```bash
npm install
npm run dev       # http://localhost:5108
npm test          # 18 项核心逻辑测试（esbuild + node:test，无需浏览器）
npm run build     # tsc --noEmit + vite build
```
