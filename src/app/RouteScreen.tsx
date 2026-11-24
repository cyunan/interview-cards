import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useKnowledgeRoutes } from "../routes/context";
import type { UIEvent as ReactUIEvent, WheelEvent as ReactWheelEvent } from "react";

import type { CardV2 } from "../content/types";
import type { ReferenceDocument } from "../content/payload";
import { Markdown } from "./Markdown";
import { plainText } from "./reading-data";
import { currentAppHistoryState, pushAppHistoryState, replaceAppHistoryState } from "./navigation-history";
import {
  resolveRouteCards,
  resolveRouteCheckpoint,
  resolveRouteDocuments,
  type ResolvedRouteDocument,
  type KnowledgeRoute,
} from "../routes/routes";

interface RouteScreenProps {
  cards: CardV2[];
  documents?: ReferenceDocument[];
  selectedRouteId?: string;
  selectedStepId?: string;
  onSelectRoute(routeId?: string): void;
  onOpenCard(id: string): void;
  onOpenDocument?(id: string): void;
}

function RouteQuestion({ card, onOpenCard }: { card: CardV2; onOpenCard(id: string): void }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="route-question" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary><span>{plainText(card.question)}</span><span className="route-question-chevron" aria-hidden="true" /></summary>
      {open ? <div className="route-question-answer">
        <p className="route-question-label">参考回答</p>
        <Markdown images={card.images}>{card.quickAnswerMd}</Markdown>
        <button className="reading-link" type="button" onClick={() => onOpenCard(card.id)}>查看完整问答</button>
      </div> : null}
    </details>
  );
}

function RouteReferenceList({
  references,
  onCopyPath,
  onOpenDocument,
  compact = false,
}: {
  references: ResolvedRouteDocument[];
  onCopyPath?(sourcePath: string): void;
  onOpenDocument?(reference: ResolvedRouteDocument): void;
  compact?: boolean;
}) {
  if (references.length === 0) {
    return <p className="route-reference-empty">当前题库版本没有附带本阶段技术文档。</p>;
  }
  return (
    <div className="route-reference-list">
      {references.map(({ document, reason }) => (
        compact ? (
          <button className="route-reference-item route-reference-open" type="button" key={document.id} onClick={() => onOpenDocument?.({ document, reason })}>
            <span className="route-reference-item-copy">
              <span className="route-reference-item-title">{document.title}</span>
              <small>{reason}</small>
            </span>
            <span className="route-reference-chevron" aria-hidden="true">↗</span>
          </button>
        ) : (
          <details className="route-reference-item" key={document.id}>
            <summary>
              <span className="route-reference-item-title">{document.title}</span>
              <span className="route-reference-chevron" aria-hidden="true">＋</span>
            </summary>
            <div className="route-reference-item-body">
              <p className="route-reference-reason">{reason}</p>
              <Markdown images={document.images}>{document.markdown}</Markdown>
              <div className="route-reference-source">
                <span>来源：{document.sourcePath}</span>
                {onCopyPath ? (
                  <button type="button" className="text-button" onClick={() => onCopyPath(document.sourcePath)}>
                    复制路径
                  </button>
                ) : null}
              </div>
            </div>
          </details>
        )
      ))}
    </div>
  );
}

function RouteReferenceReader({
  reference,
  navigation,
  onNavigate,
  onClose,
}: {
  reference: ResolvedRouteDocument;
  navigation: {
    currentIndex: number;
    total: number;
    previous?: ResolvedRouteDocument;
    next?: ResolvedRouteDocument;
  };
  onNavigate(reference: ResolvedRouteDocument): void;
  onClose(): void;
}) {
  const readerBodyRef = useRef<HTMLDivElement>(null);
  const readerHeaderRef = useRef<HTMLElement>(null);
  const [articleHeadings, setArticleHeadings] = useState<Array<{ id: string; level: number; title: string }>>([]);

  useLayoutEffect(() => {
    const readerBody = readerBodyRef.current;
    if (readerBody) readerBody.scrollTop = 0;
    readerHeaderRef.current?.style.setProperty("--reader-progress", "0%");
    readerHeaderRef.current?.classList.remove("is-compact");
    setArticleHeadings((current) => current.length === 0 ? current : []);
  }, [reference.document.id]);

  useEffect(() => {
    const readerBody = readerBodyRef.current;
    const headings = readerBody?.querySelectorAll<HTMLElement>(
      ".route-reference-reader-content .markdown h2, .route-reference-reader-content .markdown h3, .route-reference-reader-content .markdown h4",
    ) ?? [];
    const nextHeadings = Array.from(headings).flatMap((heading, index) => {
      const title = heading.textContent?.trim();
      if (!title) return [];

      const id = `route-article-heading-${index}`;
      heading.id = id;
      return [{ id, level: Number(heading.tagName.slice(1)), title }];
    });
    setArticleHeadings(nextHeadings);
  }, [reference.document.id, reference.document.markdown]);

  const navigateToHeading = (id: string) => {
    const readerBody = readerBodyRef.current;
    const heading = readerBody?.querySelector<HTMLElement>(`#${id}`);
    if (!readerBody || !heading) return;

    const top = readerBody.scrollTop + heading.getBoundingClientRect().top - readerBody.getBoundingClientRect().top - 12;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const behavior = reduceMotion ? "auto" : "smooth";
    if (typeof readerBody.scrollTo === "function") {
      readerBody.scrollTo({ top, behavior });
    } else {
      readerBody.scrollTop = top;
    }
  };

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
    };

    html.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.width = previous.bodyWidth;
      body.style.overflow = previous.bodyOverflow;
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
    };
  }, []);

  const handleReaderWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const atTop = event.deltaY < 0 && element.scrollTop <= 0;
    const atBottom = event.deltaY > 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
    if (atTop || atBottom) event.preventDefault();
  };

  const handleReaderScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const progress = maxScroll === 0 ? 0 : Math.max(0, Math.min(100, (scrollTop / maxScroll) * 100));
    readerHeaderRef.current?.style.setProperty("--reader-progress", `${progress}%`);

    const shouldCompact = scrollTop > 44;
    readerHeaderRef.current?.classList.toggle("is-compact", shouldCompact);
  };

  const copyPath = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(reference.document.sourcePath);
    }
  };
  return (
    <div className="route-reference-reader-overlay" role="presentation" onClick={onClose}>
      <section className="route-reference-reader" role="dialog" aria-modal="true" aria-label="技术资料阅读" onClick={(event) => event.stopPropagation()}>
        <header ref={readerHeaderRef} className="route-reference-reader-header">
          <div>
            <p className="eyebrow">FROM 小陈空间 · 当前阶段技术资料</p>
            <h2>{reference.document.title}</h2>
            {navigation.total > 1 ? (
              <nav className="route-reference-reader-navigation" aria-label="文章导航">
                <button
                  type="button"
                  aria-label={navigation.previous ? `上一篇：${navigation.previous.document.title}` : "已经是第一篇"}
                  disabled={!navigation.previous}
                  onClick={() => navigation.previous && onNavigate(navigation.previous)}
                >
                  ← 上一篇
                </button>
                <span aria-live="polite">{navigation.currentIndex + 1} / {navigation.total}</span>
                <button
                  type="button"
                  aria-label={navigation.next ? `下一篇：${navigation.next.document.title}` : "已经是最后一篇"}
                  disabled={!navigation.next}
                  onClick={() => navigation.next && onNavigate(navigation.next)}
                >
                  下一篇 →
                </button>
              </nav>
            ) : null}
          </div>
          <button className="route-reference-reader-close" type="button" aria-label="关闭阅读层" onClick={onClose}>×</button>
        </header>
        <div ref={readerBodyRef} className="route-reference-reader-body" onScroll={handleReaderScroll} onWheel={handleReaderWheel}>
          <article className="route-reference-reader-content">
            <p className="route-reference-reason">{reference.reason}</p>
            {articleHeadings.length > 0 ? (
              <details key={reference.document.id} className="route-reference-toc">
                <summary>
                  <span>文章目录</span>
                  <small>{articleHeadings.length} 节</small>
                </summary>
                <nav aria-label="文章目录">
                  <ol>
                    {articleHeadings.map((heading) => (
                      <li key={heading.id} data-depth={heading.level}>
                        <button type="button" onClick={() => navigateToHeading(heading.id)}>{heading.title}</button>
                      </li>
                    ))}
                  </ol>
                </nav>
              </details>
            ) : null}
            <Markdown images={reference.document.images}>{reference.document.markdown}</Markdown>
            <div className="route-reference-reader-source">
              <span>来源：{reference.document.sourcePath}</span>
              <button type="button" className="text-button" onClick={copyPath}>复制来源路径</button>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

function RouteReferencePanel({
  references,
  mobile = false,
  embedded = false,
  onClose,
  onOpenDocument,
}: {
  references: ResolvedRouteDocument[];
  mobile?: boolean;
  embedded?: boolean;
  onClose?(): void;
  onOpenDocument?(reference: ResolvedRouteDocument): void;
}) {
  const copyPath = (sourcePath: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(sourcePath);
    }
  };
  const content = (
    <>
      <div className="route-reference-heading">
        <div>
          <p className="eyebrow">FROM 小陈空间</p>
          <h2>本阶段技术资料</h2>
        </div>
        <span>{references.length} 篇</span>
      </div>
      <p className="route-reference-intro">先看题目建立问题，再按需展开原理文档。资料只在解锁后的本机内存中显示。</p>
      <RouteReferenceList references={references} onCopyPath={copyPath} compact={Boolean(onOpenDocument)} onOpenDocument={onOpenDocument} />
      {onClose ? <button type="button" className="secondary-button route-reference-close" onClick={onClose}>收起资料</button> : null}
    </>
  );
  if (embedded) return <div className="route-reference-embedded">{content}</div>;
  return <aside className={mobile ? "route-reference-drawer" : "route-reference-sidebar"} aria-label="阶段技术资料">{content}</aside>;
}

function RouteContextPanel({
  route,
  step,
  stepIndex,
  total,
  references,
  onOpenDocument,
}: {
  route: KnowledgeRoute;
  step: KnowledgeRoute["steps"][number];
  stepIndex: number;
  total: number;
  references: ResolvedRouteDocument[];
  onOpenDocument(reference: ResolvedRouteDocument): void;
}) {
  return (
    <aside className="route-context-sidebar" aria-label="路线阶段上下文">
      <p className="eyebrow">当前阶段</p>
      <h2>{String(stepIndex + 1).padStart(2, "0")} · {step.shortTitle ?? step.title}</h2>
      <p className="route-context-purpose">{step.purpose}</p>
      <div className="route-context-progress"><strong>{total}</strong><span>道问答</span></div>
      {references.length > 0 ? (
        <RouteReferencePanel references={references} embedded onOpenDocument={onOpenDocument} />
      ) : (
        <p className="route-reference-empty">当前阶段没有附带技术资料，先沿阶段卡片建立主线。</p>
      )}
      {stepIndex < route.steps.length - 1 ? (
        <p className="route-context-next">下一阶段：{route.steps[stepIndex + 1].shortTitle ?? route.steps[stepIndex + 1].title}</p>
      ) : null}
    </aside>
  );
}

function RouteList({ onSelectRoute }: Pick<RouteScreenProps, "onSelectRoute">) {
  const KNOWLEDGE_ROUTES = useKnowledgeRoutes();
  return (
    <main className="screen route-screen">
      <section className="page-title route-intro">
        <p className="eyebrow">KNOWLEDGE ROUTES</p>
        <h1>沿路线建立理解</h1>
        <p>从一个具体问题出发，按阶段读原理、问答和技术资料。</p>
      </section>

      <section className="route-guide" aria-label="路线学习方法">
        <span className="route-guide-mark" aria-hidden="true">↗</span>
        <div>
          <strong>一条路线 = 一条可口述的因果链</strong>
          <p>每个阶段说明一个技术环节，读完后沿着过渡进入下一阶段。</p>
        </div>
      </section>

      <section className="route-grid" aria-label="学习路线列表">
        {KNOWLEDGE_ROUTES.map((route, index) => (
            <button
              type="button"
              className="route-card"
              key={route.id}
              onClick={() => onSelectRoute(route.id)}
            >
              <span className="route-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="route-card-meta">{route.level} · {route.steps.length} 个阶段 · 约 {route.estimatedMinutes} 分钟</span>
              <strong>{route.title}</strong>
              <small>{route.summary}</small>
              <span className="route-card-action">阅读路线 <span aria-hidden="true">→</span></span>
            </button>
        ))}
      </section>
    </main>
  );
}

function RouteDetail({
  route,
  cards,
  documents,
  selectedStepId,
  onSelectRoute,
  onOpenCard,
  onOpenDocument,
}: Pick<RouteScreenProps, "cards" | "selectedStepId" | "onSelectRoute" | "onOpenCard" | "onOpenDocument"> & {
  route: KnowledgeRoute;
  documents: ReferenceDocument[];
}) {
  const indexFromHash = () => route.steps.findIndex(step => window.location.hash === `#route-${step.id}`);
  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.max(0, selectedStepId ? route.steps.findIndex(step => step.id === selectedStepId) : indexFromHash())
  );
  const questionCount = new Set(route.steps.flatMap(step => resolveRouteCards(step, cards).map(card => card.id))).size;
  useLayoutEffect(() => {
    if (!selectedStepId) return;
    const index = route.steps.findIndex(step => step.id === selectedStepId);
    if (index < 0) return;
    setSelectedIndex(index);
    if (index > 0 || window.location.hash === `#route-${selectedStepId}`) {
      document.getElementById(`route-${selectedStepId}`)?.scrollIntoView?.({ block: "start" });
    }
  }, [route, selectedStepId]);
  const directoryRef = useRef<HTMLDetailsElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const currentIndex = Math.min(selectedIndex, route.steps.length - 1);
  const activeReferences = useMemo(
    () => resolveRouteDocuments(route.steps[currentIndex], documents),
    [currentIndex, documents, route.steps],
  );
  const activeStep = route.steps[currentIndex];
  const activeStepCards = resolveRouteCards(activeStep, cards);
  const [referenceCatalogOpen, setReferenceCatalogOpen] = useState(false);
  const [referenceId, setReferenceId] = useState<string>();
  const activeReference = activeReferences.find(({ document }) => document.id === referenceId);
  const activeReferenceIndex = activeReference
    ? activeReferences.findIndex(({ document }) => document.id === activeReference.document.id)
    : -1;
  const referenceNavigation = activeReferenceIndex >= 0 ? {
    currentIndex: activeReferenceIndex,
    total: activeReferences.length,
    previous: activeReferences[activeReferenceIndex - 1],
    next: activeReferences[activeReferenceIndex + 1],
  } : undefined;
  const stageLabel = (index: number) => route.steps[index].shortTitle ?? route.steps[index].title.split("：")[0];
  function closeReference(): void {
    setReferenceId(undefined);
    if (currentAppHistoryState()?.layer === "reference") window.history.back();
  }
  function closeReferenceCatalog(): void {
    setReferenceCatalogOpen(false);
    if (currentAppHistoryState()?.layer === "reference-catalog") window.history.back();
  }
  useEffect(() => {
    const update = () => { const index = indexFromHash(); if (index >= 0) setSelectedIndex(index); };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [route]);
  useEffect(() => {
    const applyHistoryLayer = (state: unknown) => {
      if (!state || typeof state !== "object") {
        setReferenceCatalogOpen(false);
        setReferenceId(undefined);
        return;
      }
      const next = state as { app?: string; view?: string; routeId?: string; layer?: string; referenceId?: string };
      if (next.app !== "interview-cards" || next.view !== "routes" || next.routeId !== route.id) {
        setReferenceCatalogOpen(false);
        setReferenceId(undefined);
        return;
      }
      setReferenceCatalogOpen(next.layer === "reference-catalog");
      setReferenceId(next.layer === "reference" ? next.referenceId : undefined);
    };
    applyHistoryLayer(window.history.state);
    const update = (event: PopStateEvent) => applyHistoryLayer(event.state);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, [route.id]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (activeReference) closeReference();
      else closeReferenceCatalog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeReference]);
  useEffect(() => {
    if (referenceId && !activeReference) setReferenceId(undefined);
  }, [activeReference, referenceId]);
  useEffect(() => {
    let frame = 0;
    const updatePosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (directoryRef.current?.open) return;
        const navigation = navigationRef.current;
        if (!navigation) return;
        const firstStage = document.getElementById(`route-${route.steps[0].id}`);
        const anchorOffset = firstStage ? Number.parseFloat(getComputedStyle(firstStage).scrollMarginTop) : 0;
        const threshold = Math.max(navigation.getBoundingClientRect().bottom + 24, anchorOffset) + 2;
        let index = 0;
        route.steps.forEach((step, candidate) => {
          const element = document.getElementById(`route-${step.id}`);
          if (element && element.getBoundingClientRect().top <= threshold) index = candidate;
        });
        setSelectedIndex(index);
      });
    };
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [route]);
  const selectStage = (index: number) => {
    setSelectedIndex(index);
    if (directoryRef.current) directoryRef.current.open = false;
    requestAnimationFrame(() => document.getElementById(`route-${route.steps[index].id}`)?.focus({ preventScroll: true }));
  };
  const openReference = (reference: ResolvedRouteDocument) => {
    if (onOpenDocument) {
      onOpenDocument(reference.document.id);
      return;
    }
    setReferenceCatalogOpen(false);
    pushAppHistoryState({
      view: "routes",
      routeId: route.id,
      layer: "reference",
      referenceId: reference.document.id,
    });
    setReferenceId(reference.document.id);
  };
  const navigateReference = (reference: ResolvedRouteDocument) => {
    replaceAppHistoryState({
      view: "routes",
      routeId: route.id,
      layer: "reference",
      referenceId: reference.document.id,
    });
    setReferenceId(reference.document.id);
  };
  const openReferenceCatalog = () => {
    pushAppHistoryState({ view: "routes", routeId: route.id, layer: "reference-catalog", referenceId: undefined });
    setReferenceCatalogOpen(true);
  };
  const stageLinks = () => route.steps.map((step, index) => (
    <a key={step.id} href={`#route-${step.id}`} onClick={() => selectStage(index)}
      aria-current={index === currentIndex ? "step" : undefined}>
      <span className="route-stage-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <span>{stageLabel(index)}</span>
    </a>
  ));

  return (
    <main className="screen route-detail-screen">
      <div className="route-back-bar">
        <button className="route-back-button" type="button" aria-label="返回路线总览" onClick={() => onSelectRoute(undefined)}>
          <span aria-hidden="true">←</span><span>路线总览</span>
        </button>
      </div>
      <section className="route-detail-hero">
        <p className="eyebrow">{route.level} · {route.steps.length} 个阶段 · {questionCount} 道问答 · 约 {route.estimatedMinutes} 分钟</p>
        <h1>{route.title}</h1>
        <p>{route.summary}</p>
        {route.scenario ? <details className="route-learning-guide"><summary>学习场景与目标 <span className="route-teaching-label">教学场景</span></summary>
          <div><p>{route.scenario}</p>
            {route.outcomes ? <ul>{route.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul> : null}
          </div>
        </details> : null}
      </section>
      <nav className="route-desktop-stage-rail" aria-label="桌面路线阶段">
        <p className="eyebrow">当前路线</p>
        <strong>{route.title}</strong>
        <div className="route-desktop-stage-links">{stageLinks()}</div>
      </nav>
      <div className="route-learning-layout">
      <div className="route-flow-column">
      <div className="route-navigation-dock" ref={navigationRef}>
      <nav className="route-stage-nav" aria-label="跳转学习阶段">
        {stageLinks()}
      </nav>
      <details className="route-mobile-directory" ref={directoryRef} onKeyDown={(event) => {
        if (event.key === "Escape" && directoryRef.current) {
          directoryRef.current.open = false;
          directoryRef.current.querySelector("summary")?.focus();
        }
      }}>
        <summary><span><small>{String(currentIndex + 1).padStart(2, "0")} / {String(route.steps.length).padStart(2, "0")}</small> {stageLabel(currentIndex)}</span><span className="route-directory-toggle">切换阶段</span></summary>
        <nav aria-label="手机学习阶段目录">{stageLinks()}</nav>
      </details>
      <div className="route-mobile-position" aria-hidden="true"><span style={{ width: `${(currentIndex + 1) / route.steps.length * 100}%` }} /></div>
      </div>

      <section className="route-timeline" aria-label={`${route.title}学习阶段`}>
        {route.steps.map((step, index) => {
          const stepCards = resolveRouteCards(step, cards);
          const featuredIds = step.featuredCardIds ?? [];
          const featuredCards = featuredIds.flatMap(id => {
            const card = stepCards.find(item => item.id === id);
            return card ? [card] : [];
          });
          const otherCards = stepCards.filter(card => !featuredIds.includes(card.id));
          const checkpoint = resolveRouteCheckpoint(step, cards);
          const active = index === currentIndex;
          return (
            <div tabIndex={-1} id={`route-${step.id}`} className={active ? "route-step is-active" : "route-step"} key={step.id}>
              <div className="route-step-rail" aria-hidden="true">
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <article className="route-step-body">
                <div className="route-step-heading">
                  <div>
                    <p className="eyebrow">阶段 {index + 1}</p>
                    <h2>{step.title}</h2>
                  </div>
                  <span className="route-step-count">{stepCards.length} 道问答</span>
                </div>
                <p className="route-step-purpose">{step.purpose}</p>
                {step.readingMd ? <div className="route-step-reading"><Markdown>{step.readingMd}</Markdown></div> : null}
                <div className="route-step-cards">
                  {featuredCards.length ? <h3 className="route-question-heading">高频考点</h3> : null}
                  {featuredCards.map(card => <RouteQuestion key={card.id} card={card} onOpenCard={onOpenCard} />)}
                  {featuredCards.length && otherCards.length ? <h3 className="route-question-heading route-extra-heading">更多问答</h3> : null}
                  {otherCards.map(card => <RouteQuestion key={card.id} card={card} onOpenCard={onOpenCard} />)}
                  {!stepCards.length ? <p className="route-missing-copy">当前密文版本暂未包含本阶段卡片，更新题库后会自动出现。</p> : null}
                </div>
                {stepCards.length > 0 && stepCards.length < step.cardIds.length ? <p className="route-missing-copy">本阶段缺少 {step.cardIds.length - stepCards.length} 张卡片，更新题库后可阅读完整问答。</p> : null}
                {step.checkpoint ? (
                  <details className="route-checkpoint">
                    <summary>{checkpoint?.question.startsWith("阶段复述：") ? checkpoint.question : `${step.checkpoint.followUpIndex !== undefined ? "阶段复述" : "阶段检查"}：${checkpoint?.question ?? "等待题库更新"}`}</summary>
                    {checkpoint?.answerMd ? (
                      <Markdown>{checkpoint.answerMd}</Markdown>
                    ) : (
                      <p>当前题库缺少对应参考回答，更新题库后再试。</p>
                    )}
                  </details>
                ) : null}
                {index < route.steps.length - 1 ? <p className="route-transition"><span aria-hidden="true">↓</span>{step.transition}</p> : null}
              </article>
            </div>
          );
        })}
      </section>
      </div>
      <RouteContextPanel
        route={route}
        step={activeStep}
        stepIndex={currentIndex}
        total={activeStepCards.length}
        references={activeReferences}
        onOpenDocument={openReference}
      />
      </div>
      {activeReferences.length > 0 ? (
        <>
          <button
            type="button"
            className="route-reference-trigger"
            aria-expanded={referenceCatalogOpen}
            onClick={openReferenceCatalog}
          >
            <span aria-hidden="true">▤</span> 技术资料 · {activeReferences.length}
          </button>
          {referenceCatalogOpen ? (
            <div className="route-reference-overlay" role="presentation" onClick={closeReferenceCatalog}>
              <div onClick={(event) => event.stopPropagation()}>
                <RouteReferencePanel
                  references={activeReferences}
                  mobile
                  onClose={closeReferenceCatalog}
                  onOpenDocument={openReference}
                />
              </div>
            </div>
          ) : null}
          {activeReference && referenceNavigation ? (
            <RouteReferenceReader
              reference={activeReference}
              navigation={referenceNavigation}
              onNavigate={navigateReference}
              onClose={closeReference}
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}

export function RouteScreen({
  cards,
  documents = [],
  selectedRouteId,
  selectedStepId,
  onSelectRoute,
  onOpenCard,
  onOpenDocument,
}: RouteScreenProps) {
  const KNOWLEDGE_ROUTES = useKnowledgeRoutes();
  const route = selectedRouteId
    ? KNOWLEDGE_ROUTES.find((item) => item.id === selectedRouteId)
    : undefined;

  if (!route) {
    return <RouteList onSelectRoute={onSelectRoute} />;
  }

  return (
    <RouteDetail
      key={route.id}
      route={route}
      cards={cards}
      documents={documents}
      selectedStepId={selectedStepId}
      onSelectRoute={onSelectRoute}
      onOpenCard={onOpenCard}
      onOpenDocument={onOpenDocument}
    />
  );
}
