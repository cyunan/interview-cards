import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReferenceDocument } from "../content/payload";
import { structuralLines } from "../content/structure";
import { DocumentReading } from "./DocumentReading";
import { plainText } from "./reading-data";

interface DocumentLibraryProps {
  documents: ReferenceDocument[];
  selected?: ReferenceDocument;
  heading?: string;
  onOpen(id: string, heading?: string): void;
}

function documentFolders(note: ReferenceDocument) {
  const [module, ...folders] = note.sourcePath.split("/").slice(0, -1);
  const folder = folders[0] === "JetPack" ? folders[1] ?? folders[0] : folders[0];
  return { module: module ?? "", topic: folder === "compose" ? "Compose" : folder ?? "" };
}

function moduleName(module: string) {
  return module.replace(/^\d{2}-/, "").replace(/^个人资料$/, "项目与技术速记");
}

function searchText(value: string) { return value.normalize("NFKC").toLowerCase(); }

function matchingHeading(note: ReferenceDocument, words: string[]) {
  const lines = note.markdown.split(/\r?\n/);
  let current: string | undefined;
  let closest: string | undefined;
  for (const [index, line] of structuralLines(lines).entries()) {
    const heading = /^\s{0,3}#{2,6}\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      current = plainText(heading[1]);
      const headingText = searchText(current);
      if (words.every(word => headingText.includes(word))) return current;
    } else if (current && line && !closest && words.every(word => searchText(lines[index]).includes(word))) {
      closest = current;
    }
  }
  return closest;
}

export function DocumentLibrary({ documents, selected, heading, onOpen }: DocumentLibraryProps) {
  const [query, setQuery] = useState("");
  const [choosing, setChoosing] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const readerTitle = useRef<HTMLHeadingElement>(null);
  const restoreReaderFocus = useRef(false);
  const previousScroll = useRef(0);
  const library = useMemo(() => {
    const groups = new Map<string, Map<string, ReferenceDocument[]>>();
    for (const note of documents) {
      const { module, topic } = documentFolders(note);
      if (!groups.has(module)) groups.set(module, new Map());
      const topics = groups.get(module)!;
      if (!topics.has(topic)) topics.set(topic, []);
      topics.get(topic)!.push(note);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([module, topics]) => ({
      module,
      topics: [...topics].sort(([a], [b]) => {
        if (a === "Compose" || !b) return -1;
        if (b === "Compose" || !a) return 1;
        return a.localeCompare(b, "zh-CN");
      }),
    }));
  }, [documents]);
  const words = useMemo(() => searchText(query.trim()).split(/\s+/).filter(Boolean), [query]);
  const results = useMemo(() => {
    if (!words.length) return [];
    return documents.flatMap(note => {
      const title = searchText(note.title);
      if (!words.every(word => searchText(note.title + " " + note.sourcePath + " " + note.markdown).includes(word))) return [];
      const match = matchingHeading(note, words);
      return [{ note, heading: match, rank: words.every(word => title.includes(word)) ? 2 : match ? 1 : 0 }];
    }).sort((a, b) => b.rank - a.rank);
  }, [documents, words]);
  const active = selected && documentFolders(selected);

  useLayoutEffect(() => {
    if (choosing) {
      search.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else if (restoreReaderFocus.current) {
      restoreReaderFocus.current = false;
      readerTitle.current?.focus({ preventScroll: true });
    }
  }, [choosing, selected]);

  function closeLibrary() {
    restoreReaderFocus.current = true;
    setChoosing(false);
    requestAnimationFrame(() => window.scrollTo(0, previousScroll.current));
  }

  function openLibrary() {
    previousScroll.current = window.scrollY;
    setChoosing(true);
  }

  function noteButton(note: ReferenceDocument, match?: string) {
    return <li key={note.id}>
      <button type="button" className="document-note" aria-current={note.id === selected?.id ? "page" : undefined}
        onClick={() => {
          restoreReaderFocus.current = choosing;
          setChoosing(false);
          onOpen(note.id, match);
        }}>
        {plainText(note.title)}
        {match ? <small>跳到 · {match}</small> : null}
      </button>
    </li>;
  }

  if (!selected) return <main className="reading-body"><h1>技术文档</h1><p>文档库暂无内容。</p></main>;

  return (
    <div className="document-library" data-choosing={choosing} onKeyDown={event => {
      if (event.key === "Escape" && choosing) { event.preventDefault(); closeLibrary(); }
    }}>
      <aside className="document-directory" aria-labelledby="document-directory-title">
        <div className="document-directory-inner">
          <div className="document-directory-heading">
            <h2 id="document-directory-title">文档目录</h2>
            <span>{documents.length} 篇</span>
          </div>
          <button type="button" className="document-action document-close-library" onClick={closeLibrary}>← 返回正文</button>
          <input ref={search} className="document-search" type="search" aria-label="搜索文档" placeholder="搜索标题、小节或正文"
            value={query} onChange={event => setQuery(event.target.value)} />
          {words.length ? <nav aria-label="文档搜索结果">
            <p className="document-search-status" role="status">{results.length ? `${results.length} 篇匹配文档` : "没有匹配的文档。"}</p>
            <ul>{results.map(result => noteButton(result.note, result.heading))}</ul>
          </nav> : <nav aria-label="技术文档">
            {library.map(({ module, topics }) => <details key={module} className="document-module" open={module === active?.module}>
              <summary>{moduleName(module) || "其他文档"}</summary>
              {topics.map(([topic, notes]) => topic
                ? <details key={topic} className="document-topic" open={module === active?.module && topic === active?.topic}>
                  <summary>{topic}</summary><ul>{notes.map(note => noteButton(note))}</ul>
                </details>
                : <ul key={topic}>{notes.map(note => noteButton(note))}</ul>)}
            </details>)}
          </nav>}
        </div>
      </aside>
      <div className="document-library-content">
        <DocumentReading document={selected} heading={heading} onOpen={onOpen}
          library={{ breadcrumb: [moduleName(active!.module), active!.topic].filter(Boolean).join(" / "), onChoose: openLibrary, titleRef: readerTitle }} />
      </div>
    </div>
  );
}
