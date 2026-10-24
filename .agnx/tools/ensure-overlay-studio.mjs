#!/usr/bin/env node
/**
 * 场景：overlay-studio 子应用的受管 sidecar 启动脚本。
 * 用法：node .agnx/tools/ensure-overlay-studio.mjs --port 8131 --work-dir <dataRoot> [--supervised]
 * 输出（stdout 最后一行 JSON）：
 *   - 已就绪复用：{"ok":true,"reused":true,"origin":"http://127.0.0.1:8131","pid":N}
 *   - 需拉起：    {"ok":true,"reused":false,"plan":{command,args,cwd,env,fingerprint,healthUrl,port}}
 *
 * 上游：jeszhou/overlay-studio（Vite + React 纯前端 dev server）。
 * 端口：上游 vite.config.ts 固定 port=5177 + strictPort。不改上游文件，靠 Vite CLI
 *   的「命令行参数优先于配置文件」语义覆盖：`npx vite --port <P> --host 127.0.0.1 --open false`。
 *   （`--open false` 必须给：上游 open:true，supervisor 拉起时每台机器都会弹系统浏览器。）
 * 健康检查：Vite dev server 对 `/` 返回 200 即视为就绪。
 * npm install：上游依赖已提前装好（PUPPETEER_SKIP_DOWNLOAD=1，puppeteer 只在导出时用）；
 *   本脚本检测 node_modules 缺失时自动补装。
 */
import { spawn } from "node:child_process";
import { access, constants as fsConstants, mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");
const APP_ID = "overlay-studio";
const STATE_FILE = "overlay-studio.json";
const DEFAULT_PORT = 8131;
const PLAYGROUND_DIR = path.join(appRoot, "upstream", "motion-playground");

function parseArgs(argv) {
  const out = {
    port: Number(process.env.OVERLAY_STUDIO_PORT ?? DEFAULT_PORT),
    workDir: process.env.AGNX_APP_DATA_ROOT || "",
    supervised: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--port" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) out.port = n;
      i += 1;
    } else if ((arg === "--work-dir" || arg === "--workDir") && next) {
      out.workDir = String(next).trim();
      i += 1;
    } else if (arg === "--supervised") {
      out.supervised = true;
    }
  }
  return out;
}

function healthOnce(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthOnce(url)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function exists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDeps() {
  if (await exists(path.join(PLAYGROUND_DIR, "node_modules", "vite"))) return;
  // 上游 puppeteer 的 postinstall 会去下 Chrome，dev server 用不到且常断网，跳过。
  await new Promise((resolve, reject) => {
    const child = spawn("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: PLAYGROUND_DIR,
      env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "1" },
      stdio: "ignore",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`npm install 退出码 ${code}`))));
    child.on("error", reject);
  });
}

function fingerprintOf(port, workDir) {
  return createHash("sha256").update(`${APP_ID}:${port}:${workDir}`).digest("hex").slice(0, 16);
}

function buildEnv() {
  // VITE_CJS_IGNORE_WARNING：静音 Vite 的 CJS 弃用提示，纯噪声。
  return {
    VITE_CJS_IGNORE_WARNING: "true",
    PUPPETEER_SKIP_DOWNLOAD: "1",
    PATH: process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = args.port;
  const origin = `http://127.0.0.1:${port}`;
  const healthUrl = `${origin}/`;

  const workDir = args.workDir ? path.resolve(args.workDir) : null;
  if (!workDir) {
    console.error("ENSURE_MISSING_DATA_ROOT: 需要 --work-dir 或 AGNX_APP_DATA_ROOT");
    process.exit(2);
  }
  await mkdir(workDir, { recursive: true });

  if (!(await exists(path.join(PLAYGROUND_DIR, "package.json")))) {
    console.error(`ENSURE_UPSTREAM_MISSING: ${PLAYGROUND_DIR}`);
    process.exit(3);
  }

  // 1) 端口已就绪 → 复用（避免重复 spawn 撞端口）
  if (await healthOnce(healthUrl)) {
    console.log(JSON.stringify({ ok: true, reused: true, origin, pid: null, port }));
    return;
  }

  await ensureDeps();

  const command = "npx";
  const cliArgs = ["vite", "--port", String(port), "--host", "127.0.0.1", "--open", "false"];
  const env = buildEnv();
  const fingerprint = fingerprintOf(port, workDir);
  const runtimeDir = path.join(appRoot, ".agnx-runtime");
  await mkdir(runtimeDir, { recursive: true });
  const logFile = path.join(runtimeDir, `${APP_ID}.log`);

  if (args.supervised) {
    // 只输出 plan，交给 daemon supervisor 拉起（它负责 pid / 日志 / 退出清理）
    console.log(
      JSON.stringify({
        ok: true,
        reused: false,
        plan: { command, args: cliArgs, cwd: PLAYGROUND_DIR, env, fingerprint, healthUrl, port, logFile },
      }),
    );
    return;
  }

  // 2) 短跑模式：自己 spawn（stdio 重定向到日志文件，绝不用 pipe）
  const out = (await import("node:fs")).openSync(logFile, "a");
  const child = spawn(command, cliArgs, {
    cwd: PLAYGROUND_DIR,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();

  const ok = await waitForHealth(healthUrl, 120_000);
  if (!ok) {
    console.error(`ENSURE_HEALTH_TIMEOUT: ${healthUrl}（日志：${logFile}）`);
    process.exit(4);
  }
  await writeFile(
    path.join(workDir, STATE_FILE),
    JSON.stringify({ appId: APP_ID, port, pid: child.pid, fingerprint, logFile }, null, 2),
    "utf8",
  );
  console.log(JSON.stringify({ ok: true, reused: false, origin, pid: child.pid, port }));
}

main().catch((err) => {
  console.error(`ENSURE_FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
