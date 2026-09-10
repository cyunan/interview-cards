import { useEffect, useId, useState, type ReactNode } from "react";

import type { CardV2 } from "../content/types";
import { Markdown } from "./Markdown";

interface ProgressiveAnswerProps {
  card: CardV2;
  children?: ReactNode;
}

function CollapsibleAnswerSection({
  className,
  label,
  markdown,
}: {
  className: string;
  label: string;
  markdown?: string;
}) {
  if (!markdown) {
    return null;
  }

  return (
    <details className={`answer-section ${className}`}>
      <summary>{label}</summary>
      <Markdown>{markdown}</Markdown>
    </details>
  );
}

function FollowUpAccordion({
  followUps,
  cardId,
}: {
  followUps: CardV2["followUps"];
  cardId: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const baseId = useId();

  useEffect(() => {
    setOpenIndex(null);
  }, [cardId]);

  return (
    <div className="followup-list">
      {followUps.map((followUp, index) => {
        const open = openIndex === index;
        const answerId = `${baseId}-answer-${index}`;

        return (
          <div
            className={open ? "followup-item is-open" : "followup-item"}
            key={`${followUp.question}-${index}`}
          >
            <button
              type="button"
              className="followup-question"
              aria-expanded={open}
              aria-controls={answerId}
              onClick={() => setOpenIndex(open ? null : index)}
            >
              <span className="followup-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="followup-question-text">{followUp.question}</span>
              <span className="followup-toggle" aria-hidden="true">
                {open ? "−" : "+"}
              </span>
            </button>
            {open && followUp.answerMd ? (
              <div id={answerId} className="followup-item-answer">
                <Markdown>{followUp.answerMd}</Markdown>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ProgressiveAnswer({ card, children }: ProgressiveAnswerProps) {
  return (
    <div className="progressive-answer">
      <section className="answer-section quick-answer">
        <h3>30 秒回答</h3>
        <Markdown>{card.quickAnswerMd}</Markdown>
      </section>
      <CollapsibleAnswerSection
        className="detail-answer"
        label="深入理解"
        markdown={card.detailMd}
      />
      <CollapsibleAnswerSection
        className="project-answer"
        label="项目怎么讲"
        markdown={card.projectHookMd}
      />
      <CollapsibleAnswerSection
        className="pitfall-answer"
        label="易错点"
        markdown={card.pitfallsMd}
      />
      {card.followUps.length > 0 ? (
        <details className="answer-section followup-section">
          <summary>高频追问 · {card.followUps.length}</summary>
          <FollowUpAccordion followUps={card.followUps} cardId={card.id} />
        </details>
      ) : null}
      {children}
    </div>
  );
}
