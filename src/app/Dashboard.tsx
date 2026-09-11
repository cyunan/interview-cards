import type { CardV2 } from "../content/types";
import { KNOWLEDGE_ROUTES } from "../routes/routes";
import { calculateStudyStreak } from "../storage/progress";
import type { CardProgress, Deck } from "../study/scheduler";

interface DashboardProps {
  cards: CardV2[];
  progress: ReadonlyMap<string, CardProgress>;
  today: string;
  onStart(deck: Deck): void;
  onOpenRoutes(): void;
}

function weakCategories(
  cards: CardV2[],
  progress: ReadonlyMap<string, CardProgress>,
): Array<{ name: string; count: number }> {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const counts = new Map<string, number>();
  for (const record of progress.values()) {
    const card = cardById.get(record.cardId);
    if (card && record.level <= 1) {
      counts.set(card.category, (counts.get(card.category) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 3);
}

export function Dashboard({ cards, progress, today, onStart, onOpenRoutes }: DashboardProps) {
  const records = [...progress.values()];
  const knownIds = new Set(cards.map((card) => card.id));
  const due = records.filter(
    (record) => knownIds.has(record.cardId) && record.dueOn <= today,
  ).length;
  const newCount = cards.filter((card) => !progress.has(card.id)).length;
  const weak = weakCategories(cards, progress);
  const sprintCount = cards.filter((card) => card.decks.includes("sprint")).length;
  const fullCount = cards.filter((card) => card.decks.includes("full")).length;
  const streak = calculateStudyStreak(records, today);

  return (
    <main className="screen dashboard-screen">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">{today} · 每天进步一点</p>
          <h1>今日复习</h1>
          <p>先说结论，再看展开。每天把最薄弱的部分往前推一点。</p>
        </div>
        <div className="daily-action">
          <button className="primary-button" onClick={() => onStart("full")} disabled={fullCount === 0}>开始今日复习 <span aria-hidden="true">→</span></button>
          <small>按今日计划安排 · 随时可以结束</small>
        </div>
      </section>

      <section className="metric-grid" aria-label="复习概况">
        <article>
          <span>今日待复习</span>
          <strong>{due}</strong>
        </article>
        <article>
          <span>尚未学习</span>
          <strong>{newCount}</strong>
        </article>
        <article>
          <span>连续学习 / 天</span>
          <strong>{streak}</strong>
        </article>
      </section>

      <section className="section-block route-section" aria-labelledby="route-title">
        <div className="section-heading route-section-heading">
          <div>
            <p className="eyebrow">BUILD THE WHY</p>
            <h2 id="route-title">沿路线学习</h2>
          </div>
          <button className="text-button" type="button" onClick={onOpenRoutes}>查看全部路线 →</button>
        </div>
        <button className="route-feature-card" type="button" onClick={onOpenRoutes}>
          <span className="route-feature-index">01</span>
          <span>
            <strong>{KNOWLEDGE_ROUTES[0].title}</strong>
            <small>{KNOWLEDGE_ROUTES[0].summary}</small>
          </span>
          <span className="route-feature-meta">{KNOWLEDGE_ROUTES[0].steps.length} 个阶段 · 约 {KNOWLEDGE_ROUTES[0].estimatedMinutes} 分钟 <span aria-hidden="true">→</span></span>
        </button>
      </section>

      <section className="section-block deck-section" aria-labelledby="deck-title">
        <div className="section-heading">
          <div>
            <h2 id="deck-title">复习工具</h2>
            <p className="section-note">路线负责串起理解；题库负责按掌握度安排重复。</p>
          </div>
        </div>
        <div className="deck-grid">
          <button aria-label="开始冲刺题库" className="deck-card sprint-deck" onClick={() => onStart("sprint")} disabled={sprintCount === 0}>
            <span className="deck-index">01</span>
            <span className="deck-copy">
              <strong>冲刺题库</strong>
              <small>高频结论，适合面试前快速过一遍</small>
            </span>
            <span className="deck-count">{sprintCount} 张</span>
            <span className="deck-action">开始冲刺题库</span>
          </button>
          <button aria-label="开始完整题库" className="deck-card full-deck" onClick={() => onStart("full")} disabled={fullCount === 0}>
            <span className="deck-index">02</span>
            <span className="deck-copy">
              <strong>完整题库</strong>
              <small>机制、边界与项目话术，系统补齐知识点</small>
            </span>
            <span className="deck-count">{fullCount} 张</span>
            <span className="deck-action">开始完整题库</span>
          </button>
        </div>
      </section>

      <section className="section-block weak-section" aria-labelledby="weak-title">
        <div className="section-heading">
          <div>
            <h2 id="weak-title">薄弱分类</h2>
          </div>
        </div>
        {weak.length > 0 ? (
          <div className="weak-list">
            {weak.map((item, index) => (
              <div key={item.name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.name}</strong>
                <small>{item.count} 张待巩固</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-copy">完成第一轮评价后，这里会显示需要优先补强的分类。</p>
        )}
      </section>
    </main>
  );
}
