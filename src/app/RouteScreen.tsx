import { useEffect, useMemo, useRef, useState } from "react";
import { useKnowledgeRoutes } from "../routes/context";
import type { WheelEvent as ReactWheelEvent } from "react";

import type { CardV2 } from "../content/types";
import type { ReferenceDocument } from "../content/payload";
import type { CardProgress } from "../study/scheduler";
import { Markdown } from "./Markdown";
import { currentAppHistoryState, pushAppHistoryState } from "./navigation-history";
import {
  getRouteProgress,
  resolveRouteCards,
  resolveRouteCheckpoint,
  resolveRouteDocuments,
  type ResolvedRouteDocument,
  type KnowledgeRoute,
} from "../routes/routes";

interface RouteScreenProps {
  cards: CardV2[];
  documents?: ReferenceDocument[];
  progress: ReadonlyMap<string, CardProgress>;
  selectedRouteId?: string;
  onSelectRoute(routeId?: string): void;
  onPractice(route: KnowledgeRoute, stepIndex: number): void;
}

function masteryLabel(record: CardProgress | undefined): string {
  if (!record) return "未学习";
  if (record.level <= 1) return "需巩固";
  if (record.level <= 3) return `学习中 · L${record.level}`;
  return `已掌握 · L${record.level}`;
}

function RouteProgressBar({ completed, total }: { completed: number; total: number }) {
  const value = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="route-progress" aria-label={`已练过 ${completed} / ${total} 个阶段`}>
      <div className="route-progress-track"><span style={{ width: `${value}%` }} /></div>
      <small>{completed} / {total} 阶段已练过</small>
    </div>
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
  onClose,
}: {
  reference: ResolvedRouteDocument;
  onClose(): void;
}) {
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

  const copyPath = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(reference.document.sourcePath);
    }
  };
  return (
    <div className="route-reference-reader-overlay" role="presentation" onClick={onClose}>
      <section className="route-reference-reader" role="dialog" aria-modal="true" aria-label="技术资料阅读" onClick={(event) => event.stopPropagation()}>
        <header className="route-reference-reader-header">
          <div>
            <p className="eyebrow">FROM 小陈空间 · 当前阶段技术资料</p>
            <h2>{reference.document.title}</h2>
          </div>
          <button className="route-reference-reader-close" type="button" aria-label="关闭阅读层" onClick={onClose}>×</button>
        </header>
        <div className="route-reference-reader-body" onWheel={handleReaderWheel}>
          <article className="route-reference-reader-content">
            <p className="route-reference-reason">{reference.reason}</p>
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
  reviewed,
  total,
  references,
  onOpenDocument,
}: {
  route: KnowledgeRoute;
  step: KnowledgeRoute["steps"][number];
  stepIndex: number;
  reviewed: number;
  total: number;
  references: ResolvedRouteDocument[];
  onOpenDocument(reference: ResolvedRouteDocument): void;
}) {
  return (
    <aside className="route-context-sidebar" aria-label="路线阶段上下文">
      <p className="eyebrow">当前阶段</p>
      <h2>{String(stepIndex + 1).padStart(2, "0")} · {step.shortTitle ?? step.title}</h2>
      <p className="route-context-purpose">{step.purpose}</p>
      <div className="route-context-progress"><strong>{reviewed}/{total}</strong><span>张卡片已练过</span></div>
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

function RouteList({
  cards,
  progress,
  onSelectRoute,
}: Pick<RouteScreenProps, "cards" | "progress" | "onSelectRoute">) {
  const KNOWLEDGE_ROUTES = useKnowledgeRoutes();
  return (
    <main className="screen route-screen">
      <section className="page-title route-intro">
        <p className="eyebrow">KNOWLEDGE ROUTES</p>
        <h1>沿路线建立理解</h1>
        <p>冲刺和完整题库解决“今天刷什么”；路线解决“为什么这些题要放在一起”。先沿一条链路学，再回到题库复习。</p>
      </section>

      <section className="route-guide" aria-label="路线学习方法">
        <span className="route-guide-mark" aria-hidden="true">↗</span>
        <div>
          <strong>一条路线 = 一条可口述的因果链</strong>
          <p>每个阶段复用已有卡片，只增加顺序、过渡和阶段检查题；练习时仍按原有进度排期。</p>
        </div>
      </section>

      <section className="route-grid" aria-label="学习路线列表">
        {KNOWLEDGE_ROUTES.map((route, index) => {
          const summary = getRouteProgress(route, cards, progress);
          return (
            <button
              type="button"
              className="route-card"
              key={route.id}
              onClick={() => onSelectRoute(route.id)}
            >
              <span className="route-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="route-card-meta">{route.level} · 约 {route.estimatedMinutes} 分钟</span>
              <strong>{route.title}</strong>
              <small>{route.summary}</small>
              <RouteProgressBar completed={summary.completedSteps} total={route.steps.length} />
              <span className="route-card-action">{summary.reviewedCards > 0 ? "继续这条路线" : "开始这条路线"} <span aria-hidden="true">→</span></span>
            </button>
          );
        })}
      </section>
    </main>
  );
}

function RouteDetail({
  route,
  cards,
  documents,
  progress,
  onSelectRoute,
  onPractice,
}: {
  route: KnowledgeRoute;
  cards: CardV2[];
  documents: ReferenceDocument[];
  progress: ReadonlyMap<string, CardProgress>;
  onSelectRoute(routeId?: string): void;
  onPractice(route: KnowledgeRoute, stepIndex: number): void;
}) {
  const summary = useMemo(() => getRouteProgress(route, cards, progress), [cards, progress, route]);
  const indexFromHash = () => route.steps.findIndex((step) => window.location.hash === `#route-${step.id}`);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const index = indexFromHash();
    return index >= 0 ? index : summary.nextStepIndex;
  });
  const directoryRef = useRef<HTMLDetailsElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const currentIndex = Math.min(selectedIndex, route.steps.length - 1);
  const activeReferences = useMemo(
    () => resolveRouteDocuments(route.steps[currentIndex], documents),
    [currentIndex, documents, route.steps],
  );
  const activeStep = route.steps[currentIndex];
  const activeStepCards = resolveRouteCards(activeStep, cards);
  const activeStepReviewed = activeStepCards.filter((card) => (progress.get(card.id)?.reviewCount ?? 0) > 0).length;
  const [referenceCatalogOpen, setReferenceCatalogOpen] = useState(false);
  const [referenceId, setReferenceId] = useState<string>();
  const activeReference = activeReferences.find(({ document }) => document.id === referenceId);
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
    setReferenceCatalogOpen(false);
    pushAppHistoryState({
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
  const stageLinks = () => route.steps.map((step, index) => {
    const complete = step.cardIds.length > 0 && step.cardIds.every((id) => cards.some((card) => card.id === id) && (progress.get(id)?.reviewCount ?? 0) > 0);
    return <a key={step.id} href={`#route-${step.id}`} onClick={() => selectStage(index)}
      aria-current={index === currentIndex ? "step" : undefined}
      className={complete ? "is-reviewed" : undefined}>
      <span className="route-stage-number" aria-hidden="true">{complete ? "✓" : String(index + 1).padStart(2, "0")}</span>
      <span>{stageLabel(index)}{complete ? <small>已练习</small> : null}</span>
    </a>;
  });

  return (
    <main className="screen route-detail-screen">
      <div className="route-back-bar">
        <button className="route-back-button" type="button" aria-label="返回路线总览" onClick={() => onSelectRoute(undefined)}>
          <span aria-hidden="true">←</span><span>路线总览</span>
        </button>
      </div>
      <section className="route-detail-hero">
        <p className="eyebrow">{route.level} · {route.steps.length} 个阶段 · {summary.totalCards} 张卡 · 约 {route.estimatedMinutes} 分钟</p>
        <h1>{route.title}</h1>
        <p>{route.summary}</p>
        <div className="route-detail-stats">
          <strong>{summary.reviewedCards}<small> / {summary.totalCards} 张练过</small></strong>
          <RouteProgressBar completed={summary.completedSteps} total={route.steps.length} />
        </div>
        {route.scenario ? <details className="route-learning-guide"><summary>学习场景与目标 <span className="route-teaching-label">教学场景</span></summary>
          <div><p>{route.scenario}</p>
            {route.outcomes ? <ul>{route.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul> : null}
            <p className="route-progress-note">练过表示完成过评分，不等于已经掌握；薄弱卡片仍按原有排期复习。</p>
          </div>
        </details> : <p className="route-progress-note">练过表示完成过评分，不等于已经掌握。</p>}
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
          const checkpoint = resolveRouteCheckpoint(step, cards);
          const stepReviewed = stepCards.filter((card) => (progress.get(card.id)?.reviewCount ?? 0) > 0).length;
          const complete = step.cardIds.length > 0 && stepReviewed === step.cardIds.length;
          const active = index === currentIndex;
          return (
            <div tabIndex={-1} id={`route-${step.id}`} className={active ? "route-step is-active" : complete ? "route-step is-complete" : "route-step"} key={step.id}>
              <div className="route-step-rail" aria-hidden="true">
                <span>{complete ? "✓" : String(index + 1).padStart(2, "0")}</span>
              </div>
              <article className="route-step-body">
                <div className="route-step-heading">
                  <div>
                    <p className="eyebrow">阶段 {index + 1}</p>
                    <h2>{step.title}</h2>
                  </div>
                  <span className="route-step-count">{stepReviewed}/{step.cardIds.length} 张练过</span>
                </div>
                <p className="route-step-purpose">{step.purpose}</p>
                <div className="route-step-cards">
                  {stepCards.length > 0 ? stepCards.map((card) => (
                    <div className="route-card-row" key={card.id}>
                      <span className="route-card-dot" aria-hidden="true" />
                      <span>{card.question}</span>
                      <small>{masteryLabel(progress.get(card.id))}</small>
                    </div>
                  )) : (
                    <p className="route-missing-copy">当前密文版本暂未包含本阶段卡片，更新题库后会自动出现。</p>
                  )}
                </div>
                {stepCards.length > 0 && stepCards.length < step.cardIds.length ? <p className="route-missing-copy">本阶段缺少 {step.cardIds.length - stepCards.length} 张卡片，请更新题库后再完整练习。</p> : null}
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
                <div className="route-step-footer">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={stepCards.length === 0}
                    onClick={() => onPractice(route, index)}
                  >
                    {complete ? "再练一遍" : active ? "练习本阶段" : "练习这一阶段"}
                  </button>
                  <span>{stepCards.length > 0 ? "评分会沿用到原题库进度" : "等待题库更新"}</span>
                </div>
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
        reviewed={activeStepReviewed}
        total={activeStep.cardIds.length}
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
          {activeReference ? <RouteReferenceReader reference={activeReference} onClose={closeReference} /> : null}
        </>
      ) : null}
    </main>
  );
}

export function RouteScreen({
  cards,
  documents = [],
  progress,
  selectedRouteId,
  onSelectRoute,
  onPractice,
}: RouteScreenProps) {
  const KNOWLEDGE_ROUTES = useKnowledgeRoutes();
  const route = selectedRouteId
    ? KNOWLEDGE_ROUTES.find((item) => item.id === selectedRouteId)
    : undefined;

  if (!route) {
    return <RouteList cards={cards} progress={progress} onSelectRoute={onSelectRoute} />;
  }

  return (
    <RouteDetail
      key={route.id}
      route={route}
      cards={cards}
      documents={documents}
      progress={progress}
      onSelectRoute={onSelectRoute}
      onPractice={onPractice}
    />
  );
}
