import { useId, useState } from "react";
import { Markdown } from "./Markdown";
import type { CardV2 } from "../content/types";
import {
  findDiagram, findOrderedSteps, officialSources, plainText, previewText, sectionText,
  type ReadingSource,
} from "./reading-data";

const isFlowQuestion = (card: CardV2) => /^kotlin-kotlin-0(28|30)$/.test(card.id);

const flowScenarios = [
  {
    label: "只重建页面",
    example: "例：订单已确认，旋转屏幕后回到同一个页面。",
    steps: [
      ["界面重建", "配置变化会重建界面，同一作用域的 ViewModel 可以继续保留。"],
      ["ViewModel", "保留的 ViewModel 仍可提供当前的 UI 状态，例如「已支付」。"],
      ["重新收集", "新界面开始收集 StateFlow，拿到当前状态与后续更新。"],
    ],
  },
  {
    label: "整个进程重启",
    example: "例：订单已写入数据库，App 进程被回收后重新启动。",
    steps: [
      ["持久订单", "Room 中已提交的订单还在，可以按订单 ID 找到它。"],
      ["Repository", "读取当前订单状态，必要时再向服务端核对。"],
      ["重建状态", "新的 ViewModel 根据查询结果构建 StateFlow，再由页面收集。"],
    ],
  },
];

function FlowExample() {
  const [scenario, setScenario] = useState(0);
  const [selected, setSelected] = useState(0);
  const active = flowScenarios[scenario];
  return (
    <>
      <h3>支付结果回来后，页面怎么显示？</h3>
      <div className="reading-scenarios" role="group" aria-label="对比恢复场景">
        {flowScenarios.map((item, index) => <button className="reading-button" type="button" key={item.label} aria-pressed={index === scenario}
          onClick={() => { setScenario(index); setSelected(0); }}>{item.label}</button>)}
      </div>
      <p className="reading-muted">{active.example}</p>
      <div className="reading-chain" role="group" aria-label="运行过程">
        {active.steps.map(([name], index) => (
          <button type="button" key={name} className="reading-button" aria-pressed={index === selected} onClick={() => setSelected(index)}>{name}</button>
        ))}
      </div>
      <p className="reading-inline-detail" aria-live="polite">{active.steps[selected][1]}</p>
    </>
  );
}

function Mechanism({ card, sources }: { card: CardV2; sources: ReadingSource[] }) {
  if (isFlowQuestion(card)) return <FlowExample />;
  const primary = sources[0];
  const excerpt = primary?.heading ? sectionText(primary.document.markdown, primary.heading) : "";
  const detail = card.detailMd ?? "";
  const diagram = findDiagram(detail) ?? findDiagram(excerpt);
  const steps = findOrderedSteps(detail);
  if (!diagram && steps.length === 0) {
    return <p className="reading-muted">{primary ? "可在下方原文查看这一机制的实现、例子与适用条件。" : "这条问答的机制和边界在左侧回答及追问中。"}</p>;
  }
  return diagram ? <Markdown>{diagram}</Markdown> : <Markdown>{steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}</Markdown>;
}

export interface SourceActions {
  openDocument(id: string, heading?: string, opener?: HTMLElement): void;
}

function SourceList({ sources, card, openDocument }: { sources: ReadingSource[]; card: CardV2 } & SourceActions) {
  const prefix = useId();
  const [preview, setPreview] = useState<string>();
  const external = officialSources([card.detailMd, card.quickAnswerMd, ...sources.slice(0, 3).map(
    item => sectionText(item.document.markdown, item.heading),
  )].filter(Boolean).join("\n"));
  return (
    <details className="reading-sources reading-paper">
      <summary>笔记与资料出处</summary>
      {sources.length > 0 ? <section className="reading-source-group">
        <h3>本地笔记</h3>
        <ul>
          {sources.map(({ document: note, heading }) => {
            const selected = preview === note.id;
            const previewId = prefix + "-" + note.id;
            const excerpt = previewText(sectionText(note.markdown, heading));
            return (
              <li key={note.id}>
                <div className="reading-source-row">
                  <button className="reading-source-open" type="button" aria-label={`阅读全文：${note.title}`} onClick={event => openDocument(note.id, undefined, event.currentTarget)}>
                    <span>{plainText(note.title)}</span><span aria-hidden="true">→</span>
                  </button>
                  <button className="reading-source-toggle" type="button" aria-controls={previewId} aria-expanded={selected}
                    aria-label={`${selected ? "收起" : "预览"}：${note.title}`} onClick={() => setPreview(selected ? undefined : note.id)}>{selected ? "收起" : "预览"}</button>
                </div>
                <div className="reading-inline-detail" id={previewId} hidden={!selected}>
                  {heading ? <strong>{plainText(heading)}</strong> : null}
                  <p>{excerpt || note.reason}</p>
                  {heading ? <button className="reading-link" type="button" onClick={event => openDocument(note.id, heading, event.currentTarget)}>定位到原文章节 →</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section> : <p className="reading-muted">出处：{card.source.path}</p>}
      {external.length > 0 ? <section className="reading-source-group">
        <h3>官方资料与参考链接</h3>
        <ul>{external.map(({ url, title }) => (
          <li key={url} className="reading-source-row">
            <a className="reading-source-open" href={url} target="_blank" rel="noopener noreferrer"><span>{title}</span><span aria-hidden="true">↗</span></a>
          </li>
        ))}</ul>
      </section> : null}
    </details>
  );
}

type Concept = { label: string; relation: string; content: string; follow?: number; source?: ReadingSource };

function ConceptGraph({ card, sources, onFollowup, openDocument }: {
  card: CardV2; sources: ReadingSource[]; onFollowup(index: number): void;
} & SourceActions) {
  const [index, setIndex] = useState(0);
  const prefersFlow = isFlowQuestion(card);
  const concepts: Concept[] = prefersFlow ? [
    { label: "SharedFlow", relation: "一次性提示", content: "无人订阅时，replay=0 不会为之后的收集者保留旧通知。", follow: 0 },
    { label: "StateFlow", relation: "当前界面", content: "新界面重新收集时会拿到当前值。", source: sources.find(item => /StateFlow/.test(item.document.title)) },
    { label: "持久订单", relation: "进程重启", content: "用持久化订单恢复业务状态，再根据查到的结果重建页面状态。", follow: card.followUps.length > 1 ? 1 : undefined },
  ] : [
    ...card.followUps.slice(0, 3).map((item, follow) => ({
      label: item.question, relation: "追问", content: item.answerMd ?? "", follow,
    })),
    ...sources.slice(0, card.followUps.length ? 1 : 3).map(source => ({
      label: source.document.title, relation: source.relation, content: previewText(sectionText(source.document.markdown, source.heading), 160), source,
    })),
  ];
  if (!concepts.length) return <p className="reading-muted">当前问答可从参考回答继续阅读。</p>;
  const selected = concepts[index] ?? concepts[0];
  return (
    <>
      <div className="reading-concepts" aria-label="当前问答的知识图谱">
        <span className="reading-concept-root">{prefersFlow ? "支付结果" : plainText(card.topic)}</span>
        <ul>{concepts.map((concept, node) => (
          <li key={node}>
            <span>{concept.relation}</span>
            <button type="button" aria-pressed={node === index} onClick={() => setIndex(node)}>{plainText(concept.label)}</button>
          </li>
        ))}</ul>
      </div>
      <div className="reading-inline-detail" aria-live="polite">
        {selected.content ? <Markdown>{selected.content}</Markdown> : null}
        {selected.follow !== undefined && card.followUps[selected.follow]
          ? <button type="button" className="reading-link" onClick={() => onFollowup(selected.follow!)}>看对应追问 →</button>
          : selected.source ? <button type="button" className="reading-link" onClick={event => openDocument(selected.source!.document.id, selected.source!.heading, event.currentTarget)}>读相关章节 →</button> : null}
      </div>
    </>
  );
}

export function ReadingContext({ card, sources, onFollowup, openDocument }: {
  card: CardV2; sources: ReadingSource[]; onFollowup(index: number): void;
} & SourceActions) {
  const flow = isFlowQuestion(card);
  const overview = flow ? "无人订阅时，replay=0 的 SharedFlow 不会给后来的人补发。" :
    previewText(card.detailMd ?? card.quickAnswerMd, 135) || previewText(card.quickAnswerMd, 135);
  const boundary = flow ? "界面重建可以接回当前 UI 状态，进程重启后要查已保存的订单。" :
    previewText(card.pitfallsMd ?? card.followUps.find(item => item.answerMd)?.answerMd ?? "", 135);
  return (
    <aside className="reading-context" aria-label="当前问答的技术资料">
      <section className="reading-paper">
        <h2>复习要点</h2>
        <div className="reading-takeaways">
          <p><strong>{flow ? "提示可能错过" : "关键机制"}</strong>{overview}</p>
          {boundary && boundary !== overview ? <p><strong>{flow ? "订单可以恢复" : "再问一步"}</strong>{boundary}</p> : null}
        </div>
      </section>
      <section className="reading-paper" id="reading-mechanism">
        <h2>原理与运行过程</h2>
        <Mechanism card={card} sources={sources} />
      </section>
      <section className="reading-paper" id="reading-concepts">
        <h2>相关知识怎么连</h2>
        <ConceptGraph card={card} sources={sources} onFollowup={onFollowup} openDocument={openDocument} />
      </section>
      <SourceList sources={sources} card={card} openDocument={openDocument} />
    </aside>
  );
}
