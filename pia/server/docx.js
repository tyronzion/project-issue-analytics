import fs from 'node:fs';
import { deflateRawSync } from 'node:zlib';

// Dependency-free Word (.docx) writer for the PIA reassessment, laid out like the Cloudstaff document templates:
// the Cloudstaff logo top right on the cover, the emblem on later pages, and the offices / cloudstaff.com / page
// footer. A .docx is a zip of XML parts, written here with node:zlib. Every text run is XML-escaped (control
// characters dropped), so text from UberTicket or a repository can't inject markup; links must be http(s).
//
// Colours and fonts come from the Cloudstaff Design System tokens (css/tokens.css, D6), resolved once at start-up
// (var() chains and color-mix(in oklch, …, white N%) are computed here). Logos are PNG renders of the design
// system's SVG logos, kept in pia/assets.

// ---- Theme from design-system tokens ---------------------------------------------------------------------------
const TOKENS = {
  brand: '--color-brand-primary',
  brandSoft: '--color-brand-primary-soft',
  onBrand: '--color-brand-primary-contrast',
  text: '--color-text-base-primary',
  muted: '--color-text-base-muted',
  shade: '--color-surface-secondary',
  border: '--color-border-subtle',
  success: '--color-feedback-success',
  successSoft: '--color-feedback-success-soft',
  warning: '--color-feedback-warning',
  warningSoft: '--color-feedback-warning-soft',
  warningBorder: '--color-border-warning',
  danger: '--color-feedback-danger',
  dangerSoft: '--color-feedback-danger-soft',
  heading: '--font-family-heading',
  body: '--font-family-body',
};

export function loadTheme(tokensCssPath) {
  const theme = Object.fromEntries(Object.keys(TOKENS).map((k) => [k, null]));
  Object.assign(theme, { heading: 'Calibri', body: 'Calibri' });
  let css = '';
  try { css = fs.readFileSync(tokensCssPath, 'utf8'); } catch { return theme; }
  const vars = new Map();
  for (const m of css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gi)) if (!vars.has(m[1])) vars.set(m[1], m[2].trim()); // light theme first
  for (const [k, name] of Object.entries(TOKENS)) {
    const v = resolveVar(vars, vars.get(name));
    if (!v) continue;
    if (k === 'heading' || k === 'body') theme[k] = (/"([^"]+)"/.exec(v)?.[1] || v.split(',')[0]).trim();
    else theme[k] = toHex(vars, v);
  }
  return theme;
}

function resolveVar(vars, v, depth = 0) {
  const m = /^var\((--[a-z0-9-]+)(?:\s*,\s*([^)]*))?\)$/i.exec(String(v || '').trim());
  if (!m || depth > 12) return v || null;
  return resolveVar(vars, vars.get(m[1]) ?? m[2], depth + 1);
}

// '#rrggbb' or 'color-mix(in oklch, <colour>, white N%)' -> 'RRGGBB' (or null)
function toHex(vars, v, depth = 0) {
  v = resolveVar(vars, v);
  if (!v || depth > 6) return null;
  const hex = /^#([0-9a-f]{6})$/i.exec(v) || /^#([0-9a-f]{3})$/i.exec(v);
  if (hex) return (hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1]).toUpperCase();
  if (/^(white|#fff(fff)?)$/i.test(v)) return 'FFFFFF';
  const mix = /^color-mix\(\s*in\s+oklch\s*,\s*(.+?)\s*,\s*white\s+(\d+(?:\.\d+)?)%\s*\)$/i.exec(v);
  if (mix) {
    const base = toHex(vars, mix[1].trim(), depth + 1);
    return base ? mixWithWhite(base, Number(mix[2]) / 100) : null;
  }
  return null;
}

// CSS color-mix(in oklch, c, white p): white has no hue, so lightness and chroma move towards white, hue stays.
function mixWithWhite(hexColour, p) {
  const [L, C, h] = rgbToOklch(hexColour);
  return oklchToHex(L * (1 - p) + 1 * p, C * (1 - p), h);
}
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgbToOklch(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function oklchToHex(L, C, h) {
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.map((c) => Math.round(Math.min(1, Math.max(0, gam(c))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ---- Document model --------------------------------------------------------------------------------------------
// Blocks:
//   { type: 'title' | 'subtitle' | 'h1' | 'h2' | 'p' | 'note', text | runs }
//   { type: 'section', eyebrow, text }                  section heading with a brand rule underneath
//   { type: 'question', number, text, tag: { text, tone } }
//   { type: 'bullet', text | runs }                     real Word bullets
//   { type: 'callout', tone: 'brand'|'success'|'warning'|'danger', title, text | lines }
//   { type: 'kv', rows: [[label, value | runs]] }       label / value table
//   { type: 'table', header: true, rows, widths: [%…], fills: [[tone|null…]] }
//   { type: 'signature', rows: [label…] }
//   { type: 'pagebreak' } | { type: 'spacer' }     (prefer pageBreakBefore: true on a 'p' or 'section': no blank page)
// Runs: { text, bold, italic, color: theme key, size (half-points), link: 'https://…', fill: theme key }

const esc = (s) => String(s ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeLink = (u) => (/^https?:\/\/[^\s"<>]{1,2000}$/i.test(String(u || '')) ? String(u) : null);
const TEXT_W = 9638; // A4 width minus the 2 cm side margins, in twentieths of a point
const dxa = (pcts) => { const w = pcts.map((p) => Math.round((TEXT_W * p) / 100)); w[w.length - 1] += TEXT_W - w.reduce((a, b) => a + b, 0); return w; };
const TONE = { brand: ['brand', 'brandSoft'], success: ['success', 'successSoft'], warning: ['warningBorder', 'warningSoft'], danger: ['danger', 'dangerSoft'], muted: ['muted', 'shade'] };

class Writer {
  constructor(theme) {
    this.t = theme;
    this.links = []; // [id, url]
  }
  c(key) {
    const v = this.t[key] || (/^[0-9A-F]{6}$/.test(key) ? key : null);
    return v;
  }
  rPr(o) {
    const color = o.color && this.c(o.color);
    const fill = o.fill && this.c(o.fill);
    return [
      o.font ? `<w:rFonts w:ascii="${esc(o.font)}" w:hAnsi="${esc(o.font)}" w:cs="${esc(o.font)}"/>` : '',
      o.bold ? '<w:b/><w:bCs/>' : '',
      o.italic ? '<w:i/><w:iCs/>' : '',
      o.caps ? '<w:caps/>' : '',
      color ? `<w:color w:val="${color}"/>` : '',
      o.spacing ? `<w:spacing w:val="${o.spacing}"/>` : '',
      o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : '',
      fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '',
      o.link ? '<w:u w:val="single"/>' : '',
    ].join('');
  }
  run(r, base = {}) {
    const o = { ...base, ...r };
    if (o.field) return `<w:r><w:rPr>${this.rPr(o)}</w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr>${this.rPr(o)}</w:rPr><w:instrText xml:space="preserve"> ${o.field} </w:instrText></w:r><w:r><w:rPr>${this.rPr(o)}</w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr>${this.rPr(o)}</w:rPr><w:t>1</w:t></w:r><w:r><w:rPr>${this.rPr(o)}</w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
    if (o.tab) return '<w:r><w:tab/></w:r>';
    const link = safeLink(o.link);
    const props = this.rPr({ ...o, color: link ? 'brand' : o.color, link });
    const body = String(o.text ?? '').split('\n').map((t) => `<w:t xml:space="preserve">${esc(t)}</w:t>`).join('<w:br/>');
    const r1 = `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${body}</w:r>`;
    if (!link) return r1;
    const id = `rIdL${this.links.length + 1}`;
    this.links.push([id, link]);
    return `<w:hyperlink r:id="${id}" w:history="1">${r1}</w:hyperlink>`;
  }
  runs(b, base) {
    return (b.runs || [{ text: b.text }]).map((r) => this.run(r, base)).join('');
  }
  p(inner, pPr = '') {
    return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`;
  }
  cell(content, { width, fill, borders = true, vAlign = 'top', margins } = {}) {
    const f = fill && this.c(fill);
    return `<w:tc><w:tcPr>${width ? `<w:tcW w:w="${width}" w:type="dxa"/>` : ''}${f ? `<w:shd w:val="clear" w:color="auto" w:fill="${f}"/>` : ''}${borders ? '' : '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>'}${margins || ''}<w:vAlign w:val="${vAlign}"/></w:tcPr>${content}</w:tc>`;
  }
  // widths: column widths in twentieths of a point (they add up to the text width, TEXT_W)
  tbl(rowsXml, { borderColor, widths = [] } = {}) {
    const bc = this.c(borderColor || 'border') || 'auto';
    const b = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="${bc}"/>`;
    const grid = widths.length ? `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` : '';
    return `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_W}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr>${grid}${rowsXml}</w:tbl>`;
  }

  block(b) {
    const t = this.t;
    switch (b.type) {
      case 'title': return this.p(this.runs(b), '<w:pStyle w:val="Title"/>');
      case 'subtitle': return this.p(this.runs(b), '<w:pStyle w:val="Subtitle"/>');
      case 'h1': return this.p(this.runs(b), '<w:pStyle w:val="Heading1"/>');
      case 'h2': return this.p(this.runs(b), '<w:pStyle w:val="Heading2"/>');
      case 'section': {
        const rule = this.c('brand') ? `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="${this.c('brand')}"/></w:pBdr>` : '';
        const pb = b.pageBreakBefore ? '<w:pageBreakBefore/>' : '';
        const eyebrow = b.eyebrow ? this.p(this.run({ text: b.eyebrow, bold: true, color: 'brand', size: 17, spacing: 20, caps: true }), `<w:keepNext/>${pb}<w:spacing w:before="360" w:after="0"/>`) : '';
        return eyebrow + this.p(this.runs(b), `<w:pStyle w:val="Heading1"/>${rule}${b.eyebrow ? '<w:spacing w:before="0" w:after="160"/>' : ''}`);
      }
      case 'question': {
        const tag = b.tag ? `${this.run({ text: '  ' })}${this.run({ text: ` ${b.tag.text} `, bold: true, size: 15, color: TONE[b.tag.tone]?.[0] === 'warningBorder' ? 'text' : TONE[b.tag.tone]?.[0], fill: TONE[b.tag.tone]?.[1] })}` : '';
        return this.p(`${b.number ? this.run({ text: `${b.number}  `, bold: true, color: 'brand' }) : ''}${this.runs(b, { bold: true })}${tag}`, '<w:pStyle w:val="Question"/>');
      }
      case 'bullet': return this.p(this.runs(b), '<w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
      case 'note': return this.p(this.runs(b, { italic: true, color: 'muted', size: 17 }), '<w:spacing w:before="40" w:after="120"/><w:ind w:left="357"/>');
      case 'p': return this.p(this.runs(b), `${b.pageBreakBefore ? '<w:pageBreakBefore/>' : ''}${b.align ? `<w:jc w:val="${b.align}"/>` : ''}`);
      case 'spacer': return this.p('', '<w:spacing w:before="0" w:after="0"/>');
      case 'pagebreak': return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      case 'callout': {
        const [line, fill] = TONE[b.tone] || TONE.brand;
        const lc = this.c(line);
        const inner = [
          b.title ? this.p(this.run({ text: b.title, bold: true, font: t.heading, size: 21, color: b.tone === 'warning' ? 'text' : line }), '<w:spacing w:before="0" w:after="40"/>') : '',
          ...(b.lines || [b.text]).filter((x) => x != null && x !== '').map((x) => this.p(typeof x === 'string' ? this.run({ text: x, size: 19 }) : x.map((r) => this.run({ size: 19, ...r })).join(''), '<w:spacing w:before="0" w:after="30"/>')),
        ].join('') || '<w:p/>';
        const borders = `<w:tcBorders><w:top w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:left w:val="single" w:sz="24" w:space="0" w:color="${lc || 'auto'}"/></w:tcBorders>`;
        const fc = this.c(fill);
        const cell = `<w:tc><w:tcPr><w:tcW w:w="${TEXT_W}" w:type="dxa"/>${borders}${fc ? `<w:shd w:val="clear" w:color="auto" w:fill="${fc}"/>` : ''}<w:tcMar><w:top w:w="110" w:type="dxa"/><w:left w:w="200" w:type="dxa"/><w:bottom w:w="110" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>${inner}</w:tc>`;
        return `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_W}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${TEXT_W}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cell}</w:tr></w:tbl>${this.p('', '<w:spacing w:before="0" w:after="80" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr>')}`;
      }
      case 'kv': {
        const w2 = dxa([30, 70]);
        const rows = b.rows.map(([k, v]) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${this.cell(this.p(this.run({ text: k, bold: true, size: 18, color: 'muted' }), '<w:spacing w:before="0" w:after="0"/>'), { width: w2[0], fill: 'shade' })}${this.cell(this.p(Array.isArray(v) ? v.map((r) => this.run({ size: 19, ...r })).join('') : this.run({ text: v, size: 19 }), '<w:spacing w:before="0" w:after="0"/>'), { width: w2[1] })}</w:tr>`).join('');
        return this.tbl(rows, { widths: w2 }) + this.p('', '<w:spacing w:before="0" w:after="120" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr>');
      }
      case 'table': {
        const cols = Math.max(...b.rows.map((r) => r.length), 1);
        const widths = dxa(b.widths || Array.from({ length: cols }, () => 100 / cols));
        const rows = b.rows.map((r, i) => {
          const head = b.header && i === 0;
          const cells = Array.from({ length: cols }, (_, c) => {
            const v = r[c] ?? '';
            const fill = head ? 'brand' : b.fills?.[i]?.[c] || (b.zebra && i % 2 === 0 ? 'shade' : null);
            const strong = head || fill === 'danger' || fill === 'brand'; // white text on the strong fills
            const content = Array.isArray(v) ? v.map((x) => this.run({ size: 18, ...x })).join('') : this.run({ text: v, size: 18, bold: head || (strong && !head), color: strong ? 'onBrand' : undefined });
            return this.cell(this.p(content, '<w:spacing w:before="0" w:after="0"/>'), { width: widths[c], fill, vAlign: head ? 'center' : 'top' });
          }).join('');
          return `<w:tr><w:trPr><w:cantSplit/>${head ? '<w:tblHeader/>' : ''}</w:trPr>${cells}</w:tr>`;
        }).join('');
        return this.tbl(rows, { widths }) + this.p('', '<w:spacing w:before="0" w:after="160" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr>');
      }
      case 'signature': {
        const line = this.c('muted') || 'auto';
        const rows = `<w:tr>${b.rows.map((label) => this.cell(
          this.p(this.run({ text: ' ' }), `<w:spacing w:before="480" w:after="0"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="${line}"/></w:pBdr>`)
          + this.p(this.run({ text: label, size: 17, color: 'muted' }), '<w:spacing w:before="40" w:after="0"/>'),
          { width: Math.floor(TEXT_W / b.rows.length), borders: false, margins: '<w:tcMar><w:left w:w="0" w:type="dxa"/><w:right w:w="300" w:type="dxa"/></w:tcMar>' },
        )).join('')}</w:tr>`;
        const sw = Math.floor(TEXT_W / b.rows.length);
        return `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_W}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid>${b.rows.map(() => `<w:gridCol w:w="${sw}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>`;
      }
      default: return '';
    }
  }
}

// ---- Parts -----------------------------------------------------------------------------------------------------
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

let picId = 0;
function picture(rId, name, cx, cy) {
  const id = ++picId;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${esc(name)}" descr="${esc(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
const EMU_CM = 360000;

function headerXml(w, image) {
  // First page: logo on the right (as the Cloudstaff templates). Later pages: the emblem on the left.
  const pic = image ? picture('rIdImg', image.name, Math.round(image.widthCm * EMU_CM), Math.round(image.heightCm * EMU_CM)) : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr ${NS}>${w.p(pic, `<w:jc w:val="${image?.align || 'right'}"/><w:spacing w:before="0" w:after="0"/>`)}</w:hdr>`;
}

function footerXml(w, { left, right }) {
  const line = w.c('border') ? `<w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="${w.c('border')}"/></w:pBdr>` : '';
  const tabs = '<w:tabs><w:tab w:val="center" w:pos="4819"/><w:tab w:val="right" w:pos="9638"/></w:tabs>';
  const s = { size: 15, color: 'muted' };
  const runs = [
    w.run({ text: left, ...s }), w.run({ tab: true }),
    w.run({ text: 'cloudstaff.com', link: 'https://www.cloudstaff.com', size: 15, bold: true }), w.run({ tab: true }),
    w.run({ text: right ? `${right}   ·   Page ` : 'Page ', ...s }), w.run({ field: 'PAGE', ...s }), w.run({ text: ' of ', ...s }), w.run({ field: 'NUMPAGES', ...s }),
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${NS}>${w.p(runs, `${line}${tabs}<w:spacing w:before="0" w:after="0"/>`)}</w:ftr>`;
}

function stylesXml(t) {
  const color = (c) => (c ? `<w:color w:val="${c}"/>` : '');
  const font = (f) => `<w:rFonts w:ascii="${esc(f)}" w:hAnsi="${esc(f)}" w:cs="${esc(f)}" w:eastAsia="${esc(f)}"/>`;
  const style = (id, name, { size, c, before = 0, after = 120, bold = true, f = t.heading, keep = true, extraP = '' }) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr>${keep ? '<w:keepNext/><w:keepLines/>' : ''}<w:spacing w:before="${before}" w:after="${after}"/>${extraP}</w:pPr><w:rPr>${font(f)}${bold ? '<w:b/><w:bCs/>' : ''}${color(c)}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>${font(t.body)}${color(t.text)}<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-AU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${style('Title', 'Title', { size: 56, c: t.text, after: 40 })}${style('Subtitle', 'Subtitle', { size: 36, c: t.brand, after: 240, bold: false })}${style('Heading1', 'heading 1', { size: 30, c: t.text, before: 360, after: 160, extraP: '<w:outlineLvl w:val="0"/>' })}${style('Heading2', 'heading 2', { size: 24, c: t.text, before: 240, after: 100, extraP: '<w:outlineLvl w:val="1"/>' })}${style('Question', 'PIA question', { size: 20, c: t.text, before: 220, after: 80, f: t.body, extraP: '<w:outlineLvl w:val="2"/>' })}<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="60"/><w:ind w:left="714" w:hanging="357"/></w:pPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
}

const numberingXml = (t) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="714" w:hanging="357"/></w:pPr><w:rPr>${t.brand ? `<w:color w:val="${t.brand}"/>` : ''}</w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

const core = (title, author, when) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified></cp:coreProperties>`;

const rel = (id, type, target, external) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${esc(target)}"${external ? ' TargetMode="External"' : ''}/>`;
const rels = (list) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.join('')}</Relationships>`;

// assets: { logo: Buffer (PNG, landscape), emblem: Buffer (PNG, square) } — optional
// footer: { left, right } text either side of "cloudstaff.com"
export function buildDocx(blocks, { title = 'Document', author = 'Security Issues Analytics', theme = loadTheme(''), now = new Date(), assets = {}, footer = {} } = {}) {
  picId = 0;
  const w = new Writer(theme);
  const body = blocks.map((b) => w.block(b)).join('');
  const docLinks = [...w.links];

  const hw = new Writer(theme);
  const firstHeader = headerXml(hw, assets.logo ? { name: 'Cloudstaff', widthCm: 4.6, heightCm: 4.6 * (345 / 1050), align: 'right' } : null);
  const restHeader = headerXml(hw, assets.emblem ? { name: 'Cloudstaff', widthCm: 1.25, heightCm: 1.25, align: 'left' } : null);
  const fw = new Writer(theme);
  const footerPart = footerXml(fw, { left: footer.left ?? 'US  |  UK  |  AUSTRALIA  |  PHILIPPINES  |  INDIA', right: footer.right ?? '' });

  const sect = `<w:sectPr><w:headerReference w:type="first" r:id="rIdH1"/><w:headerReference w:type="default" r:id="rIdH2"/><w:footerReference w:type="first" r:id="rIdF1"/><w:footerReference w:type="default" r:id="rIdF1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1531" w:right="1134" w:bottom="1247" w:left="1134" w:header="567" w:footer="510" w:gutter="0"/><w:titlePg/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;

  const when = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', rels([rel('rId1', 'officeDocument', 'word/document.xml'), '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'])],
    ['word/_rels/document.xml.rels', rels([
      rel('rIdS', 'styles', 'styles.xml'), rel('rIdN', 'numbering', 'numbering.xml'), rel('rIdSet', 'settings', 'settings.xml'),
      rel('rIdH1', 'header', 'header1.xml'), rel('rIdH2', 'header', 'header2.xml'), rel('rIdF1', 'footer', 'footer1.xml'),
      ...docLinks.map(([id, url]) => rel(id, 'hyperlink', url, true)),
    ])],
    ['word/document.xml', document],
    ['word/styles.xml', stylesXml(theme)],
    ['word/numbering.xml', numberingXml(theme)],
    ['word/settings.xml', settingsXml],
    ['word/header1.xml', firstHeader],
    ['word/header2.xml', restHeader],
    ['word/footer1.xml', footerPart],
    ['docProps/core.xml', core(title, author, when)],
  ];
  if (assets.logo) files.push(['word/_rels/header1.xml.rels', rels([rel('rIdImg', 'image', 'media/logo.png')])], ['word/media/logo.png', assets.logo]);
  if (assets.emblem) files.push(['word/_rels/header2.xml.rels', rels([rel('rIdImg', 'image', 'media/emblem.png')])], ['word/media/emblem.png', assets.emblem]);
  if (fw.links.length) files.push(['word/_rels/footer1.xml.rels', rels(fw.links.map(([id, url]) => rel(id, 'hyperlink', url, true)))]);
  return zip(files, now);
}

// Logo PNGs (pia/assets), read once.
export function loadAssets(dir) {
  const read = (f) => { try { return fs.readFileSync(`${dir}/${f}`); } catch { return null; } };
  return { logo: read('cloudstaff-logo-landscape.png'), emblem: read('cloudstaff-logo-emblem.png') };
}

// ---- Zip (deflate) -----------------------------------------------------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries, now) {
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  const local = [], central = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const packed = deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(packed.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, nameBuf, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
