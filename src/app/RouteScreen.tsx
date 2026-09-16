import { useMemo } from "react";

import type { CardV2 } from "../content/types";
import type { CardProgress } from "../study/scheduler";
import { Markdown } from "./Markdown";
import {
  getRouteProgress,
  KNOWLEDGE_ROUTES,
  resolveRouteCards,
  resolveRouteCheckpoint,
  type KnowledgeRoute,
} from "../routes/routes";

interface RouteScreenProps {
  cards: CardV2[];
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

function RouteList({
  cards,
  progress,
  onSelectRoute,
}: Pick<RouteScreenProps, "cards" | "progress" | "onSelectRoute">) {
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
  progress,
  onSelectRoute,
  onPractice,
}: {
  route: KnowledgeRoute;
  cards: CardV2[];
  progress: ReadonlyMap<string, CardProgress>;
  onSelectRoute(routeId?: string): void;
  onPractice(route: KnowledgeRoute, stepIndex: number): void;
}) {
  const summary = useMemo(() => getRouteProgress(route, cards, progress), [cards, progress, route]);

  return (
    <main className="screen route-detail-screen">
      <button className="route-back-button" type="button" onClick={() => onSelectRoute(undefined)}>
        <span aria-hidden="true">←</span> 全部路线
      </button>
      <section className="route-detail-hero">
        <p className="eyebrow">{route.level} · 约 {route.estimatedMinutes} 分钟</p>
        <h1>{route.title}</h1>
        <p>{route.summary}</p>
        <div className="route-detail-stats">
          <strong>{summary.reviewedCards}<small> / {summary.totalCards} 张练过</small></strong>
          <RouteProgressBar completed={summary.completedSteps} total={route.steps.length} />
        </div>
        <p>练过表示完成过评分，不等于已经掌握；薄弱卡片仍按原有排期复习。</p>
        {route.scenario ? <div className="route-scenario"><h2>跟着这个页面学</h2><p>{route.scenario}</p>
          {route.outcomes ? <ul>{route.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul> : null}
        </div> : null}
      </section>
      <nav className="route-stage-nav" aria-label="跳转学习阶段">
        {route.steps.map((step, index) => <a key={step.id} href={`#route-${step.id}`}>{index + 1}. {step.title.split("：")[0]}</a>)}
      </nav>

      <section className="route-timeline" aria-label={`${route.title}学习阶段`}>
        {route.steps.map((step, index) => {
          const stepCards = resolveRouteCards(step, cards);
          const checkpoint = resolveRouteCheckpoint(step, cards);
          const stepReviewed = stepCards.filter((card) => (progress.get(card.id)?.reviewCount ?? 0) > 0).length;
          const complete = step.cardIds.length > 0 && stepReviewed === step.cardIds.length;
          const active = index === summary.nextStepIndex;
          return (
            <div id={`route-${step.id}`} className={active ? "route-step is-active" : complete ? "route-step is-complete" : "route-step"} key={step.id}>
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
    </main>
  );
}

export function RouteScreen({
  cards,
  progress,
  selectedRouteId,
  onSelectRoute,
  onPractice,
}: RouteScreenProps) {
  const route = selectedRouteId
    ? KNOWLEDGE_ROUTES.find((item) => item.id === selectedRouteId)
    : undefined;

  if (!route) {
    return <RouteList cards={cards} progress={progress} onSelectRoute={onSelectRoute} />;
  }

  return (
    <RouteDetail
      route={route}
      cards={cards}
      progress={progress}
      onSelectRoute={onSelectRoute}
      onPractice={onPractice}
    />
  );
}
