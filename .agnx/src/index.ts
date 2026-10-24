/**
 * 场景：Overlay Studio 子应用入口 —— 注册一个主面板（= 一类 Tab）+ 一个打开命令。
 */
import type { WorkspaceAppHostApi, WorkspaceAppModule } from "@agnx-lab/app-sdk";
import {
  OVERLAY_STUDIO_APP_ID,
  OVERLAY_STUDIO_OPEN_COMMAND_ID,
  OVERLAY_STUDIO_PANEL_ID,
} from "./constants";
import { bindOverlayStudioHost, OverlayStudioPanel } from "./panel";

export const appId = OVERLAY_STUDIO_APP_ID;

export function activate(host: WorkspaceAppHostApi): () => void {
  bindOverlayStudioHost(host);

  const disposers: Array<() => void> = [];

  disposers.push(
    host.registerMiniApp({
      id: OVERLAY_STUDIO_PANEL_ID,
      appId: OVERLAY_STUDIO_APP_ID,
      title: "Overlay Studio",
      component: OverlayStudioPanel,
      primaryPanel: true,
      iframeShortcutCapture: true,
    }),
  );

  disposers.push(
    host.registerCommand({
      id: OVERLAY_STUDIO_OPEN_COMMAND_ID,
      appId: OVERLAY_STUDIO_APP_ID,
      title: "Overlay Studio",
      keywords: ["overlay", "studio", "动效", "口播", "视频"],
      sidebarAction: { defaultVisible: true, label: "Overlay Studio", order: 71 },
      run: (context) => {
        host.openSubAppTab({
          appId: OVERLAY_STUDIO_APP_ID,
          panelId: OVERLAY_STUDIO_PANEL_ID,
          serverId: context?.serverId,
          workspaceId: context?.workspaceId,
          currentPathname: context?.currentPathname,
        });
      },
    }),
  );

  return () => {
    for (const d of disposers.toReversed()) d();
  };
}

const moduleExport: WorkspaceAppModule = { appId: OVERLAY_STUDIO_APP_ID, activate };
export default moduleExport;
