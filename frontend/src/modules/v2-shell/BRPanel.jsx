import { useEffect, useRef, useState } from "react";

// =============================================================================
// BRPanel — BR Return module panel.
//
// Wraps the production BR Return UI (vanilla JS at backend/static/br-return.html)
// in an iframe. The iframe is cross-origin (different Render service), so all
// communication uses window.postMessage.
//
// Contract (see docs/v2-architecture.md if it exists, otherwise this header
// is the source of truth):
//
//   Shell → iframe   theme:set     { theme: "dark" | "light" }
//   Shell → iframe   lang:set      { lang:  "th"   | "en" }
//   iframe → Shell   ready         {}
//   iframe → Shell   badge:update  { pendingCount: number }
//
// IMPORTANT — safety invariants:
//   • This component must NEVER call the BR Return Apps Script.
//   • This component must NEVER reach into the iframe's DOM.
//   • All theme/lang messages are wrapped in try/catch on both sides so a
//     missing parent (direct standalone access at /br-return) is a no-op.
// =============================================================================

// Default BR Return URL. Can be overridden at build time with VITE_BR_RETURN_URL.
// In dev (localhost) this points at the local FastAPI server.
const BR_RETURN_URL =
  import.meta.env.VITE_BR_RETURN_URL ||
  (import.meta.env.PROD
    ? "https://borrow-control-1.onrender.com/br-return"
    : "http://localhost:8000/br-return");
const BR_RETURN_IFRAME_URL =
  BR_RETURN_URL + (BR_RETURN_URL.includes("?") ? "&" : "?") + "v=br-dashboard-date-qty-20260605";

// The iframe origin is everything before the path.
function originOf(url) {
  try { return new URL(url).origin; }
  catch { return "*"; }
}

const PAGE_HEADER = {
  th: {
    eyebrow: "BR RETURN",
    title: "ระบบคืนสินค้ายืม (BR Return)",
    subtitle: "สร้างคำขอคืน · ติดตามและตรวจสอบรายการสินค้าจากใบยืม",
    loading: "กำลังโหลด BR Return...",
  },
  en: {
    eyebrow: "BR RETURN",
    title: "BR Return",
    subtitle: "Create return requests · review · approve — writes back to the Logistics File",
    loading: "Loading BR Return...",
  },
};

export default function BRPanel({ theme, lang, onPendingCount }) {
  const iframeRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const L = PAGE_HEADER[lang] || PAGE_HEADER.th;

  // Send a message to the iframe, but only after it has signalled `ready`.
  // Before ready, the iframe's setTheme / setLang functions may not exist
  // yet, so we queue the latest theme + lang via the loaded state.
  const post = (type, payload) => {
    const f = iframeRef.current;
    if (!f || !f.contentWindow) return;
    try {
      f.contentWindow.postMessage({ source: "v2-shell", type, ...payload }, originOf(BR_RETURN_URL));
    } catch {
      // Cross-origin or iframe not navigated yet — silently drop.
      // The iframe's `ready` handler will replay current state on next load.
    }
  };

  // Listen for ready / badge:update from the iframe.
  useEffect(() => {
    function onMessage(e) {
      const expectedOrigin = originOf(BR_RETURN_URL);
      // Allow same-origin OR the explicit BR Return origin only.
      if (e.origin !== expectedOrigin && e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data || data.source !== "br-return") return;

      if (data.type === "ready") {
        setLoaded(true);
        // Replay current theme + lang.
        post("theme:set", { theme });
        post("lang:set", { lang });
      } else if (data.type === "badge:update") {
        if (typeof data.pendingCount === "number" && onPendingCount) {
          onPendingCount(data.pendingCount);
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // theme/lang intentionally NOT in deps — replay happens on ready only.
    // For ongoing updates, the other effect below handles them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever the shell theme changes, broadcast to the iframe.
  useEffect(() => {
    if (loaded) post("theme:set", { theme });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, loaded]);

  // Whenever the shell lang changes, broadcast to the iframe.
  useEffect(() => {
    if (loaded) post("lang:set", { lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, loaded]);

  return (
    <section className="v2-module-panel active" aria-label="BR Return module">
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-header-h1">
            {L.title}
          </h1>
          <p className="v2-page-header-p">{L.subtitle}</p>
        </div>
      </div>

      <div className="v2-iframe-host" style={{ position: "relative" }}>
        {!loaded && (
          <div className="v2-iframe-loading">{L.loading}</div>
        )}
        <iframe
          ref={iframeRef}
          className="v2-iframe"
          src={BR_RETURN_IFRAME_URL}
          title="BR Return"
          // sandbox intentionally omitted so localStorage / Apps Script
          // fetch / image uploads keep working exactly as they do standalone.
        />
      </div>
    </section>
  );
}
