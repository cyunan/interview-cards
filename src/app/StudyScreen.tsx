import { useEffect, useMemo, useRef, useState } from "react";

import type { CardV2 } from "../content/types";
import type { ProgressStore } from "../storage/progress";
import {
  applyRating,
  scheduleSessionRepeat,
  type CardProgress,
  type Deck,
  type QueueItem,
  type Rating,
} from "../study/scheduler";
import { ProgressiveAnswer } from "./ProgressiveAnswer";

interface StudyScreenProps {
  deck: Deck;
  initialQueue: QueueItem[];
  progress: ReadonlyMap<string, CardProgress>;
  store: ProgressStore;
  now(): Date;
  onProgress(record: CardProgress): void;
  onExit(): void;
}

function Countdown({ cardKey }: { cardKey: string }) {
  const [seconds, setSeconds] = useState(30);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setSeconds(30);
    setPaused(false);
  }, [cardKey]);

  useEffect(() => {
    if (paused || seconds <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setSeconds((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [paused, seconds]);

  return (
    <button
      type="button"
      className={seconds === 0 ? "countdown countdown-done" : "countdown"}
      onClick={() => setPaused((current) => !current)}
      aria-label={`${seconds} 秒思考计时，${paused ? "继续" : "暂停"}`}
    >
      <span>{String(seconds).padStart(2, "0")}</span>
      <small>{seconds === 0 ? "可以作答" : paused ? "已暂停" : "秒思考"}</small>
    </button>
  );
}

function SourceAction({ card }: { card: CardV2 }) {
  const [copied, setCopied] = useState(false);

  async function copySource(): Promise<void> {
    try {
      await navigator.clipboard.writeText(card.source.path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="text-button source-button" type="button" onClick={() => void copySource()}>
      {copied ? "来源路径已复制" : "复制来源路径"}
    </button>
  );
}

export function StudyScreen({
  deck,
  initialQueue,
  progress,
  store,
  now,
  onProgress,
  onExit,
}: StudyScreenProps) {
  const cardsById = useMemo(
    () => new Map(initialQueue.map((item) => [item.card.id, item.card])),
    [initialQueue],
  );
  const [queueIds, setQueueIds] = useState(initialQueue.map((item) => item.card.id));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const flowRef = useRef<HTMLDivElement>(null);
  const card = cardsById.get(queueIds[currentIndex] ?? "");

  useEffect(() => {
    const flow = flowRef.current;
    if (currentIndex > 0 && flow && typeof flow.scrollIntoView === "function") {
      flow.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, [currentIndex]);

  async function rate(rating: Rating): Promise<void> {
    if (!card || saving) {
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const record = applyRating(card.id, progress.get(card.id), rating, now());
      await store.put(record);
      onProgress(record);
      if (rating === "again") {
        setQueueIds((current) =>
          scheduleSessionRepeat(current, card.id, currentIndex),
        );
      }
      setRevealed(false);
      setCurrentIndex((index) => index + 1);
    } catch {
      setError("进度保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  if (!card) {
    return (
      <main className="screen session-complete">
        <div className="complete-mark" aria-hidden="true">✓</div>
        <p className="eyebrow">SESSION COMPLETE</p>
        <h1>本轮完成</h1>
        <p>今天的回答已经记录到本机。休息一下，或回到首页换一套题库。</p>
        <button className="primary-button" type="button" onClick={onExit}>返回首页</button>
      </main>
    );
  }

  const total = queueIds.length;
  const completed = currentIndex;

  return (
    <main className="study-screen">
      <header className="study-header">
        <button className="icon-button" type="button" onClick={onExit} aria-label="退出本轮学习">×</button>
        <div className="study-progress">
          <progress
            aria-label={`本轮已完成 ${completed} / ${total}`}
            max={Math.max(total, 1)}
            value={completed}
          />
          <small>已完成 {completed} / {total}</small>
        </div>
        <span className="deck-pill">{deck === "sprint" ? "冲刺" : "完整"}</span>
      </header>

      <div ref={flowRef} className={revealed ? "study-flow is-revealed" : "study-flow"}>
        <article className={revealed ? "study-card is-revealed" : "study-card"}>
          <div className="question-meta">
            <span>{card.category}</span>
            <span>{card.topic}</span>
            <span className={`priority priority-${card.priority.toLowerCase()}`}>{card.priority}</span>
          </div>
          <div className="question-panel">
            <Countdown cardKey={`${card.id}:${currentIndex}`} />
            <p className="eyebrow">QUESTION</p>
            <h1>{card.question}</h1>
            {!revealed ? (
              <button aria-label="查看回答" className="reveal-button" type="button" onClick={() => setRevealed(true)}>
                <span>查看回答</span>
                <small>想好后随时翻面，不必等计时结束</small>
              </button>
            ) : null}
          </div>
        </article>

        {revealed ? (
          <section className="answer-panel" aria-label="回答">
            <ProgressiveAnswer key={`${card.id}:${currentIndex}`} card={card}>
              <div className="source-row">
                <span title={card.source.path}>{card.source.heading}</span>
                <SourceAction card={card} />
              </div>
            </ProgressiveAnswer>
          </section>
        ) : null}

        {revealed ? (
          <footer className="rating-dock">
            <p>这次答得怎么样？</p>
            {error ? <p role="alert" className="form-error">{error}</p> : null}
            <div>
              <button className="rating-again" disabled={saving} onClick={() => void rate("again")}>不会</button>
              <button className="rating-fuzzy" disabled={saving} onClick={() => void rate("fuzzy")}>模糊</button>
              <button className="rating-mastered" disabled={saving} onClick={() => void rate("mastered")}>掌握</button>
            </div>
          </footer>
        ) : null}
      </div>
    </main>
  );
}
