import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ContentWorkspace } from "../app/App";
import { parseCardsPayload, type ParsedCardsPayload } from "../content/payload";
export function PreviewApp() {
  const [payload, setPayload] = useState<ParsedCardsPayload>();
  const [error, setError] = useState("");
  const [partial, setPartial] = useState(true);
  const notice = useRef<HTMLElement>(null);
  const [noticeHeight, setNoticeHeight] = useState(0);
  useEffect(() => {
    const element = notice.current;
    if (!element) return;
    const measure = () => setNoticeHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    let revision = "";
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(import.meta.env.BASE_URL + "__site/preview", {
          method: "POST", headers: { "Content-Type": "application/json", ...(revision ? { "If-None-Match": revision } : {}) }, cache: "no-store",
        });
        if (response.status === 304) return;
        revision = response.headers.get("ETag") ?? "";
        const state = await response.json();
        if (!active) return;
        if (!response.ok || state.error) throw new Error(state.error ?? "预览服务不可用");
        const next = parseCardsPayload(state.payload);
        setPayload((current) => current?.buildId === next.buildId ? current : next);
        setPartial(state.partial);
        setError("");
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "编译失败");
      } finally {
        if (active) timer = setTimeout(poll, 1000);
      }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, []);
  return <div className="local-preview-root" style={{ "--local-preview-notice-height": `${noticeHeight}px` } as CSSProperties}>
    <aside ref={notice} className={error ? "local-preview-notice has-error" : "local-preview-notice"} role={error ? "alert" : "status"}>
      <strong>本机内容预览</strong> · {!payload ? "正在读取知识库" : partial ? "仅展示已迁移主题" : "完整题库与技术文档"}
      {error ? <p>编译失败，下面暂留上次成功内容：{error}</p> : <span> · 保存笔记后自动刷新</span>}
    </aside>
    {payload ? <ContentWorkspace payload={payload} /> : <main className="screen"><p>{error || "正在编译笔记…"}</p></main>}
  </div>;
}
