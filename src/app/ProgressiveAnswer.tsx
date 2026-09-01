import type { ReactNode } from "react";

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
        <details className="answer-section followup-answer">
          <summary>高频追问 · {card.followUps.length}</summary>
          <div className="followup-list">
            {card.followUps.map((followUp, index) => (
              <div key={`${followUp.question}-${index}`}>
                <h4>{followUp.question}</h4>
                {followUp.answerMd ? <Markdown>{followUp.answerMd}</Markdown> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {children}
    </div>
  );
}
