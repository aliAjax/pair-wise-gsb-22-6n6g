#!/usr/bin/env node
/**
 * 核心逻辑测试运行器：用 vite 自带的 esbuild 将 TS 测试打包为 CJS，
 * 再交给 node 内置 test runner，无需浏览器即可验证数据/校验/批次闭环。
 */
const { build } = require("esbuild");
const { run } = require("node:test");
const { spec: specReporter } = require("node:test/reporters");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const ENTRY = path.resolve(__dirname, "..", "src", "__tests__", "core.test.ts");
const OUT = path.join(os.tmpdir(), `blind-tasting-tests-${process.pid}.cjs`);

async function main() {
  await build({
    entryPoints: [ENTRY],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: OUT,
    logLevel: "silent",
  });

  const stream = run({ files: [OUT] });
  stream.on("test:fail", () => {
    process.exitCode = 1;
  });
  stream.compose(specReporter).pipe(process.stdout);
  await new Promise((resolve) => stream.on("end", resolve));
  fs.rmSync(OUT, { force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
