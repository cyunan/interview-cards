import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readingTarget } from "../content/reading-links";
import { installFrameStyles } from "./resume-frame";
import "./ResumeInterview.css";

function text(element: Element | null) { return element?.textContent?.trim() ?? ""; }

function readTopics(doc: Document) {
  const template = doc.querySelector<HTMLTemplateElement>("template#resume-interview-topics");
  const topics = new Map<string, {
    title: string; answer: string; followups: { question: string; answer: string }[];
    sources: { id: string; heading?: string; label: string }[];
  }>();
  template?.content.querySelectorAll<HTMLElement>("section[data-topic]").forEach(section => {
    const key = section.dataset.topic;
    const title = text(section.querySelector(":scope > h2"));
    const answer = text(section.querySelector(":scope > p"));
    const followups = Array.from(section.querySelectorAll(":scope > details"), detail => ({
      question: text(detail.querySelector("summary")), answer: text(detail.querySelector("p")),
    })).filter(item => item.question && item.answer);
    const sources = Array.from(section.querySelectorAll<HTMLAnchorElement>("a[href]")).flatMap(link => {
      const target = readingTarget(link.getAttribute("href") ?? "");
      const label = text(link);
      return target && label ? [{ ...target, label }] : [];
    });
    if (key && title && answer && sources.length) topics.set(key, { title, answer, followups, sources });
  });
  return topics;
}

// The iframe remains a script-free print document. The host adds controls only
// to labels which actually resolve to a topic in this edition.
const frameStyles = `
  .resume-topic-control { display:inline-block; max-inline-size:100%; }
  /* The native disclosure's empty content box otherwise breaks the line after the label. */
  @supports selector(details::details-content) {
    .resume-topic-control { display:inline; }
    .resume-topic-control::details-content { display:none; }
  }
  .resume-topic-trigger::-webkit-details-marker { display:none; }
  .resume-topic-trigger::marker { content:""; }
  .resume-topic-trigger { list-style:none; appearance:none; display:inline; font:inherit; letter-spacing:inherit;
    color:inherit; line-height:inherit; text-align:inherit; background:transparent; border:0;
    border-radius:3px; padding:0; margin:0; cursor:pointer; text-decoration:underline dotted #66938c;
    text-decoration-thickness:1px; text-underline-offset:3px; }
  .resume-topic-trigger:is(:hover,:focus-visible) { color:#075e55; background:#e0f1e9; text-decoration-style:solid; }
  .resume-topic-trigger:focus-visible { outline:2px solid #147b70; outline-offset:3px; }
  @media print { .resume-topic-trigger { text-decoration:none; background:transparent; } }
`;

interface ResumeInterviewProps {
  frameDocument: Document;
  entry?: string;
  onEntryChange?(entry?: string): void;
  onOpen(id: string, heading?: string): void;
}

export function ResumeInterview({ frameDocument, entry, onEntryChange, onOpen }: ResumeInterviewProps) {
  const topics = useMemo(() => readTopics(frameDocument), [frameDocument]);
  const [localEntry, setLocalEntry] = useState<string>();
  const selected = onEntryChange ? entry : localEntry;
  const changeEntry = onEntryChange ?? setLocalEntry;
  const triggers = useRef(new Map<string, HTMLElement>());
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const topic = selected ? topics.get(selected.split("~", 1)[0]) : undefined;

  useLayoutEffect(() => {
    const buttons = triggers.current;
    const occurrences = new Map<string, number>();
    const removeStyles = installFrameStyles(frameDocument, frameStyles);
    for (const host of frameDocument.querySelectorAll<HTMLElement>("[data-interview-topic]")) {
      const key = host.dataset.interviewTopic!;
      if (!topics.has(key)) continue;
      const count = occurrences.get(key) ?? 0;
      const position = count ? key + "~" + count : key;
      occurrences.set(key, count + 1);
      const control = frameDocument.createElement("details");
      control.className = "resume-topic-control";
      control.dataset.entry = position;
      const button = frameDocument.createElement("summary");
      button.setAttribute("role", "button");
      button.className = "resume-topic-trigger";
      button.setAttribute("aria-haspopup", "dialog");
      button.title = "查看面试回答与追问";
      button.append(...Array.from(host.childNodes));
      control.append(button);
      host.append(control);
      buttons.set(position, button);
    }
    return () => {
      for (const button of buttons.values()) button.parentElement?.replaceWith(...Array.from(button.childNodes));
      buttons.clear();
      removeStyles();
    };
  }, [frameDocument, topics]);

  useEffect(() => {
    // WebKit also disables event handlers registered by the parent on a
    // sandboxed child. Native disclosure activation still toggles `open`.
    // Observe the DOM from the host realm, without enabling child scripts.
    const observer = new MutationObserver(records => {
      for (const record of records) {
        const control = record.target as HTMLDetailsElement;
        if (!control.open || !control.classList.contains("resume-topic-control")) continue;
        control.open = false;
        changeEntry(control.dataset.entry);
        break;
      }
    });
    observer.observe(frameDocument.body, { attributes: true, attributeFilter: ["open"], subtree: true });
    return () => observer.disconnect();
  }, [frameDocument, changeEntry]);

  useLayoutEffect(() => {
    const panel = dialog.current;
    const trigger = selected && triggers.current.get(selected);
    if (!topic || !panel || !trigger) return;
    const previousOverflow = document.body.style.overflow;
    const saved = window.history.state?.resumeInterviewReading;
    panel.showModal();
    document.body.style.overflow = "hidden";
    close.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => {
      if (saved?.entry === selected) {
        if (Number.isFinite(saved.scroll)) window.scrollTo(0, saved.scroll);
        const details = panel.querySelectorAll("details");
        if (Array.isArray(saved.expanded)) {
          for (const index of saved.expanded) if (details[index]) details[index].open = true;
        }
        if (content.current && Number.isFinite(saved.panelScroll)) content.current.scrollTop = saved.panelScroll;
      } else {
        trigger.scrollIntoView?.({ block: "nearest" });
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      panel.close();
      document.body.style.overflow = previousOverflow;
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [topic, selected]);

  if (!topic || !selected) return null;
  function openSource(id: string, heading?: string) {
    const expanded = Array.from(dialog.current?.querySelectorAll("details") ?? [])
      .flatMap((item, index) => item.open ? [index] : []);
    window.history.replaceState({ ...window.history.state, resumeInterviewReading: {
      entry: selected, scroll: window.scrollY, panelScroll: content.current?.scrollTop ?? 0, expanded,
    } }, "");
    onOpen(id, heading);
  }

  return <dialog ref={dialog} className="resume-interview" aria-labelledby={titleId}
    onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
    onCancel={event => { event.preventDefault(); changeEntry(undefined); }}
    onClick={event => {
      if (event.target !== dialog.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) changeEntry(undefined);
    }}>
    <div className="resume-interview-inner">
      <header className="resume-interview-bar"><span>简历面试解读</span>
        <button type="button" ref={close} aria-label="关闭面试解读" onClick={() => changeEntry(undefined)}>
          <span aria-hidden="true">×</span></button>
      </header>
      <div className="resume-interview-content" ref={content}>
        <h2 id={titleId}>{topic.title}</h2>
        <section className="resume-interview-answer">
          <h3>面试回答</h3><p>{topic.answer}</p>
        </section>
        {topic.followups.length > 0 && <section className="resume-interview-followups">
          <h3>继续追问</h3>
          {topic.followups.map(item => <details key={item.question}>
            <summary>{item.question}</summary><p>{item.answer}</p>
          </details>)}
        </section>}
        <section className="resume-interview-sources">
          <h3>完整文档</h3>
          {topic.sources.map(source => {
            const hash = new URLSearchParams({ view: "resume", doc: source.id });
            if (source.heading) hash.set("heading", source.heading);
            return <a key={source.id + (source.heading ?? "")} href={"#" + hash.toString()} onClick={event => {
              if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault(); openSource(source.id, source.heading);
            }}>{source.label}<span aria-hidden="true">→</span></a>;
          })}
        </section>
      </div>
    </div>
  </dialog>;
}
