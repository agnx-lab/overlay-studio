/**
 * 场景：Overlay Studio 子应用常量。appId / panelId / 端口 / ensure 路径的唯一出处。
 * 端口 8131 为批次台账独占分配（避开 6767/3054/9333/8120-8127 等已占用号）。
 */
export const OVERLAY_STUDIO_APP_ID = "overlay-studio";
export const OVERLAY_STUDIO_PANEL_ID = "overlay-studio.main";
export const OVERLAY_STUDIO_OPEN_COMMAND_ID = "overlay-studio.open";
export const OVERLAY_STUDIO_ENSURE_TOOL_REL = ".agnx/tools/ensure-overlay-studio.mjs";
export const OVERLAY_STUDIO_DEFAULT_PORT = 8131;
