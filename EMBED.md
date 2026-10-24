# Overlay Studio · Agnx 子应用接入记录（EMBED.md）

> ## ⚠️ 许可证：源码公开（source available），**不是开源**
>
> 上游 Overlay Studio 使用**「Overlay Studio 公开版 · 免费使用授权协议 v1.0」**，明确声明
> **「软件本身不允许转售与商业再分发，因此不属于开源（OSI）许可」**。
>
> - ✅ 允许：免费安装/运行/不限次使用（含公司、学校等商业环境使用）；为自己修改；
>   用它做出的作品（导出的动效层、视频成片）**版权完全归使用者**，可任意商用；免费原样转发。
> - ❌ 禁止：**出售本软件或其修改版**；把它作为付费产品/服务/订阅/课程的交付物或赠品；
>   基于它搭建对外提供的同类产品或服务（SaaS/网站/小程序）；改名冒名；
>   移除或修改版权声明与协议文件；**将源代码用于训练机器学习模型**。
>
> **本子应用的处置**：只在本机以 dev server + Guest iframe 的方式**运行**上游，
> 不改上游业务代码、不转售、不对外提供服务。`manifest.description` 已同步标注
> 「源码公开(source available)许可，非 OSI 开源，禁止转售与商业再分发」。
>
> 上游协议原文：`upstream/LICENSE`、`upstream/LICENSE-EN`；网页内另有 EULA 授权门
> （`src/EulaGate.tsx`，同意状态存 localStorage，按协议文本 hash 失效）。
> 用户自己的视频/音效/字体授权由各自版权方规定，与上游协议无关。

---

## 上游嵌入

- **上游原生平台**：桌面 ❌ | 网页 ✅ | 移动 ❌
  - **依据**：上游是 **Vite + React 纯前端**（`motion-playground/package.json` 无 electron/tauri 依赖，
    无 `main`/`build.electron` 字段），README 快速开始即 `npm run dev` → `http://localhost:5177`；
    仓库不含任何 iOS/Android/Electron 工程目录，也没有 release 安装包。
  - **mobile=unsupported 依据**：上游 README 与设计定位是**桌面剪映/PR 工作流的配套工作台**
    （左侧 20 张卡列表 + 中间画布 + 右侧参数栏的三栏布局、依赖精确鼠标拖拽与滑杆、导出走无头 Chrome 逐帧渲染），
    **没有响应式移动端形态**；动效渲染是 GPU-heavy 的多层合成，官方没有为移动端做适配。
    按 skill §9.1「上游没做的平台不替它做」→ 标 `unsupported`，不补造移动端入口。
- **工作方式**：**原样嵌入（首选）** —— 上游可运行的独立 UI，直接起 Vite dev server 嵌进 Guest。
- **上游改动清单**：**无**（0 个源文件改动）。
  用 `diff -rq --exclude=node_modules --exclude=.git` 对比「原始浅克隆」与 `upstream/`，
  结果**完全一致**。端口不是靠改 `vite.config.ts`，而是用 Vite CLI 覆盖
  （命令行参数优先于配置文件）：
  ```
  npx vite --port 8131 --host 127.0.0.1 --open false
  ```
  仅有两处**非源码**的本地化处理，均不属于上游改动：
  1. `npm install` 时 `PUPPETEER_SKIP_DOWNLOAD=1`（puppeteer 的 postinstall 会拉一整份 Chrome，
     本机网络拉不动；puppeteer **只在导出透明 MOV 时**用，dev 预览/编辑不依赖它。
     现状：已装 node_modules，导出功能因缺 puppeteer Chrome **未验证**，见缺口表）。
  2. 运行期 `upstream/motion-playground/package-lock.json` 会被 `npm install` 顺手规范化
     （`version 0.0.0 → 1.1.1` 等元数据），已还原为上游原文。
- **挂载**：`guest.auth=none` / 策略 **direct-iframe**（无 cookie 会话，纯前端，不需要反代与桥）。
  `preferStrategy: "auto"`，`sidecar.supervised: true` + `ensureTool`。
- **上游**：`jeszhou/overlay-studio@e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`
  （2026-10-17，「自带 15 个默认音效…」）。本仓库副本位于 `upstream/`（2.8MB 源码，已排除 `.git`）。
- **宿主**：`apple/agnx@5dee6e13dab555023e9bd623a76f5fb1a76de8b6`。
- **端口**：`defaultPort=8131`（未占用 6767/3054/9333/9222/8081/8120-8127/3000/3001/3011/5173/5188）。
  上游默认 5177 + `strictPort: true`，已被 CLI 参数覆盖，**不需要改上游**。
  `extraPorts`：**无**（单端口应用，不存在第二个服务）。`server.open: true` 已被 `--open false` 关掉，
  否则每次宿主拉起 sidecar 都会在本机弹一个系统浏览器窗口。

### 面板与 Tab

| 面板 id | 名字 | 加载路径 | 说明 |
| --- | --- | --- | --- |
| `overlay-studio.main` | Overlay Studio | `ensureTool`（`.agnx/tools/ensure-overlay-studio.mjs`）→ 加载 `http://127.0.0.1:8131` | 唯一主面板，满铺、无 padding、`data-agnx-guest-surface-host`、`bootOverlay:false` |

命令：`overlay-studio.open`（侧栏 `defaultVisible: true`，order 71）。

### 真实启动命令（本机实测）

```bash
cd ~/.agnx-dev/apps/overlay-studio
node .agnx/tools/ensure-overlay-studio.mjs --port 8131 --work-dir data
# → {"ok":true,"reused":false,"origin":"http://127.0.0.1:8131","pid":...,"port":8131}
# 再跑一次 → {"ok":true,"reused":true,...}（已就绪复用，不重复 spawn）
```

ensure 脚本实际 spawn 的进程：
`cwd=upstream/motion-playground` +
`npx vite --port 8131 --host 127.0.0.1 --open false`，
日志 `~/.agnx-dev/apps/overlay-studio/.agnx-runtime/overlay-studio.log`。

### 验收证据（页面真交互，非 curl 冒烟）

- 截图：`logs/overlay-studio-page.png`（EULA 通过 → 点顶栏「🎬 示例」→ 17 张卡载入时间轴）
- 截图：`logs/overlay-studio-playback.png`（按空格播放，`TIME 0:05.1 / 0:28.0`、`CARDS 4/17`）
- 脚本：`.agnx/tools/smoke-page.mjs`（puppeteer 真点真截，断言 `CARDS n/17` 与时间轴 `0:28.0`）
- 断言输出：`{"ok":true,"cardsTotal":17,"timelineDuration":"0:28.0","hasEulaLeft":false}`
- `dist` 校验：`dist/index.js` 5.8KB，grep 到 `overlay-studio.main` / `overlay-studio.open` /
  `ensure-overlay-studio` / `overlay-studio-boot-overlay`；真实 `require()` 后 `activate` 能注册
  1 个 miniApp + 1 个 command，dispose 干净。

### 首次使用的三道人机交互（上游自带，非缺陷）

1. **EULA 授权门**：首次进入要滚动协议到底、点「✓ 我已阅读并同意」（存 localStorage，之后不再弹）。
2. **欢迎 confirm**：「👋 第一次来? 先载入一套 60 秒示例编排吧」——点确定即载入示例。
3. 顶栏「🎬 示例」：随时可再载入。

这三处都是上游产品行为，子应用**不注入、不篡改**。

---

## 嵌页宿主能力缺口

| 上游能力 | 信号位置 | 嵌后风险 | 处置 (A–E) | 主路径 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 导出透明 MOV（`POST /api/export` → 无头 Chrome 逐帧渲染） | `vite.config.ts` `overlayExport()`；`scripts/export-frames.mjs` | 本机 puppeteer 未下载 Chrome（网络拉不动），导出按钮点击后会失败；另需系统 `ffmpeg` | **A 记录不修** | 编辑/预览主路径不受影响；导出属上游进阶功能 | 若需导出：`cd upstream/motion-playground && npx puppeteer browsers install chrome`（需能连 Google CDN）+ `brew install ffmpeg` |
| 本机素材持久化（`POST /api/media`、`/api/upload-demo`） | `vite.config.ts` 两个中间件 | 视频写到 `upstream/motion-playground/public/_media/`、`public/demo/`——落在**子应用目录**内而非 `$AGNX_HOME/apps/data/overlay-studio/`，不符合 skill §二.5 | **A 记录不修** | 上游写死 `server.config.root`，改需动上游代码，按「不做太重」不改；两目录都在上游 `.gitignore` 内 | 卸载/重装子应用会丢已导入的视频；如需保留，建议后续以符号链接重定向到 data root |
| Google Fonts 外链（`index.html` 引 IBM Plex） | `index.html` `<link href="fonts.googleapis.com">` | 断网时页头会显示上游自带的「离线」提示条 | **A 记录不修** | 上游已优雅降级为系统字体 | 若断网横幅扰民，可后续做本机字体代理（非必需） |
| `window.open` / 官网页外链（顶栏「官网 ↗」） | `TopBar.tsx` | iframe 内可能被拦或误开在 Guest 里 | **B 交系统浏览器** | 外链属次要入口 | 当前未注入拦截逻辑，点「官网」若无反应不算主流程失败 |
| 键盘快捷键（空格播放等） | `App.tsx` 全局 keydown | 宿主若吞掉按键，播放快捷键失效 | **D 已处置** | 面板注册 `iframeShortcutCapture: true`，把键盘交给 Guest | — |

> 处置口径：A=记录不修 / B=交系统浏览器 / C=反代注入 / D=面板接管 / E=须改上游。
