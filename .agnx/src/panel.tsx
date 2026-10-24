/**
 * 场景：Overlay Studio 主面板 —— 满铺挂载 Guest 嵌入面（走 ensureTool sidecar，端口 8131）。
 * 硬约束：根与 guest host 不允许 padding / margin；失败态才允许带 padding 的 fallback。
 */
import { useEffect, useRef, useState, type CSSProperties, type ComponentType, type ReactElement } from "react";
import type { WorkspaceAppBrandLogoLoaderPanelProps, WorkspaceAppHostApi } from "@agnx-lab/app-sdk";
import {
  OVERLAY_STUDIO_APP_ID,
  OVERLAY_STUDIO_DEFAULT_PORT,
  OVERLAY_STUDIO_ENSURE_TOOL_REL,
} from "./constants";

const WEB_ROOT_STYLE: CSSProperties = {
  flex: "1 1 0%",
  alignSelf: "stretch",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};
const GUEST_HOST_STYLE: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};
const LAYER: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  background: "rgb(9,9,11)",
};
const ERROR_BOX: CSSProperties = { padding: 24, color: "#fca5a5", fontSize: 13, lineHeight: 1.6 };

let boundHost: WorkspaceAppHostApi | null = null;
export function bindOverlayStudioHost(host: WorkspaceAppHostApi): void {
  boundHost = host;
}
function host(): WorkspaceAppHostApi {
  if (!boundHost) throw new Error("Overlay Studio host 未绑定");
  return boundHost;
}

export function OverlayStudioPanel(): ReactElement {
  const guestHostRef = useRef<HTMLDivElement | null>(null);
  // 首帧即 true：在 await mount 之前盖住空 host，避免黑屏闪。
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = host();
    h.background?.requestRetain?.({ appId: OVERLAY_STUDIO_APP_ID, active: true, reason: "overlay-studio-open" });
    return () => {
      h.background?.requestRetain?.({ appId: OVERLAY_STUDIO_APP_ID, active: false, reason: "overlay-studio-open" });
    };
  }, []);

  useEffect(() => {
    const h = host();
    if (!h.guest?.mount || !guestHostRef.current) {
      setBooting(false);
      setError("宿主未提供 host.guest.mount（需升级 Agnx 并重新扫描子应用）");
      return;
    }
    let cancelled = false;
    const unmount = h.guest.mount({
      container: guestHostRef.current,
      ensureTool: OVERLAY_STUDIO_ENSURE_TOOL_REL,
      ensureArgs: ["--port", String(OVERLAY_STUDIO_DEFAULT_PORT)],
      timeoutMs: 300_000,
      surfaceReadyTimeoutMs: 120_000,
      bootOverlay: false,
      onReady: () => {
        if (cancelled) return;
        // Vite dev server 起得快，稍稳一拍再撤遮罩，避免字体加载闪烁。
        window.setTimeout(() => {
          if (!cancelled) setBooting(false);
        }, 400);
      },
      onError: (d) => {
        if (cancelled) return;
        setBooting(false);
        setError(`${d.code}: ${d.message}`);
      },
    });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, []);

  const BrandPanel = host().ui?.BrandLogoLoaderPanel as
    | ComponentType<WorkspaceAppBrandLogoLoaderPanelProps>
    | undefined;

  return (
    <div style={WEB_ROOT_STYLE} data-testid={`workspace-mini-app-${OVERLAY_STUDIO_APP_ID}-root`}>
      <div ref={guestHostRef} data-agnx-guest-surface-host="true" style={GUEST_HOST_STYLE} />
      {booting && !error && BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={LAYER} role="status">
          <BrandPanel title="正在启动 Overlay Studio…" testID="overlay-studio-boot-overlay" />
        </div>
      ) : null}
      {error ? (
        <div style={{ ...LAYER, overflow: "auto" }} role="alert">
          <div style={ERROR_BOX}>{error}</div>
        </div>
      ) : null}
    </div>
  );
}
