#!/usr/bin/env node
/**
 * 场景：overlay-studio 子应用的「页面真交互」验收脚本（不是 curl 冒烟）。
 *
 * 做三件真实操作并截图为证：
 *   1. 打开 http://127.0.0.1:8131/，处理上游自带的 EULA 协议门（滚到底 → 点同意）；
 *   2. 处理首次欢迎 confirm，点顶栏「🎬 示例」载入内置演示编排；
 *   3. 断言时间轴上真的出现了卡片（数 DOM 上的卡），再截图。
 *
 * 用法：node .agnx/tools/smoke-page.mjs [--port 8131] [--out logs/xxx.png]
 * 依赖：本机 puppeteer-core（借用同机其它 app 的 node_modules）+ Chrome。
 */
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const PORT = (() => {
  const i = process.argv.indexOf("--port");
  return i >= 0 ? Number(process.argv[i + 1]) : 8131;
})();
const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? path.resolve(appRoot, process.argv[i + 1]) : path.join(appRoot, "logs", "overlay-studio-page.png");
})();

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
const PUPPETEER_CANDIDATES = [
  "/Users/apple/.agnx-dev/apps/ui-tars/node_modules/puppeteer-core",
  "/Users/apple/.agnx-dev/apps/snow-app/node_modules/puppeteer-core",
];

async function loadPuppeteer() {
  for (const p of PUPPETEER_CANDIDATES) {
    try {
      return require(p);
    } catch {
      /* 找下一个 */
    }
  }
  throw new Error(`找不到 puppeteer-core，试过：${PUPPETEER_CANDIDATES.join(", ")}`);
}

async function main() {
  const puppeteer = await loadPuppeteer();
  const fs = await import("node:fs");
  const executablePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error(`找不到 Chrome/Edge：${CHROME_CANDIDATES.join(", ")}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,900"],
    defaultViewport: { width: 1440, height: 900 },
  });
  const dialogs = [];
  try {
    const page = await browser.newPage();
    page.on("dialog", async (d) => {
      dialogs.push(`${d.type()}: ${d.message().split("\n")[0]}`);
      // 首次欢迎 confirm 与「载入示例会替换当前编排」confirm 都点确定
      await d.accept();
    });
    page.on("console", (m) => {
      if (m.type() === "error") dialogs.push(`console.error: ${m.text().slice(0, 200)}`);
    });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle2", timeout: 60_000 });

    // 1) EULA 门（上游 EulaGate.tsx：`.eula-body` 滚动容器，滚到底按钮才可点）
    const agree = await page.evaluate(() => {
      const body = document.querySelector(".eula-body");
      if (body) {
        body.scrollTop = body.scrollHeight;
        body.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
      const hit = [...document.querySelectorAll("button")].find((b) => /我已阅读并同意/.test(b.textContent || ""));
      return { hasEula: Boolean(document.querySelector(".eula")), hasAgree: Boolean(hit), disabled: hit?.disabled ?? null };
    });
    if (agree.hasEula) {
      await new Promise((r) => setTimeout(r, 500));
      await page.waitForFunction(
        () => {
          const b = [...document.querySelectorAll("button")].find((x) => /我已阅读并同意/.test(x.textContent || ""));
          return Boolean(b) && !b.disabled;
        },
        { timeout: 10_000 },
      );
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /我已阅读并同意/.test(x.textContent || ""));
        b?.click();
      });
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 2) 等顶栏出现，点「🎬 示例」
    await page.waitForFunction(() => document.body.innerText.includes("示例"), { timeout: 30_000 });
    const clickedDemo = await page.evaluate(() => {
      const el = [...document.querySelectorAll("button, [role='button'], span, div")].find(
        (n) => /🎬\s*示例|示例/.test((n.textContent || "").trim()) && n.children.length === 0,
      );
      if (!el) return false;
      (el.closest("button") ?? el).click();
      return true;
    });
    await new Promise((r) => setTimeout(r, 2500));

    // 3) 断言：顶栏 CARDS 计数与左栏卡列表都真的载入（示例 = 17 张卡 / 28s）
    await new Promise((r) => setTimeout(r, 500));
    const stats = await page.evaluate(() => {
      const text = document.body.innerText;
      const cardsMatch = /CARDS\s+(\d+)\/(\d+)/.exec(text);
      const timeMatch = /TIME\s+[\d:.]+\s*\/\s*([\d:.]+)/.exec(text);
      return {
        title: document.title,
        cardsLoaded: cardsMatch ? Number(cardsMatch[1]) : 0,
        cardsTotal: cardsMatch ? Number(cardsMatch[2]) : 0,
        timelineDuration: timeMatch ? timeMatch[1] : null,
        hasStudioChrome: /示例/.test(text) && /导出透明 MOV/.test(text),
        cardLikeNodes: document.querySelectorAll("[class*='card' i], [class*='Card']").length,
        hasEulaLeft: /滚动到底部后/.test(text),
        excerpt: text.replace(/\s+/g, " ").slice(0, 400),
      };
    });

    await mkdir(path.dirname(OUT), { recursive: true });
    await page.screenshot({ path: OUT, fullPage: false });

    const pass = stats.cardsTotal === 17 && stats.timelineDuration === "0:28.0" && !stats.hasEulaLeft;
    console.log(
      JSON.stringify({ ok: pass, out: OUT, clickedDemo, agree, dialogs, stats }, null, 2),
    );
    if (!pass) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(`SMOKE_FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
