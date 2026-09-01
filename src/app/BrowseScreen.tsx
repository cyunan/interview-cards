import { useMemo, useState } from "react";

import type { CardV2 } from "../content/types";
import type { CardProgress } from "../study/scheduler";
import { Markdown } from "./Markdown";

type MasteryFilter = "all" | "new" | "weak" | "learning" | "mastered";

interface BrowseScreenProps {
  cards: CardV2[];
  progress: ReadonlyMap<string, CardProgress>;
}

function matchesMastery(
  card: CardV2,
  progress: ReadonlyMap<string, CardProgress>,
  filter: MasteryFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  const record = progress.get(card.id);
  if (filter === "new") {
    return !record;
  }
  if (!record) {
    return false;
  }
  if (filter === "weak") {
    return record.level <= 1;
  }
  if (filter === "learning") {
    return record.level >= 2 && record.level <= 3;
  }
  return record.level >= 4;
}

function BrowseAnswerSection({
  title,
  markdown,
}: {
  title: string;
  markdown?: string;
}) {
  if (!markdown) {
    return null;
  }
  return (
    <>
      <h3>{title}</h3>
      <Markdown>{markdown}</Markdown>
    </>
  );
}

export function BrowseScreen({ cards, progress }: BrowseScreenProps) {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const [topic, setTopic] = useState("all");
  const [mastery, setMastery] = useState<MasteryFilter>("all");
  const [expandedId, setExpandedId] = useState<string>();
  const [visibleCount, setVisibleCount] = useState(60);
  const categories = useMemo(
    () => [...new Set(cards.map((card) => card.category))].sort(),
    [cards],
  );
  const topics = useMemo(
    () =>
      [...new Set(
        cards
          .filter((card) => category === "all" || card.category === category)
          .map((card) => card.topic),
      )].sort(),
    [cards, category],
  );
  const filtered = useMemo(() => {
    const needle = keyword.trim().toLocaleLowerCase("zh-CN");
    return cards.filter((card) => {
      if (category !== "all" && card.category !== category) return false;
      if (topic !== "all" && card.topic !== topic) return false;
      if (!matchesMastery(card, progress, mastery)) return false;
      if (!needle) return true;
      return [
        card.question,
        card.quickAnswerMd,
        card.detailMd,
        card.projectHookMd,
        card.pitfallsMd,
        card.topic,
        card.category,
        card.source.path,
        card.source.heading,
        ...card.followUps.flatMap((followUp) => [
          followUp.question,
          followUp.answerMd,
        ]),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase("zh-CN").includes(needle));
    });
  }, [cards, category, keyword, mastery, progress, topic]);

  function resetWindow(): void {
    setVisibleCount(60);
    setExpandedId(undefined);
  }

  return (
    <main className="screen browse-screen">
      <section className="page-title">
        <p className="eyebrow">FREE BROWSE</p>
        <h1>自由浏览</h1>
        <p>筛选和翻看不会改变复习排期。</p>
      </section>

      <section className="filter-panel" aria-label="题库筛选">
        <label className="search-field">
          <span>关键词</span>
          <input
            type="search"
            value={keyword}
            placeholder="搜索题目或回答"
            onChange={(event) => {
              setKeyword(event.target.value);
              resetWindow();
            }}
          />
        </label>
        <div className="select-grid">
          <label>
            <span>分类</span>
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setTopic("all");
                resetWindow();
              }}
            >
              <option value="all">全部分类</option>
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>主题</span>
            <select value={topic} onChange={(event) => { setTopic(event.target.value); resetWindow(); }}>
              <option value="all">全部主题</option>
              {topics.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>掌握度</span>
            <select
              value={mastery}
              onChange={(event) => {
                setMastery(event.target.value as MasteryFilter);
                resetWindow();
              }}
            >
              <option value="all">全部掌握度</option>
              <option value="new">新题</option>
              <option value="weak">薄弱 · L0–L1</option>
              <option value="learning">学习中 · L2–L3</option>
              <option value="mastered">已掌握 · L4–L5</option>
            </select>
          </label>
        </div>
      </section>

      <div className="result-heading">
        <strong>{filtered.length}</strong>
        <span>张匹配卡片</span>
      </div>

      <section className="browse-list" aria-label="卡片列表">
        {filtered.slice(0, visibleCount).map((card, index) => {
          const record = progress.get(card.id);
          const expanded = expandedId === card.id;
          return (
            <article key={card.id} className={expanded ? "browse-card expanded" : "browse-card"}>
              <button
                type="button"
                className="browse-question"
                onClick={() => setExpandedId(expanded ? undefined : card.id)}
                aria-expanded={expanded}
              >
                <span className="browse-index">{String(index + 1).padStart(3, "0")}</span>
                <span className="browse-copy">
                  <small>{card.category} · {card.topic}</small>
                  <strong>{card.question}</strong>
                </span>
                <span className="level-badge">{record ? `L${record.level}` : "NEW"}</span>
              </button>
              {expanded ? (
                <div className="browse-answer">
                  <BrowseAnswerSection title="30 秒回答" markdown={card.quickAnswerMd} />
                  <BrowseAnswerSection title="展开要点" markdown={card.detailMd} />
                  <BrowseAnswerSection title="项目挂钩" markdown={card.projectHookMd} />
                  <BrowseAnswerSection title="易错点" markdown={card.pitfallsMd} />
                  {card.followUps.length > 0 ? (
                    <section className="browse-followups">
                      <h3>高频追问</h3>
                      {card.followUps.map((followUp, followUpIndex) => (
                        <div key={`${followUp.question}-${followUpIndex}`}>
                          <h4>{followUp.question}</h4>
                          {followUp.answerMd ? <Markdown>{followUp.answerMd}</Markdown> : null}
                        </div>
                      ))}
                    </section>
                  ) : null}
                  <p className="free-mode-note">自由浏览模式 · 本次查看不计入进度</p>
                </div>
              ) : null}
            </article>
          );
        })}
        {filtered.length === 0 ? <p className="empty-copy">没有符合当前条件的卡片。</p> : null}
      </section>
      {visibleCount < filtered.length ? (
        <button className="secondary-button load-more" type="button" onClick={() => setVisibleCount((count) => count + 60)}>
          再加载 60 张
        </button>
      ) : null}
    </main>
  );
}
