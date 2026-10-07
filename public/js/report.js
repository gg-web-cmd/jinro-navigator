// 종합 보고서 렌더링·내보내기 모듈.
// LLM이 준 마크다운을 직접 파싱해 안전한 DOM으로 그리고(innerHTML 미사용),
// 인쇄·복사·워드(.doc)·마크다운 저장과 SSE 스트리밍 보고서 요청을 담당합니다.

import { buildFallbackReport } from './fallback.js';

/* ────────────────────────────────────────────────────────────
 * 0. 작은 도우미
 * ──────────────────────────────────────────────────────────── */

const REPORT_TITLE = '진로잠재력종합보고서';

const ENGINE_LABEL = {
  upstage: 'Upstage Solar AI',
  fallback: '기본 분석 엔진',
};

function engineLabel(engine) {
  return ENGINE_LABEL[engine] || 'AI 분석';
}

function toDate(v) {
  if (!v) return new Date();
  if (v instanceof Date) return isNaN(v.getTime()) ? new Date() : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 2026-08-11 14:03 형태 */
function formatDateTime(v) {
  const d = toDate(v);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 20260811 형태 (파일명용) */
function formatYmd(v) {
  const d = toDate(v);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** 파일명에 못 쓰는 글자를 걷어낸다 */
function safeName(name) {
  const s = String(name || '').replace(/[\\/:*?"<>|\r\n\t]/g, '').trim();
  return s || '학생';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}

/* ────────────────────────────────────────────────────────────
 * 1. 마크다운 파서 (블록 → AST)
 * ──────────────────────────────────────────────────────────── */

const RE_HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const RE_HR = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/;
const RE_UL = /^(\s*)(?:[-*+•]|·)\s+(.*)$/;
const RE_OL = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const RE_FENCE = /^\s*(?:```|~~~)/;
const RE_TABLE_ROW = /^\s*\|.*\|?\s*$/;
const RE_TABLE_SEP = /^[\s:|-]+$/;
const RE_QUOTE = /^\s{0,3}>\s?(.*)$/;

/** LLM 이 보고서 전체를 코드펜스로 감싸는 실수를 되돌린다 */
function stripCodeFences(src) {
  let text = String(src == null ? '' : src).replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  const lines = text.split('\n');
  if (lines.length >= 2 && RE_FENCE.test(lines[0])) {
    let end = -1;
    for (let i = lines.length - 1; i > 0; i--) {
      if (/^\s*(?:```|~~~)\s*$/.test(lines[i])) { end = i; break; }
    }
    text = (end > 0 ? lines.slice(1, end) : lines.slice(1)).join('\n').trim();
  }
  return text;
}

/** 표 문법이 와도 깨지지 않도록 사람이 읽을 수 있는 문단 줄로 바꾼다 */
function tableRowToLine(line) {
  const cells = line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length);
  return cells.join(' · ');
}

/**
 * 마크다운 원문을 블록 배열로 바꾼다.
 * 블록: heading / para / ul / ol / hr
 */
function parseBlocks(src) {
  const lines = stripCodeFences(src).split('\n');
  const blocks = [];
  let para = null;      // {type:'para', lines:[]}
  let listStack = null; // [{indent, block, item}]

  const closePara = () => { if (para && para.lines.length) blocks.push(para); para = null; };
  const closeList = () => { listStack = null; };
  const closeAll = () => { closePara(); closeList(); };

  const pushPara = (text) => {
    if (!para) para = { type: 'para', lines: [] };
    para.lines.push(text);
  };

  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i];
    const trimmed = raw.trim();

    // 코드펜스 잔여물은 무시한다 (본문을 pre 로 흘리지 않는다)
    if (RE_FENCE.test(raw)) { closeAll(); continue; }

    if (!trimmed) { closeAll(); continue; }

    // 인용문은 문단으로 처리
    const q = raw.match(RE_QUOTE);
    if (q) raw = q[1];

    // 표 → 문단
    if (RE_TABLE_ROW.test(raw) && raw.indexOf('|') !== raw.lastIndexOf('|')) {
      closeList();
      const inner = raw.replace(/\|/g, '').trim();
      if (RE_TABLE_SEP.test(raw) && !/[^\s:|-]/.test(inner)) continue; // 구분선 행
      const line = tableRowToLine(raw);
      if (line) pushPara(line);
      continue;
    }

    if (RE_HR.test(raw)) { closeAll(); blocks.push({ type: 'hr' }); continue; }

    const h = raw.match(RE_HEADING);
    if (h) {
      closeAll();
      const level = Math.min(h[1].length, 3);
      const text = h[2].replace(/\s+#+\s*$/, '').trim();
      if (text) blocks.push({ type: 'heading', level, text });
      continue;
    }

    const ul = raw.match(RE_UL);
    const ol = ul ? null : raw.match(RE_OL);
    if (ul || ol) {
      closePara();
      const indent = (ul ? ul[1] : ol[1]).replace(/\t/g, '  ').length;
      const kind = ul ? 'ul' : 'ol';
      const text = (ul ? ul[2] : ol[3]).trim();

      if (!listStack) {
        const block = { type: kind, items: [] };
        blocks.push(block);
        listStack = [{ indent, block }];
      } else {
        // 들여쓰기에 맞는 단계 찾기
        while (listStack.length > 1 && indent < listStack[listStack.length - 1].indent) listStack.pop();
        const top = listStack[listStack.length - 1];
        if (indent >= top.indent + 2) {
          const parentItems = top.block.items;
          const parent = parentItems[parentItems.length - 1];
          if (parent) {
            if (!parent.child || parent.child.type !== kind) parent.child = { type: kind, items: [] };
            listStack.push({ indent, block: parent.child });
          }
        } else if (top.block.type !== kind) {
          // 같은 단계에서 목록 종류가 바뀌면 새 목록을 연다
          const block = { type: kind, items: [] };
          blocks.push(block);
          listStack = [{ indent, block }];
        }
      }
      listStack[listStack.length - 1].block.items.push({ text, child: null });
      continue;
    }

    // 목록 항목의 이어지는 줄
    if (listStack && /^\s{2,}\S/.test(raw)) {
      const top = listStack[listStack.length - 1];
      const item = top.block.items[top.block.items.length - 1];
      if (item) { item.text += ' ' + raw.trim(); continue; }
    }

    closeList();
    pushPara(raw.trim());
  }

  closeAll();
  return annotate(blocks);
}

/** h1/h2 에 앵커 id 를 붙인다 (목차 점프용) */
function annotate(blocks) {
  let n = 0;
  for (const b of blocks) {
    if (b.type !== 'heading') continue;
    if (b.level === 1) { b.id = 'rp-top'; continue; }
    if (b.level === 2) { n += 1; b.id = `rp-sec-${n}`; }
  }
  return blocks;
}

/* ────────────────────────────────────────────────────────────
 * 2. 인라인 파서 (**굵게** *기울임* `코드` [링크])
 * ──────────────────────────────────────────────────────────── */

const RE_INLINE = /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\n]+?)\*|\[([^\]\n]*)\]\([^)\s]*\)/g;

function parseInline(text, depth = 0) {
  const out = [];
  const src = String(text == null ? '' : text);
  if (depth > 4) return [{ t: 'text', v: src }];

  const re = new RegExp(RE_INLINE.source, 'g');
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[0].length === 0) { re.lastIndex += 1; continue; }
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ t: 'code', v: m[2].trim() });
    else if (m[3] !== undefined) out.push({ t: 'strong', c: parseInline(m[3], depth + 1) });
    else if (m[4] !== undefined) out.push({ t: 'strong', c: parseInline(m[4], depth + 1) });
    else if (m[5] !== undefined) out.push({ t: 'em', c: parseInline(m[5], depth + 1) });
    else if (m[6] !== undefined) out.push({ t: 'text', v: m[6] }); // 링크는 글자만 남긴다
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out.length ? out : [{ t: 'text', v: src }];
}

function inlineToNodes(nodes, parent) {
  for (const n of nodes) {
    if (n.t === 'text') {
      parent.appendChild(document.createTextNode(n.v));
    } else if (n.t === 'code') {
      parent.appendChild(el('code', null, n.v));
    } else {
      const tag = n.t === 'strong' ? 'strong' : 'em';
      const wrap = document.createElement(tag);
      inlineToNodes(n.c, wrap);
      parent.appendChild(wrap);
    }
  }
  return parent;
}

function inlineToHtml(nodes) {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text') out += escapeHtml(n.v);
    else if (n.t === 'code') out += `<code>${escapeHtml(n.v)}</code>`;
    else if (n.t === 'strong') out += `<strong>${inlineToHtml(n.c)}</strong>`;
    else out += `<em>${inlineToHtml(n.c)}</em>`;
  }
  return out;
}

function inlineToText(nodes) {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text' || n.t === 'code') out += n.v;
    else out += inlineToText(n.c);
  }
  return out;
}

/** 마크다운 한 줄에서 서식 기호를 걷어낸 순수 텍스트 */
function stripInline(text) {
  return inlineToText(parseInline(text)).trim();
}

/* ────────────────────────────────────────────────────────────
 * 3. DOM 렌더러
 * ──────────────────────────────────────────────────────────── */

function listToDom(block) {
  const list = document.createElement(block.type === 'ol' ? 'ol' : 'ul');
  for (const item of block.items) {
    const li = document.createElement('li');
    inlineToNodes(parseInline(item.text), li);
    if (item.child && item.child.items && item.child.items.length) li.appendChild(listToDom(item.child));
    list.appendChild(li);
  }
  return list;
}

function blockToDom(block) {
  if (block.type === 'hr') return document.createElement('hr');

  if (block.type === 'heading') {
    const h = document.createElement('h' + block.level);
    if (block.id) h.id = block.id;
    inlineToNodes(parseInline(block.text), h);
    return h;
  }

  if (block.type === 'ul' || block.type === 'ol') return listToDom(block);

  const p = document.createElement('p');
  block.lines.forEach((line, i) => {
    if (i > 0) p.appendChild(document.createElement('br'));
    inlineToNodes(parseInline(line), p);
  });
  return p;
}

/** 해시 라우팅을 건드리지 않고 섹션으로 부드럽게 이동 */
function jumpTo(id) {
  const target = document.getElementById(id);
  if (!target) return;
  try {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (_) {
    target.scrollIntoView();
  }
}

function buildToc(blocks) {
  const items = blocks.filter((b) => b.type === 'heading' && b.level === 2 && b.id);
  if (items.length < 2) return null;

  const nav = el('nav', 'card card--pad no-print');
  nav.setAttribute('aria-label', '보고서 차례');
  nav.appendChild(el('p', 'small muted', '차례 — 눌러서 바로 이동해요'));

  const ul = document.createElement('ul');
  for (const b of items) {
    const li = document.createElement('li');
    const a = el('a', null, stripInline(b.text));
    a.href = `#${b.id}`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      jumpTo(b.id);
    });
    li.appendChild(a);
    ul.appendChild(li);
  }
  nav.appendChild(ul);
  return nav;
}

/**
 * 마크다운을 .report 컨테이너 엘리먼트로 렌더링한다.
 * @param {string} md
 * @returns {HTMLElement}
 */
export function renderMarkdown(md) {
  const root = el('div', 'report');
  const blocks = parseBlocks(md);

  if (!blocks.length) {
    root.appendChild(el('p', 'muted', '아직 보고서 내용이 없어요.'));
    return root;
  }

  const toc = buildToc(blocks);
  if (toc) {
    // 제목(h1)이 있으면 제목 다음에 목차를 넣는다
    const first = blocks[0];
    if (first.type === 'heading' && first.level === 1) {
      root.appendChild(blockToDom(first));
      root.appendChild(toc);
      for (let i = 1; i < blocks.length; i++) root.appendChild(blockToDom(blocks[i]));
      return root;
    }
    root.appendChild(toc);
  }

  for (const b of blocks) root.appendChild(blockToDom(b));
  return root;
}

/* ────────────────────────────────────────────────────────────
 * 4. 문자열 변환기 (평문 · HTML)
 * ──────────────────────────────────────────────────────────── */

function listToText(block, depth, out) {
  block.items.forEach((item, i) => {
    const indent = '  '.repeat(depth);
    const marker = block.type === 'ol' ? `${i + 1}. ` : depth === 0 ? '• ' : '- ';
    out.push(indent + marker + stripInline(item.text));
    if (item.child && item.child.items && item.child.items.length) listToText(item.child, depth + 1, out);
  });
}

/**
 * 복사·미리보기용 평문 변환.
 * @param {string} md
 * @returns {string}
 */
export function markdownToPlainText(md) {
  const blocks = parseBlocks(md);
  const out = [];
  for (const b of blocks) {
    if (b.type === 'hr') { out.push('────────────────────'); out.push(''); continue; }
    if (b.type === 'heading') {
      const text = stripInline(b.text);
      if (b.level === 1) { out.push(text); out.push('━━━━━━━━━━━━━━━━━━━━'); }
      else if (b.level === 2) { out.push(''); out.push(`■ ${text}`); }
      else { out.push(''); out.push(`▸ ${text}`); }
      out.push('');
      continue;
    }
    if (b.type === 'ul' || b.type === 'ol') { listToText(b, 0, out); out.push(''); continue; }
    for (const line of b.lines) out.push(stripInline(line));
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function listToHtml(block) {
  const tag = block.type === 'ol' ? 'ol' : 'ul';
  let out = `<${tag}>`;
  for (const item of block.items) {
    out += `<li>${inlineToHtml(parseInline(item.text))}`;
    if (item.child && item.child.items && item.child.items.length) out += listToHtml(item.child);
    out += '</li>';
  }
  return out + `</${tag}>`;
}

/**
 * 워드 저장·인쇄용 HTML 조각 문자열. 모든 텍스트는 이스케이프된다.
 * @param {string} md
 * @returns {string}
 */
export function markdownToHtmlString(md) {
  const blocks = parseBlocks(md);
  let out = '';
  for (const b of blocks) {
    if (b.type === 'hr') { out += '<hr />\n'; continue; }
    if (b.type === 'heading') {
      const id = b.id ? ` id="${escapeHtml(b.id)}"` : '';
      out += `<h${b.level}${id}>${inlineToHtml(parseInline(b.text))}</h${b.level}>\n`;
      continue;
    }
    if (b.type === 'ul' || b.type === 'ol') { out += listToHtml(b) + '\n'; continue; }
    out += `<p>${b.lines.map((l) => inlineToHtml(parseInline(l))).join('<br />')}</p>\n`;
  }
  return out;
}

/* ────────────────────────────────────────────────────────────
 * 5. 인쇄 · 복사
 * ──────────────────────────────────────────────────────────── */

/**
 * 인쇄 대화상자를 연다. 성공하면 null, 실패하면 학생에게 보여줄 한국어 안내 문구를 반환한다.
 * @returns {string|null}
 */
export function printReport() {
  try {
    if (typeof window === 'undefined' || typeof window.print !== 'function') {
      return '이 브라우저에서는 바로 인쇄할 수 없어요. 워드로 저장한 뒤 인쇄해 주세요.';
    }
    try { window.focus(); } catch (_) { /* 포커스 실패는 무시 */ }
    window.print();
    return null;
  } catch (_) {
    return '인쇄 창을 열지 못했어요. 키보드에서 Ctrl+P(맥은 ⌘+P)를 눌러 인쇄해 주세요.';
  }
}

/**
 * 보고서를 클립보드에 복사한다(서식 기호를 뺀 읽기 좋은 글).
 * @param {string} md
 * @returns {Promise<boolean>}
 */
export async function copyReport(md) {
  const text = markdownToPlainText(md);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* 아래 대체 방법으로 */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (_) {
    return false;
  }
}

/* ────────────────────────────────────────────────────────────
 * 6. 내보내기 (워드 · 마크다운)
 * ──────────────────────────────────────────────────────────── */

const WORD_CSS = `
@page { size: A4; margin: 20mm 18mm; }
body { font-family: "맑은 고딕", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  font-size: 11pt; line-height: 1.75; color: #1a1a1a; }
.doc-head { border-bottom: 2pt solid #3b6cf5; padding-bottom: 8pt; margin-bottom: 16pt; }
.doc-head .doc-title { font-size: 16pt; font-weight: bold; color: #22314f; margin: 0 0 6pt 0; }
.doc-head .doc-meta { font-size: 9.5pt; color: #555555; margin: 0; }
h1 { font-size: 18pt; color: #22314f; margin: 0 0 12pt 0; line-height: 1.4; }
h2 { font-size: 14pt; color: #2b4a8b; margin: 18pt 0 8pt 0; padding-bottom: 4pt;
  border-bottom: 1pt solid #c9d6f2; line-height: 1.4; }
h3 { font-size: 12pt; color: #33507f; margin: 12pt 0 6pt 0; line-height: 1.4; }
p { margin: 0 0 8pt 0; }
ul, ol { margin: 0 0 10pt 0; padding-left: 18pt; }
li { margin: 0 0 4pt 0; }
strong { font-weight: bold; color: #16305c; }
em { font-style: italic; }
code { font-family: Consolas, "맑은 고딕", monospace; background: #f1f3f7; padding: 0 2pt; }
hr { border: none; border-top: 1pt solid #cccccc; margin: 14pt 0; }
.doc-foot { margin-top: 20pt; padding-top: 8pt; border-top: 1pt solid #dddddd;
  font-size: 9pt; color: #777777; }
`;

function buildWordHtml(md, meta) {
  const m = meta || {};
  const name = safeName(m.name);
  const when = formatDateTime(m.generatedAt);
  const engine = engineLabel(m.engine);
  const body = markdownToHtmlString(md);
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<meta name="ProgId" content="Word.Document" />
<title>${escapeHtml(name)} ${escapeHtml(REPORT_TITLE)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style type="text/css">${WORD_CSS}</style>
</head>
<body>
<div class="doc-head">
<p class="doc-title">진로 잠재력 종합 보고서</p>
<p class="doc-meta">학생: ${escapeHtml(name)} &nbsp;|&nbsp; 생성일시: ${escapeHtml(when)} &nbsp;|&nbsp; 생성 엔진: ${escapeHtml(engine)}</p>
</div>
${body}
<p class="doc-foot">이 보고서는 DISC · MBTI · 다중지능 · RIASEC 4가지 검사 결과를 바탕으로 만들어졌어요. 결과는 지금의 나를 이해하는 참고 자료이며, 앞으로 얼마든지 달라질 수 있어요.</p>
</body>
</html>`;
}

/**
 * 워드(.doc)로 저장한다. 한글(HWP)에서도 열 수 있는 HTML 문서 형식.
 * @param {string} md
 * @param {{name?:string, generatedAt?:string|Date, engine?:string}} meta
 */
export function downloadWord(md, meta) {
  const m = meta || {};
  const html = buildWordHtml(md, m);
  const blob = new Blob(['﻿' + html], { type: 'application/msword' });
  downloadBlob(blob, `${safeName(m.name)}_${REPORT_TITLE}_${formatYmd(m.generatedAt)}.doc`);
}

/**
 * 마크다운 원문(.md)으로 저장한다.
 * @param {string} md
 * @param {{name?:string, generatedAt?:string|Date, engine?:string}} meta
 */
export function downloadMarkdown(md, meta) {
  const m = meta || {};
  const head = `<!-- 학생: ${safeName(m.name)} · 생성일시: ${formatDateTime(m.generatedAt)} · 생성 엔진: ${engineLabel(m.engine)} -->\n\n`;
  const body = stripCodeFences(md);
  const blob = new Blob(['﻿' + head + body + '\n'], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `${safeName(m.name)}_${REPORT_TITLE}_${formatYmd(m.generatedAt)}.md`);
}

/* ────────────────────────────────────────────────────────────
 * 7. 보고서 요청 (SSE 스트리밍 → 실패 시 비스트리밍 재시도)
 * ──────────────────────────────────────────────────────────── */

const LOCAL_NOTICE = '이 화면에서는 AI 서버 없이 기본 분석 엔진으로 보고서를 만들었어요.';
const NET_ERROR_MSG = '보고서를 만들지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 시도해 주세요.';

function isAbortError(err) {
  return !!err && (err.name === 'AbortError' || err.code === 20);
}

function abortError() {
  const e = new Error('보고서 만들기를 취소했어요.');
  e.name = 'AbortError';
  return e;
}

function friendlyError(message) {
  const text = String(message || '').trim();
  // 영어 스택트레이스나 빈 메시지는 학생에게 보여주지 않는다
  if (!text || /[{}\\]|^[A-Za-z][A-Za-z\s.:'"]*$/.test(text) || !/[가-힣]/.test(text)) return NET_ERROR_MSG;
  return text;
}

/** SSE 텍스트 덩어리에서 완성된 이벤트의 data 문자열만 뽑아낸다 */
function drainEvents(buffer) {
  const events = [];
  let rest = buffer;
  let idx;
  while ((idx = rest.search(/\n\s*\n/)) !== -1) {
    const chunk = rest.slice(0, idx);
    rest = rest.slice(idx + rest.slice(idx).match(/^\n\s*\n/)[0].length);
    const data = chunk
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n');
    if (data) events.push(data);
  }
  return { events, rest };
}

async function postJson(url, payload, signal, accept) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: accept || 'application/json' },
    body: JSON.stringify(payload),
    signal,
    cache: 'no-store',
  });
}

async function readErrorMessage(res) {
  try {
    const data = await res.json();
    if (data && data.error) return friendlyError(data.error);
  } catch (_) { /* 본문이 JSON 이 아닐 수 있다 */ }
  if (res.status >= 500) return '서버가 잠시 바빠요. 조금 뒤에 다시 시도해 주세요.';
  return NET_ERROR_MSG;
}

/** 스트리밍 시도. 실패하면 throw 한다(호출부가 폴백). */
async function streamReport(payload, cbs, signal, state) {
  const res = await postJson('/api/report/stream', payload, signal, 'text/event-stream');
  if (!res.ok) throw new Error(await readErrorMessage(res));

  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (!ctype.includes('text/event-stream')) throw new Error('스트리밍 응답이 아니에요.');
  if (!res.body || typeof res.body.getReader !== 'function') throw new Error('스트리밍을 지원하지 않는 브라우저예요.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let done = null;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
    const drained = drainEvents(buffer);
    buffer = drained.rest;

    for (const raw of drained.events) {
      if (raw === '[DONE]') continue;
      let evt;
      try { evt = JSON.parse(raw); } catch (_) { continue; }
      if (!evt || typeof evt !== 'object') continue;

      if (evt.type === 'meta') {
        state.engine = evt.engine || state.engine;
        state.model = evt.model || state.model;
        if (cbs.onMeta) cbs.onMeta({ engine: state.engine, model: state.model });
      } else if (evt.type === 'delta') {
        const text = typeof evt.text === 'string' ? evt.text : '';
        if (!text) continue;
        state.text += text;
        if (cbs.onDelta) cbs.onDelta(text, state.text);
      } else if (evt.type === 'done') {
        state.engine = evt.engine || state.engine;
        state.model = evt.model || state.model;
        const markdown = typeof evt.markdown === 'string' && evt.markdown.trim() ? evt.markdown : state.text;
        done = { markdown, engine: state.engine, model: state.model };
      } else if (evt.type === 'error') {
        throw new Error(friendlyError(evt.message));
      }
    }
    if (done) break;
  }

  try { await reader.cancel(); } catch (_) { /* 이미 닫혔을 수 있다 */ }

  if (!done || !String(done.markdown || '').trim()) throw new Error('보고서가 도중에 끊겼어요.');
  return done;
}

/** 비스트리밍 재시도 */
async function plainReport(payload, signal) {
  const res = await postJson('/api/report', payload, signal, 'application/json');
  if (!res.ok) throw new Error(await readErrorMessage(res));
  let data;
  try { data = await res.json(); } catch (_) { throw new Error(NET_ERROR_MSG); }
  const markdown = data && typeof data.markdown === 'string' ? data.markdown : '';
  if (!markdown.trim()) throw new Error(NET_ERROR_MSG);
  return {
    markdown,
    engine: data.engine || 'fallback',
    model: data.model || '',
    notice: data.notice || '',
  };
}

/**
 * 보고서를 요청한다. 먼저 SSE 스트리밍으로 받아 보고, 안 되면 비스트리밍으로 자동 재시도한다.
 * @param {{student:object, results:object}} payload
 * @param {{onMeta?:Function, onDelta?:Function, onDone?:Function, onError?:Function,
 *          onFallback?:Function, onReset?:Function, signal?:AbortSignal}} cbs
 *   onDelta(chunk, fullSoFar) — 재시도 시에는 onReset() 뒤에 전체 본문이 한 번에 전달된다.
 * @returns {Promise<{markdown:string, engine:string, model:string, notice?:string}>}
 */
export async function requestReport(payload, cbs = {}) {
  const signal = cbs.signal;
  const state = { text: '', engine: '', model: '' };

  const finish = (result) => {
    if (cbs.onDone) cbs.onDone(result);
    return result;
  };
  const fail = (err) => {
    if (isAbortError(err)) throw abortError();
    const e = err instanceof Error ? err : new Error(String(err || ''));
    e.message = friendlyError(e.message);
    if (cbs.onError) cbs.onError(e);
    throw e;
  };

  if (signal && signal.aborted) throw abortError();

  // 1차: 스트리밍
  try {
    const result = await streamReport(payload, cbs, signal, state);
    return finish(result);
  } catch (err) {
    if (isAbortError(err) || (signal && signal.aborted)) throw abortError();
    if (cbs.onFallback) cbs.onFallback(err instanceof Error ? err : new Error(String(err)));
  }

  // 2차: 비스트리밍 재시도
  try {
    const result = await plainReport(payload, signal);
    state.text = result.markdown;
    state.engine = result.engine;
    state.model = result.model;
    if (cbs.onReset) cbs.onReset();
    if (cbs.onMeta) cbs.onMeta({ engine: result.engine, model: result.model });
    if (cbs.onDelta) cbs.onDelta(result.markdown, result.markdown);
    return finish(result);
  } catch (err) {
    if (isAbortError(err) || (signal && signal.aborted)) throw abortError();
    // 서버(/api)가 없는 정적 호스팅(GitHub Pages)이거나 서버가 죽은 경우: 브라우저 안에서 기본 분석 엔진으로 만든다.
    try {
      const markdown = buildFallbackReport(payload);
      if (!String(markdown || '').trim()) throw new Error('empty');
      const result = { markdown, engine: 'fallback', model: 'rule-based', notice: LOCAL_NOTICE };
      state.text = markdown;
      if (cbs.onReset) cbs.onReset();
      if (cbs.onMeta) cbs.onMeta({ engine: result.engine, model: result.model });
      if (cbs.onDelta) cbs.onDelta(markdown, markdown);
      return finish(result);
    } catch (_) {
      return fail(err);
    }
  }
}
