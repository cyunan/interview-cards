import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { remarkFoldedCallouts } from "./folded-callouts";
import remarkGfm from "remark-gfm";
import type { ReferenceImage } from "../content/payload";

let mermaidModulePromise: Promise<typeof import("mermaid")> | undefined;
let mermaidInitialized = false;
let mermaidRenderId = 0;

const MERMAID_MIN_SCALE = 0.6;
const MERMAID_MAX_SCALE = 2;
const MERMAID_SCALE_STEP = 0.1;

function loadMermaid() {
  mermaidModulePromise ??= import("mermaid");
  return mermaidModulePromise;
}

interface MermaidDiagramProps {
  source: string;
}

function MermaidDiagram({ source }: MermaidDiagramProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const naturalSizeRef = useRef({ width: 0, height: 0 });
  const [error, setError] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let active = true;
    const renderId = `mermaid-diagram-${++mermaidRenderId}`;

    setError(false);
    setRendered(false);
    setScale(1);
    setFullscreen(false);
    void loadMermaid()
      .then(({ default: mermaid }) => {
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            themeVariables: {
              fontSize: "16px",
              textColor: "#263b34",
              primaryColor: "#edf7f2",
              primaryBorderColor: "#79ae9a",
              primaryTextColor: "#263b34",
              lineColor: "#5b756b",
              secondaryColor: "#fff8df",
              tertiaryColor: "#f4f7f5",
              actorBkg: "#edf5f1",
              actorBorder: "#79ae9a",
              actorTextColor: "#263b34",
              signalColor: "#3f6659",
              signalTextColor: "#263b34",
              labelBoxBkgColor: "#fff6c8",
              labelBoxBorderColor: "#d8bc66",
              activationBkgColor: "#cfe9dd",
              activationBorderColor: "#4f8e78",
              sequenceNumberColor: "#2b7d6f",
            },
            sequence: {
              useMaxWidth: false,
              actorMargin: 72,
              boxMargin: 8,
              boxTextMargin: 6,
              noteMargin: 12,
              messageMargin: 34,
            },
          });
          mermaidInitialized = true;
        }

        return mermaid.render(renderId, source);
      })
      .then(({ svg }) => {
        if (!active || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
        const svgElement = hostRef.current.querySelector("svg");
        const svgId = svgElement?.getAttribute("id");
        if (svgElement && svgId) {
          const themeOverride = document.createElementNS("http://www.w3.org/2000/svg", "style");
          themeOverride.textContent = `
            #${svgId} .messageLine0,
            #${svgId} .messageLine1,
            #${svgId} .actor-line,
            #${svgId} .transition,
            #${svgId} .stateGroup line { stroke: #5b756b; }
            #${svgId} marker[id$="-arrowhead"] path,
            #${svgId} marker[id$="-arrowhead"] polygon,
            #${svgId} marker[id$="-arrowhead"] circle,
            #${svgId} [id$="-barbEnd"],
            #${svgId} .marker,
            #${svgId} .node circle.state-start,
            #${svgId} .node .fork-join {
              fill: #5b756b;
              stroke: #5b756b;
            }
            #${svgId} .labelBox {
              fill: #fff6c8;
              stroke: #d8bc66;
            }
            #${svgId} .messageText,
            #${svgId} .labelText,
            #${svgId} .loopText,
            #${svgId} .sectionTitle,
            #${svgId} .stateLabel text,
            #${svgId} text { fill: #263b34; }
          `;
          svgElement.append(themeOverride);

          const setInlineStyle = (selector: string, styles: Record<string, string>) => {
            svgElement.querySelectorAll<SVGElement>(selector).forEach((element) => {
              Object.entries(styles).forEach(([property, value]) => {
                element.style.setProperty(property, value, "important");
              });
            });
          };

          const setPresentationAttributes = (selector: string, styles: Record<string, string>) => {
            svgElement.querySelectorAll<SVGElement>(selector).forEach((element) => {
              Object.entries(styles).forEach(([property, value]) => {
                element.style.setProperty(property, value, "important");
                element.setAttribute(property, value);
              });
            });
          };

          setInlineStyle(
            ".messageLine0, .messageLine1, .actor-line, .transition, .stateGroup line",
            { stroke: "#5b756b", "stroke-width": "1.4px", fill: "none" },
          );
          setInlineStyle(
            ".statediagram-state rect.basic, .stateGroup rect",
            { fill: "#edf7f2", stroke: "#79ae9a", "stroke-width": "1px" },
          );
          setInlineStyle(
            'marker path, [id$="-arrowhead"] path, [id$="-barbEnd"] path, .marker, .node circle.state-start, .node .fork-join',
            { fill: "#5b756b", stroke: "#5b756b" },
          );
          // Mermaid puts self-message arrowheads inside <marker><path> without
          // fill/stroke attributes.  Chromium then falls back to solid black
          // even though the surrounding message line has the theme color.  Set
          // presentation attributes as well as CSS so the referenced marker
          // keeps its color after SVG sanitization and inside fullscreen mode.
          setPresentationAttributes(
            'marker[id$="-arrowhead"] path, marker[id$="-arrowhead"] polygon, marker[id$="-arrowhead"] circle',
            { fill: "#5b756b", stroke: "#5b756b" },
          );
          // `alt`/`loop` branches use a `.labelBox` polygon. It is emitted
          // without presentation attributes, so browsers that skip Mermaid's
          // embedded stylesheet paint the polygon black by default.
          setPresentationAttributes(
            ".labelBox",
            { fill: "#fff6c8", stroke: "#d8bc66", "stroke-width": "1px" },
          );
          setInlineStyle(
            ".statediagram-state .nodeLabel, .statediagram-state foreignObject div, .stateLabel, .stateLabel text, .nodeLabel",
            { color: "#263b34", fill: "#263b34" },
          );

          // Mermaid's generated stylesheet is embedded in the SVG. Some browsers
          // (and SVGs rendered from a sanitized document) do not apply those rules
          // consistently, which makes flowchart nodes fall back to solid black.
          // Keep the important visual contract inline so every diagram remains
          // readable even when the embedded stylesheet is unavailable.
          if (svgElement.classList.contains("flowchart")) {
            // A subgraph is rendered as a `.cluster` rectangle without a fill
            // attribute. If Mermaid's embedded stylesheet is not applied, SVG
            // paints that rectangle black by default. Set the canvas and
            // cluster colors inline so diagrams keep the same light surface in
            // every browser and in the fullscreen reader.
            svgElement.style.setProperty("background-color", "transparent", "important");
            setInlineStyle(
              ".cluster rect",
              { fill: "#f4f7f5", stroke: "#b8cbc2", "stroke-width": "1.2px" },
            );
            setInlineStyle(
              ".cluster-label, .cluster-label text, .cluster-label span, .cluster-label p, .cluster-label .nodeLabel",
              { color: "#263b34", fill: "#263b34" },
            );
            setInlineStyle(
              ".node rect.label-container, .node rect.basic, .node circle, .node ellipse, .node path",
              { fill: "#edf7f2", stroke: "#79ae9a", "stroke-width": "1.2px" },
            );
            setInlineStyle(
              ".node polygon.label-container",
              { fill: "#fff8df", stroke: "#d8bc66", "stroke-width": "1.2px" },
            );
            setInlineStyle(
              ".node .label, .node .label text, .node .label span, .node .label p, .node .nodeLabel",
              { color: "#263b34", fill: "#263b34" },
            );
            setInlineStyle(
              ".flowchart-link, .edgePaths path",
              { stroke: "#5b756b", "stroke-width": "1.4px", fill: "none" },
            );
            setInlineStyle(
              ".edgeLabel, .edgeLabel span, .edgeLabel p, .labelBkg",
              { color: "#263b34", fill: "#fffdf3", "background-color": "#fffdf3" },
            );
            setInlineStyle(
              ".edgeLabel rect",
              { fill: "#fffdf3", stroke: "#e7dba9", "stroke-width": "0.8px" },
            );
            setInlineStyle(
              "marker path, marker polygon, marker circle",
              { fill: "#5b756b", stroke: "#5b756b" },
            );
          }
        }
        setRendered(true);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
      hostRef.current?.replaceChildren();
    };
  }, [source]);

  useEffect(() => {
    const svg = hostRef.current?.querySelector("svg");
    if (!svg) return;

    const viewBox = svg.getAttribute("viewBox")?.trim().split(/\s+/).map(Number) ?? [];
    const width = Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : Number(svg.getAttribute("width"));
    const height = Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : Number(svg.getAttribute("height"));
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return;

    naturalSizeRef.current = { width, height };
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = `${Math.round(width * scale)}px`;
    svg.style.height = `${Math.round(height * scale)}px`;
    svg.style.maxWidth = "none";
  }, [rendered, scale]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const zoom = (delta: number) => {
    setScale((current) => Math.min(MERMAID_MAX_SCALE, Math.max(MERMAID_MIN_SCALE, Number((current + delta).toFixed(2)))));
  };

  const fitToWidth = () => {
    const naturalWidth = naturalSizeRef.current.width;
    const viewportWidth = viewportRef.current?.clientWidth ?? 0;
    if (!naturalWidth || !viewportWidth) {
      setScale(1);
      return;
    }
    const availableWidth = Math.max(240, viewportWidth - 32);
    setScale(Math.min(1, Number((availableWidth / naturalWidth).toFixed(2))));
  };

  const closeFullscreen = () => setFullscreen(false);

  return (
    <div
      className={`mermaid-diagram${error ? " mermaid-diagram-error" : ""}${fullscreen ? " is-fullscreen" : ""}`}
      data-mermaid-diagram
      data-mermaid-error={error ? "true" : undefined}
      data-mermaid-fullscreen={fullscreen ? "true" : undefined}
    >
      <div className="mermaid-diagram-toolbar">
        <span className="mermaid-diagram-title">流程图</span>
        <div className="mermaid-diagram-actions">
          <span className="mermaid-diagram-scale" aria-live="polite">{Math.round(scale * 100)}%</span>
          <button type="button" aria-label="缩小图示" onClick={() => zoom(-MERMAID_SCALE_STEP)} disabled={scale <= MERMAID_MIN_SCALE}>−</button>
          <button type="button" aria-label="适应宽度" onClick={fitToWidth}>适应宽度</button>
          <button type="button" aria-label="放大图示" onClick={() => zoom(MERMAID_SCALE_STEP)} disabled={scale >= MERMAID_MAX_SCALE}>＋</button>
          <button type="button" aria-label={fullscreen ? "退出全屏图示" : "全屏查看图示"} onClick={() => setFullscreen((current) => !current)}>
            {fullscreen ? "退出全屏" : "全屏"}
          </button>
        </div>
      </div>
      <div ref={viewportRef} className="mermaid-diagram-viewport" data-mermaid-viewport tabIndex={0} aria-label="Mermaid 图示查看区域">
        {!rendered && !error ? (
          <span className="mermaid-loading" role="status">
            正在绘制图示…
          </span>
        ) : null}
        {error ? (
          <pre className="mermaid-fallback">
            <code>{source}</code>
          </pre>
        ) : null}
        <div ref={hostRef} className="mermaid-diagram-canvas" aria-hidden={!rendered} />
      </div>
      {fullscreen ? (
        <button type="button" className="mermaid-diagram-close" aria-label="退出全屏图示" onClick={closeFullscreen}>
          ×
        </button>
      ) : null}
    </div>
  );
}

interface MarkdownProps {
  children: string;
  className?: string;
  images?: readonly ReferenceImage[];
}

const REFERENCE_IMAGE_URL_PATTERN = /^https:\/\/interview-cards\.invalid\/reference-image\/([a-f0-9]{16,64})$/;

export function Markdown({ children, className, images = [] }: MarkdownProps) {
  const imageMap = new Map(images.map((image) => [image.id, image]));
  return (
    <div className={className ? `markdown ${className}` : "markdown"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFoldedCallouts]}
        rehypePlugins={[[rehypeSanitize, { ...defaultSchema, attributes: { ...defaultSchema.attributes, details: ["open"] } }]]}
        skipHtml
        components={{
          a: ({ children: linkChildren, ...props }) => (
            <a {...props} rel="noreferrer noopener" target="_blank">
              {linkChildren}
            </a>
          ),
          img: ({ src, alt }) => {
            const imageId = typeof src === "string" ? REFERENCE_IMAGE_URL_PATTERN.exec(src)?.[1] : undefined;
            const packagedImage = imageId ? imageMap.get(imageId) : undefined;
            if (packagedImage) {
              return (
                <span className="markdown-image">
                  <img
                    src={`data:${packagedImage.mimeType};base64,${packagedImage.data}`}
                    alt={alt || packagedImage.alt}
                    loading="lazy"
                    decoding="async"
                  />
                </span>
              );
            }
            if (!src) return <span className="markdown-image-missing">图示未加载：{alt || "未命名图片"}</span>;
            return (
              <span className="markdown-image">
                <img src={src} alt={alt || ""} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              </span>
            );
          },
          code: ({ className, children: codeChildren, node: _node, ...props }) => {
            const language = /language-(\w+)/.exec(className ?? "")?.[1];
            const source = String(codeChildren).replace(/\n$/, "");

            if (language === "mermaid") {
              return <MermaidDiagram source={source} />;
            }

            return (
              <code className={className} {...props}>
                {codeChildren}
              </code>
            );
          },
          pre: ({ children: preChildren, node: preNode, ...props }) => {
            const codeNode = preNode?.children?.[0];
            const className = codeNode?.type === "element" ? codeNode.properties?.className : undefined;
            const classes = Array.isArray(className) ? className.map(String) : [String(className ?? "")];
            if (classes.includes("language-mermaid")) {
              return preChildren;
            }

            return <pre {...props}>{preChildren}</pre>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
