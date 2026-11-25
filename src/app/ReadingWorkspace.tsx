import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { ParsedCardsPayload, ReferenceDocument } from "../content/payload";
import { readingTarget } from "../content/reading-links";
import type { CardV2 } from "../content/types";
import { KNOWLEDGE_ROUTES, type KnowledgeRoute } from "../routes/routes";
import { KnowledgeRoutesContext } from "../routes/context";
import { DocumentLibrary } from "./DocumentLibrary";
import { DocumentReading } from "./DocumentReading";
import { Markdown } from "./Markdown";
import { ReadingContext } from "./ReadingContext";
import { RouteScreen } from "./RouteScreen";
import { listQuestionTopics, questionTopic } from "./question-topics";
import { plainText, relatedSources, textKey } from "./reading-data";
import "./reading-workspace.css";
import "./document-library.css";

type WorkspaceView = "questions" | "documents" | "routes";
interface QuestionScope {
  category?: string;
  topic?: string;
}
interface ReadingLocation extends QuestionScope {
  view: WorkspaceView;
  card?: string;
  doc?: string;
  heading?: string;
  step?: string;
}

const viewLabels: Record<WorkspaceView, string> = { questions: "面试问答", documents: "技术文档", routes: "学习路线" };
const viewIcons: Record<WorkspaceView, string> = { questions: "⌂", documents: "▤", routes: "↗" };
const emptyDocuments: ReferenceDocument[] = [];
const allQuestions = "all";

function currentLocation(): ReadingLocation {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith("route-") && !hash.includes("=")) return { view: "routes", step: hash.slice(6) };
  const params = new URLSearchParams(hash);
  const current = params.get("view");
  return {
    view: current === "documents" || current === "routes" ? current : "questions",
    card: params.get("card") ?? undefined, doc: params.get("doc") ?? undefined,
    heading: params.get("heading") ?? undefined, step: params.get("step") ?? undefined,
    category: params.get("category") ?? undefined, topic: params.get("topic") ?? undefined,
  };
}

function locationHash(location: ReadingLocation) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(location)) if (value) params.set(key, value);
  return "#" + params.toString();
}

function categoryName(value: string) {
  return value.replace(/^\d{2}-/, "").replace(/^个人资料$/, "项目与技术速记");
}
function jumpTo(id: string) { document.getElementById(id)?.scrollIntoView?.({ block: "start" }); }

function WorkspaceHeading({ title, description }: { title: string; description: string }) {
  return <header className="reading-page-heading">
    <h1>{title}</h1>
    <p>{description}</p>
  </header>;
}

function QuestionReading({ card, docs, routes, onOpenDocument }: {
  card: CardV2; docs: ReferenceDocument[]; routes: KnowledgeRoute[];
  onOpenDocument(id: string, heading?: string, opener?: HTMLElement): void;
}) {
  const [followup, setFollowup] = useState<number | null>(() => card.followUps.length ? 0 : null);
  const sources = useMemo(() => relatedSources(card, docs, routes), [card, docs, routes]);
  const images = card.images ?? sources.find(source => source.relation === "问答出处")?.document.images;
  function openFollowup(index: number) {
    setFollowup(index);
    requestAnimationFrame(() => {
      document.getElementById("reading-followup-button-" + index)?.focus({ preventScroll: true });
      jumpTo("reading-followup-" + index);
    });
  }
  function followInlineLink(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a");
    if (!link) return;
    const target = readingTarget(link.href);
    if (!target) return;
    event.preventDefault();
    onOpenDocument(target.id, target.heading, link);
  }
  return (
    <div className="reading-columns" onClick={followInlineLink}>
      <article className="reading-paper reading-answer">
        <p className="reading-label">面试官问 <span>{questionTopic(card)}</span></p>
        <h2 id="reading-question-title" className="reading-question-title" tabIndex={-1}>{plainText(card.question)}</h2>
        <section className="reading-quick" aria-label="参考回答">
          <h2>参考回答</h2>
          <Markdown images={images}>{card.quickAnswerMd}</Markdown>
        </section>
        <div className="reading-jumps" aria-label="从回答延伸">
          <button type="button" className="reading-button" onClick={() => jumpTo("reading-mechanism")}>看运行过程 ↓</button>
          <button type="button" className="reading-button" onClick={() => jumpTo("reading-concepts")}>看概念关系 ↓</button>
          <button type="button" className="reading-button reading-mobile-action" onClick={() => {
            const sources = document.getElementById("reading-question-sources") as HTMLDetailsElement | null;
            if (!sources) return;
            sources.open = true;
            sources.querySelector("summary")?.focus({ preventScroll: true });
            jumpTo(sources.id);
          }}>看资料 ↓</button>
        </div>
        {card.detailMd ? <section className="reading-detail">
          <h2>沿着回答讲原理</h2>
          <Markdown images={images}>{card.detailMd}</Markdown>
        </section> : null}
        {card.projectHookMd ? <details className="reading-fold"><summary>项目里的做法</summary><Markdown images={images}>{card.projectHookMd}</Markdown></details> : null}
        {card.pitfallsMd ? <details className="reading-fold"><summary>容易说错的地方</summary><Markdown images={images}>{card.pitfallsMd}</Markdown></details> : null}
        {card.followUps.length > 0 ? <section className="reading-followups">
          <h2>面试官继续追问</h2>
          {card.followUps.map(({ question, answerMd }, index) => (
            <div key={index} id={"reading-followup-" + index} className="reading-followup">
              <button className="reading-followup-title" id={"reading-followup-button-" + index} type="button"
                aria-expanded={followup === index} aria-controls={"reading-followup-panel-" + index}
                onClick={() => setFollowup(followup === index ? null : index)}>
                {plainText(question)}<span aria-hidden="true">{followup === index ? "−" : "+"}</span>
              </button>
              <div id={"reading-followup-panel-" + index} hidden={followup !== index}>
                {followup === index ? (
                  <>
                    {answerMd ? <Markdown images={images}>{answerMd}</Markdown> : <p className="reading-muted">这条追问暂未收录独立答案，可结合上面的原理阅读。</p>}
                    <button type="button" className="reading-link" onClick={() => jumpTo("reading-concepts")}>回看概念关系 ↗</button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </section> : null}
      </article>
      <ReadingContext card={card} sources={sources} openDocument={onOpenDocument} onFollowup={openFollowup} />
    </div>
  );
}

function QuestionBrowser({ cards, location, query, docs, routes, onQueryChange, onNavigate, onOpenDocument }: {
  cards: CardV2[]; location: ReadingLocation; query: string;
  docs: ReferenceDocument[]; routes: KnowledgeRoute[];
  onQueryChange(query: string): void;
  onNavigate(scope: QuestionScope & { card?: string }): void;
  onOpenDocument(id: string, heading?: string, opener?: HTMLElement): void;
}) {
  const listId = useId();
  const directory = useRef<HTMLElement>(null);
  const chooser = useRef<HTMLButtonElement>(null);
  const directoryScroll = useRef(0);
  const [choosing, setChoosing] = useState(false);
  const [collapsedMatches, setCollapsedMatches] = useState<string[]>([]);
  const categories = useMemo(() => [...new Set(cards.map(card => card.category))].sort(), [cards]);
  const entries = useMemo(() => cards.map(card => {
    const topic = questionTopic(card);
    return { card, topic, search: textKey([card.question, card.category, card.topic, topic, card.id].join(" ")) };
  }), [cards]);
  const selected = entries.find(entry => entry.card.id === location.card) ??
    entries.find(entry => entry.card.id === "kotlin-kotlin-030") ?? entries[0];
  const requestedCategory = location.category ?? selected?.card.category ?? allQuestions;
  const category = categories.includes(requestedCategory) ? requestedCategory : allQuestions;
  const showAll = category === allQuestions;
  const visibleCategories = showAll ? categories : [category];
  const searched = textKey(query);
  const groups = visibleCategories.flatMap(value => {
    const matches = entries.filter(entry => entry.card.category === value && entry.search.includes(searched));
    return listQuestionTopics(matches).map(([name]) => ({
      key: showAll ? value + "/" + name : name,
      label: showAll ? categoryName(value) + " / " + name : name,
      questions: matches.filter(entry => entry.topic === name).map(entry => entry.card),
    }));
  });
  const expandedTopic = location.topic ?? groups.find(group => group.questions.some(card => card.id === selected?.card.id))?.key ?? groups[0]?.key;
  const count = groups.reduce((total, group) => total + group.questions.length, 0);

  function chooseCategory(value: string) {
    const matches = entries.filter(entry => entry.card.category === value);
    const firstTopic = listQuestionTopics(matches.filter(entry => entry.search.includes(searched)))[0]?.[0] ??
      listQuestionTopics(matches)[0]?.[0];
    setCollapsedMatches([]);
    onNavigate({ category: value, topic: firstTopic ?? allQuestions, card: selected?.card.id });
  }

  function toggleTopic(key: string, isOpen: boolean) {
    if (searched) {
      setCollapsedMatches(matches => isOpen ? [...matches, key] : matches.filter(match => match !== key));
    } else {
      onNavigate({ category, topic: isOpen ? allQuestions : key, card: selected?.card.id });
    }
  }

  function selectQuestion(card: CardV2, topic: string) {
    onNavigate({ category, topic, card: card.id });
    setChoosing(false);
    requestAnimationFrame(() => {
      const title = document.getElementById("reading-question-title");
      if (!title) return;
      const stackedLayout = window.innerWidth < 700;
      const bounds = title.getBoundingClientRect();
      if (stackedLayout) {
        title.focus({ preventScroll: true });
        jumpTo("reading-answer-pane");
      } else if (bounds.top < 44 || bounds.bottom > window.innerHeight) {
        jumpTo(title.id);
      }
    });
  }

  function returnToAnswer() {
    setChoosing(false);
    requestAnimationFrame(() => {
      chooser.current?.focus({ preventScroll: true });
      window.scrollTo(0, directoryScroll.current);
    });
  }

  function showDirectory() {
    directoryScroll.current = window.scrollY;
    setChoosing(true);
    requestAnimationFrame(() => {
      directory.current?.querySelector("h2")?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    });
  }

  return (
    <main className="reading-body reading-questions" data-choosing={choosing} onKeyDown={event => {
      if (event.key === "Escape" && choosing && !event.defaultPrevented) {
        event.preventDefault();
        returnToAnswer();
      }
    }}>
      <WorkspaceHeading title="面试问答" description="展开专题，选一道题，从回答接着读原理和资料。" />
      <div className="reading-mobile-chooser">
        {choosing
          ? <button type="button" className="reading-button" onClick={returnToAnswer}>← 返回回答</button>
          : <button type="button" ref={chooser} className="reading-button" onClick={showDirectory}>☰ 换一道题</button>}
      </div>
      <div className="reading-question-workspace">
        <nav className="reading-directory reading-paper" aria-label="问答目录" ref={directory}>
          <header className="reading-filter-heading">
            <h2 tabIndex={-1}>问答目录</h2>
            <span role="status">{count} 条问答</span>
          </header>
          <div className="reading-search-row reading-directory-fields">
            <label><span>一级分类</span>
              <select value={category} onChange={event => chooseCategory(event.target.value)}>
                <option value={allQuestions}>全部分类</option>
                {categories.map(value => <option key={value} value={value}>{categoryName(value)}</option>)}
              </select>
            </label>
            <label><span>搜索问答</span><input type="search" value={query}
              placeholder={showAll ? "搜索全库问答" : "搜索当前分类"}
              onChange={event => { setCollapsedMatches([]); onQueryChange(event.target.value); }} /></label>
          </div>
          {groups.length > 0 ? <ul className="reading-topic-list">
            {groups.map(({ key, label, questions }, index) => {
              const id = listId + "-topic-" + index;
              const isOpen = searched ? !collapsedMatches.includes(key) : expandedTopic === key;
              return <li key={key} className="reading-topic">
                <button type="button" className="reading-topic-title" aria-expanded={isOpen} aria-controls={id}
                  onClick={() => toggleTopic(key, isOpen)}>
                  <span className="reading-topic-chevron" aria-hidden="true" />
                  <span>{label}</span><span className="reading-topic-count">{questions.length}</span>
                </button>
                <ul id={id} hidden={!isOpen} className="reading-topic-questions">
                  {isOpen ? questions.map(card => (
                    <li key={card.id}>
                      <button type="button" className="reading-question-option"
                        aria-current={card.id === selected?.card.id ? "true" : undefined}
                        onClick={() => selectQuestion(card, key)}>{plainText(card.question)}</button>
                    </li>
                  )) : null}
                </ul>
              </li>;
            })}
          </ul> : <p className="reading-directory-empty">没有匹配的问答。换个关键词，或选「全部分类」搜索全库。</p>}
        </nav>
        <div id="reading-answer-pane" className="reading-answer-pane">
          {selected ? <QuestionReading key={selected.card.id} card={selected.card} docs={docs} routes={routes} onOpenDocument={onOpenDocument} /> : <div className="reading-paper reading-empty"><h2>暂无面试问答</h2></div>}
        </div>
      </div>
    </main>
  );
}

export function ReadingWorkspace({ payload, onLock }: { payload: ParsedCardsPayload; onLock?: () => void }) {
  const [navigation, setNavigation] = useState(() => {
    const location = currentLocation();
    const lastQuestion: ReadingLocation = location.view === "questions"
      ? { ...location, doc: undefined, heading: undefined }
      : { view: "questions" };
    return { location, lastQuestion, lastDocument: location.view === "documents" ? location : undefined };
  });
  const { location, lastQuestion, lastDocument } = navigation;
  const [questionQuery, setQuestionQuery] = useState("");
  const documents = payload.documents ?? emptyDocuments;
  const routes = payload.routes ?? KNOWLEDGE_ROUTES;
  const linkedDocument = location.doc ? documents.find(note => note.id === location.doc) : undefined;
  const documentsView = location.view === "documents";
  const reader = documentsView ? undefined : linkedDocument;
  const selectedDocument = linkedDocument ?? documents.find(note => note.id === "android-compose-rendering") ?? documents[0];
  const returnPoint = useRef<{ element: HTMLElement | null; scroll: number }>(undefined);

  function applyLocation(next: ReadingLocation) {
    setNavigation(previous => ({
      location: next,
      lastDocument: next.view === "documents" ? next : previous.lastDocument,
      lastQuestion: next.view === "questions"
        ? { ...next, doc: undefined, heading: undefined }
        : previous.lastQuestion,
    }));
  }

  useEffect(() => {
    const restore = () => applyLocation(currentLocation());
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);

  useLayoutEffect(() => {
    if (reader || !returnPoint.current) return;
    const { element, scroll } = returnPoint.current;
    returnPoint.current = undefined;
    element?.focus({ preventScroll: true });
    window.scrollTo(0, scroll);
  }, [reader]);

  function navigate(next: ReadingLocation, replace = false) {
    if (locationHash(next) !== window.location.hash) {
      window.history[replace ? "replaceState" : "pushState"](null, "", locationHash(next));
    }
    applyLocation(next);
  }

  function openDocument(id: string, heading?: string, opener?: HTMLElement) {
    if (!documents.some(note => note.id === id)) return;
    if (documentsView) {
      navigate({ view: "documents", doc: id, heading });
      return;
    }
    if (!reader) returnPoint.current = { element: opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null), scroll: window.scrollY };
    navigate({ ...location, doc: id, heading }, Boolean(reader));
  }

  function closeDocument() {
    if (returnPoint.current) window.history.back();
    else navigate({ ...location, doc: undefined, heading: undefined }, true);
  }

  useEffect(() => {
    if (!reader) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) closeDocument(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [reader, location]);

  function goToView(view: WorkspaceView) {
    if (view === location.view) return;
    navigate(view === "questions" ? lastQuestion : view === "documents" ? lastDocument ?? { view } : { view });
    window.scrollTo(0, 0);
  }

  return (
    <div className="reading-workspace">
      <div className={documentsView ? "reading-layout document-view" : "reading-layout"} hidden={Boolean(reader)}>
        <header className="reading-header">
          <div className="reading-brand">
            <div className="mini-mark" aria-hidden="true"><span /><span /><span /></div>
            <strong>技术面试工作台</strong>
          </div>
          <nav aria-label="主导航">
            {(Object.keys(viewLabels) as WorkspaceView[]).map(view => (
              <button type="button" key={view} aria-current={view === location.view ? "page" : undefined} onClick={() => goToView(view)}>
                <span className="reading-nav-icon" aria-hidden="true">{viewIcons[view]}</span>{viewLabels[view]}
              </button>
            ))}
          </nav>
          {onLock ? <button type="button" className="reading-button reading-lock" onClick={onLock}>锁定</button> : null}
        </header>
        <div className="reading-main">
          {location.doc && !linkedDocument ? <p className="reading-missing" role="status">这篇资料当前不在文档库中。</p> : null}
          <div hidden={location.view !== "questions"}>
            <QuestionBrowser cards={payload.cards} location={lastQuestion} query={questionQuery} docs={documents} routes={routes}
              onQueryChange={setQuestionQuery} onNavigate={scope => navigate({ view: "questions", ...scope })} onOpenDocument={openDocument} />
          </div>
          {documentsView ? <DocumentLibrary documents={documents} selected={selectedDocument} heading={linkedDocument ? location.heading : undefined} onOpen={openDocument} /> : null}
          {location.view === "routes" ? (
            <KnowledgeRoutesContext.Provider value={routes}>
              <RouteScreen cards={payload.cards} documents={documents}
                selectedRouteId={routes.find(route => route.steps.some(step => step.id === location.step))?.id}
                selectedStepId={location.step}
                onSelectRoute={id => {
                  navigate({ view: "routes", step: routes.find(route => route.id === id)?.steps[0]?.id });
                  window.scrollTo(0, 0);
                }}
                onOpenCard={card => {
                  setQuestionQuery("");
                  navigate({ view: "questions", card });
                  window.scrollTo(0, 0);
                }}
                onOpenDocument={id => openDocument(id)} />
            </KnowledgeRoutesContext.Provider>
          ) : null}
        </div>
      </div>
      {reader ? <DocumentReading key={reader.id} document={reader} heading={location.heading} onOpen={openDocument} onBack={closeDocument}
        returnLabel={location.view === "questions" ? "返回问答" : "返回路线"} /> : null}
    </div>
  );
}
