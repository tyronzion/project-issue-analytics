import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import featuresDoc from '../../docs/FEATURES.md?raw';
import './docs.css';

/**
 * Documentation page (/documentation): renders docs/FEATURES.md, the one description of every feature.
 * The same file is the context for anyone (or any agent) working on the repository, so it is edited there, not here.
 * Only the Markdown subset that file uses is supported: headings, paragraphs, bullet and numbered lists, tables,
 * code fences, **bold**, *italic*, `code` and [links](https://…). Output is React elements, never raw HTML.
 */

type Block =
  | { kind: 'h'; level: number; text: string; id: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'code'; text: string };

const slug = (s: string) => s.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  const used = new Set<string>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      let id = slug(h[2]) || 'section';
      for (let n = 2; used.has(id); n++) id = `${slug(h[2])}-${n}`;
      used.add(id);
      blocks.push({ kind: 'h', level: h[1].length, text: h[2], id });
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    const li = /^\s*(-|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const kind = li[1] === '-' ? 'ul' : 'ol';
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*(-|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m && (m[1] === '-') === (kind === 'ul')) { items.push(m[2]); i++; }
        else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1] += ' ' + lines[i].trim(); i++; }
        else break;
      }
      blocks.push({ kind, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*(-|\d+\.)\s|\s*\|)/.test(lines[i])) para.push(lines[i++].trim());
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') });
    else i++;
  }
  return blocks;
}

// Inline Markdown -> React nodes. Links are kept only for http(s), mailto, in-page (#…) and app paths (/…).
function inline(text: string, key = ''): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    else {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)!;
      const href = lm[2];
      const safe = /^(https?:|mailto:|#|\/)/i.test(href);
      out.push(safe ? <a key={k} href={href} target={/^https?:/i.test(href) ? '_blank' : undefined} rel="noreferrer">{inline(lm[1], k)}</a> : lm[1]);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  // Bare https links become clickable.
  return out.flatMap((node, idx) => typeof node !== 'string' ? [node] : node.split(/(https:\/\/[^\s)]+[^\s).,;])/g).map((part, j) =>
    /^https:\/\//.test(part) ? <a key={`${key}-u${idx}-${j}`} href={part} target="_blank" rel="noreferrer">{part}</a> : part));
}

function plain(text: string) {
  return text.replace(/`|\*\*|\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export const DocumentationPage: React.FC = () => {
  const blocks = useMemo(() => parseMarkdown(featuresDoc), []);
  const toc = blocks.filter((b): b is Extract<Block, { kind: 'h' }> => b.kind === 'h' && (b.level === 2 || b.level === 3));
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');

  // Search: keep the sections (from one level-2 heading to the next) that contain the text.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return blocks;
    const sections: Block[][] = [];
    for (const b of blocks) {
      if ((b.kind === 'h' && b.level <= 2) || !sections.length) sections.push([]);
      sections[sections.length - 1].push(b);
    }
    return sections.filter(sec => JSON.stringify(sec).toLowerCase().includes(q)).flat();
  }, [blocks, query]);

  // Highlight the section being read in the table of contents.
  useEffect(() => {
    const ids = toc.map(t => t.id);
    const onScroll = () => {
      let current = '';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 140) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [toc, shown]);

  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const title = blocks.find(b => b.kind === 'h' && b.level === 1) as Extract<Block, { kind: 'h' }> | undefined;

  return (
    <div className="docs-root space-y-4">
      <div className="docs-card docs-header">
        <BookOpen className="w-5 h-5" style={{ color: 'var(--cs-primary)' }} aria-hidden />
        <h1>{title ? plain(title.text) : 'Documentation'}</h1>
        <span className="docs-muted">Every feature of the app. The source is <code>docs/FEATURES.md</code> in the repository.</span>
        <label className="docs-search">
          <Search className="w-3.5 h-3.5" aria-hidden />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the documentation…" aria-label="Search the documentation" />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X className="w-3 h-3" aria-hidden /></button>
          )}
        </label>
      </div>

      <div className="docs-layout">
        <nav className="docs-card docs-toc" aria-label="Contents">
          <p className="docs-toc-title">Contents</p>
          {toc.map(t => (
            <a key={t.id} href={`#${t.id}`} onClick={jump(t.id)} className={`docs-toc-link docs-toc-l${t.level}${active === t.id ? ' is-active' : ''}`}>
              {plain(t.text).replace(/\s*\([^)]*\)\s*$/, '')}
            </a>
          ))}
        </nav>

        <article className="docs-card docs-article">
          {shown.length === 0 && <p className="docs-muted">Nothing in the documentation matches "{query}".</p>}
          {shown.map((b, i) => {
            const k = `b${i}`;
            switch (b.kind) {
              case 'h': {
                if (b.level === 1) return null;
                const Tag = (`h${b.level}` as 'h2' | 'h3' | 'h4');
                return <Tag key={k} id={b.id}>{inline(b.text, k)}</Tag>;
              }
              case 'p': return <p key={k}>{inline(b.text, k)}</p>;
              case 'ul': return <ul key={k}>{b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}</ul>;
              case 'ol': return <ol key={k}>{b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}</ol>;
              case 'code': return <pre key={k}><code>{b.text}</code></pre>;
              case 'table': return (
                <div key={k} className="docs-table">
                  <table>
                    <thead><tr>{b.head.map((c, j) => <th key={j}>{inline(c, `${k}-h${j}`)}</th>)}</tr></thead>
                    <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `${k}-${ri}-${j}`)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              );
              default: return null;
            }
          })}
        </article>
      </div>
    </div>
  );
};
