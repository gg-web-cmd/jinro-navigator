// 화면 렌더링 모듈 — 상태를 받아 DOM 을 만들어 돌려주는 순수 렌더러입니다.
// 학교급(초·중·고)에 따라 문항 세트와 화면 문구가 함께 바뀝니다. 문구는 아래 t(key, level) 사전으로만 갈라 씁니다.
// 상태를 직접 바꾸지 않고 전달받은 handlers(h) 콜백만 호출하며, CSS 는 style.css 의 클래스 계약만 사용합니다.

import { getTests, getTest, totalQuestions, questionCounts } from './tests.js';
import { LEVELS, DEFAULT_LEVEL, getLevel, isEasy, isValidLevel } from './data/levels.js';

/* ────────────────────────── DOM 헬퍼 ────────────────────────── */

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(node, attrs, isSvg) {
  if (!attrs) return;
  for (const key of Object.keys(attrs)) {
    const v = attrs[key];
    if (v === null || v === undefined || v === false) continue;
    if (key === 'class' || key === 'className') {
      const cls = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
      if (isSvg) node.setAttribute('class', cls);
      else node.className = cls;
    } else if (key === 'text') {
      node.textContent = String(v);
    } else if (key === 'html') {
      // 우리 데이터 파일의 고정 문자열에만 사용한다. 사용자 입력에는 절대 쓰지 않는다.
      node.innerHTML = String(v);
    } else if (key === 'style') {
      if (typeof v === 'string') {
        node.setAttribute('style', v);
      } else {
        Object.keys(v).forEach((p) => {
          const val = v[p];
          if (val === null || val === undefined || val === false) return;
          // CSS 사용자 정의 속성(--x)은 setProperty 로만 설정된다.
          if (p.startsWith('--')) node.style.setProperty(p, String(val));
          else node.style[p] = val;
        });
      }
    } else if (key === 'dataset') {
      Object.keys(v).forEach((d) => { node.dataset[d] = v[d]; });
    } else if (key.startsWith('on:')) {
      if (typeof v === 'function') node.addEventListener(key.slice(3), v);
    } else if (key.startsWith('on') && typeof v === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), v);
    } else if (v === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(v));
    }
  }
}

function appendKids(node, kids) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false || kid === true) continue;
    if (Array.isArray(kid)) { appendKids(node, kid); continue; }
    node.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

/** 작은 DOM 헬퍼. el('div', {class:'card', 'on:click':fn}, '내용') */
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  applyAttrs(node, attrs, false);
  appendKids(node, children);
  return node;
}

/** SVG 네임스페이스용 헬퍼 */
export function svgEl(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs, true);
  appendKids(node, children);
  return node;
}

/* ────────────────────────── 학교급 ────────────────────────── */

/**
 * state · session · 문자열 무엇을 받아도 학교급 키 하나로 정리한다.
 * 아직 고르지 않았으면 기본 급으로 본다(화면이 깨지지 않게).
 */
export function levelKeyFrom(x) {
  if (!x) return DEFAULT_LEVEL;
  if (typeof x === 'string') return isValidLevel(x) ? x : DEFAULT_LEVEL;
  if (x.session) return levelKeyFrom(x.session.level);
  if (x.level) return levelKeyFrom(x.level);
  return DEFAULT_LEVEL;
}

/** 세션에 실제로 저장된 학교급. 아직 고르지 않았으면 null */
export function selectedLevel(state) {
  const s = state && state.session;
  const k = s && s.level;
  return isValidLevel(k) ? k : null;
}

const levelInfoOf = (x) => getLevel(levelKeyFrom(x));

/* ────────────────────────── 문구 사전 ────────────────────────── */

// [기본(중·고), 초등 쉬운 말]. 초등급에서 두 번째 값이 없으면 기본값을 그대로 쓴다.
const PHRASES = {
  question: ['문항', '질문'],
  answerWord: ['응답', '대답'],
  answeredTag: ['응답 완료', '대답했어요'],
  notPicked: ['아직 안 골랐어요', '아직 안 골랐어요'],

  start: ['검사 시작하기', '시작해요'],
  startAgain: ['새로 시작하기', '처음부터 새로 해요'],
  resume: ['이어서 하기', '이어서 해요'],
  resumeRest: ['남은 검사 이어서 하기', '남은 것 이어서 해요'],
  combine: ['결과 종합하기', '결과 모아보기'],
  combineView: ['결과 종합 보기', '결과 모아보기'],
  summaryView: ['결과 요약 보기', '모아본 결과 보기'],
  doTest: ['검사하기', '해볼래요'],
  seeResult: ['결과 보기', '결과 보기'],
  seeResultAgain: ['결과 다시 보기', '결과 다시 보기'],
  seeDetail: ['자세히 보기', '자세히 보기'],
  retake: ['처음부터 다시', '처음부터 다시 해요'],
  retakeThis: ['이 검사 다시하기', '이거 다시 해요'],
  home: ['홈으로', '처음 화면으로'],
  later: ['나중에 이어하기', '나중에 이어서 해요'],
  goTest: ['검사하러 가기', '하러 가기'],

  homeTitle: ['나를 알아가는 진로 검사', '나를 알아보는 진로 검사'],
  homeLead: [
    '4가지 검사로 나의 행동 스타일, 성격, 재능, 흥미를 한 번에 살펴보고 AI가 정리한 진로 잠재력 종합 보고서를 받아보세요.',
    '4가지 검사로 내가 어떤 사람인지 알아보고, 나만의 진로 이야기를 받아볼 수 있어요.',
  ],
  homeSave: [
    '한 번에 다 하지 않아도 괜찮아요. 중간에 쉬었다 이어할 수 있어요. 답은 고를 때마다 이 컴퓨터에 자동 저장돼요.',
    '한 번에 다 안 해도 괜찮아요. 쉬었다가 이어서 해도 돼요. 고른 답은 저절로 저장돼요.',
  ],
  testsTitle: ['검사 4종', '검사 4가지'],
  testsSub: [
    '순서대로 하는 것을 권하지만, 원하는 검사부터 해도 괜찮아요.',
    '순서대로 하면 좋지만, 하고 싶은 것부터 해도 괜찮아요.',
  ],
  keepGoing: [
    '중간에 그만둬도 괜찮아요. 답은 고를 때마다 저장돼서, 언제든 이어서 할 수 있어요.',
    '하다가 그만해도 괜찮아요. 고른 답은 바로 저장돼서 언제든 이어서 할 수 있어요.',
  ],
  howToAnswer: ['답하는 요령', '이렇게 골라요'],
  keyHelp: ['키보드로도 할 수 있어요', '키보드로도 할 수 있어요'],
  countLabel: ['문항 수', '질문 개수'],
  estLabel: ['예상 시간', '걸리는 시간'],
  soFar: ['지금까지', '지금까지'],

  studentTitle: ['먼저 나를 소개해 주세요', '먼저 나를 소개해 줄래요?'],
  studentLead: [
    '보고서에 이름을 넣기 위해 물어봐요. 비워 두면 "학생"으로 불러 드릴게요.',
    '결과에 이름을 적어 주려고 물어봐요. 안 적어도 괜찮아요.',
  ],
  studentSave: ['저장하고 시작하기', '저장하고 시작해요'],

  levelTitle: ['어느 학교에 다니고 있나요?', '어느 학교에 다니고 있나요?'],
  levelChange: ['학교급 바꾸기', '학교 바꾸기'],
  levelPickFirst: ['학교급 고르기', '학교 고르기'],
  levelNotice: [
    '고르면 이 수준에 맞는 문항으로 검사해요. 나중에 바꾸면 답한 내용이 초기화돼요.',
    '고르면 나에게 맞는 질문이 나와요. 나중에 학교를 바꾸면 지금까지 대답한 것이 지워져요.',
  ],
};

/**
 * 급별 문구 사전. t('start', 'elem') → '시작해요'
 * @param {string} key PHRASES 의 키
 * @param {string|object} level 급 키 / state / session
 */
export function t(key, level) {
  const row = PHRASES[key];
  if (!row) return String(key);
  return isEasy(levelKeyFrom(level)) ? (row[1] || row[0]) : row[0];
}

/** '문항' 또는 '질문' */
const U = (level) => t('question', level);

/* ────────────────────────── 작은 유틸 ────────────────────────── */

const call = (fn, ...args) => { if (typeof fn === 'function') fn(...args); };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

const FALLBACK_KEYS = ['disc', 'mbti', 'mi', 'riasec'];
const TEST_EMOJI = { disc: '🧭', mbti: '🧩', mi: '🌟', riasec: '🎯' };
const TEST_SHORT = { disc: 'DISC', mbti: 'MBTI', mi: '다중지능', riasec: 'RIASEC' };

const TEST_ACCENT = {
  disc: 'var(--accent-disc)',
  mbti: 'var(--accent-mbti)',
  mi: 'var(--accent-mi)',
  riasec: 'var(--accent-riasec)',
};

const DISC_ORDER = ['D', 'I', 'S', 'C'];
const RIASEC_ORDER = ['R', 'I', 'A', 'S', 'E', 'C'];
const MI_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** 해당 급의 검사 목록 */
function testsOf(x) {
  try {
    const list = getTests(levelKeyFrom(x));
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

/** 해당 급의 검사 키 목록 */
function testKeysOf(x) {
  const list = testsOf(x).map((item) => item.key);
  return list.length ? list : FALLBACK_KEYS;
}

/** 해당 급의 검사 하나 */
function testOf(x, key) {
  return getTest(levelKeyFrom(x), key);
}

/** 다음 검사 키 (없으면 null) */
function nextKeyOf(x, key) {
  const keys = testKeysOf(x);
  const i = keys.indexOf(key);
  return i >= 0 && i < keys.length - 1 ? keys[i + 1] : null;
}

/** 해당 급의 전체 문항 수 */
function levelTotal(x) {
  const lv = levelKeyFrom(x);
  try {
    const n = totalQuestions(lv);
    if (Number.isFinite(n) && n > 0) return n;
  } catch (_) { /* levels.js 의 값으로 대신한다 */ }
  return getLevel(lv).total;
}

/** 이 급의 유형 설명 묶음(초등은 쉬운 말 버전). 못 읽으면 빈 객체 */
function typesOf(x, key) {
  try { return testOf(x, key).types || {}; } catch (_) { return {}; }
}

/** 이 급에서 척도 하나가 가질 수 있는 점수 범위 (없으면 null) */
function scoreRange(x, key) {
  try {
    const test = testOf(x, key);
    const per = getLevel(levelKeyFrom(x)).perScale;
    const vals = (test.scale || []).map((o) => Number(o.value)).filter((n) => Number.isFinite(n));
    if (!vals.length || !per) return null;
    return { min: per * Math.min(...vals), max: per * Math.max(...vals) };
  } catch (_) {
    return null;
  }
}

const CHEERS = [
  '좋아요, 잘하고 있어요! 이 속도면 금방 끝나요.',
  '정답은 없어요. 떠오르는 대로 편하게 골라도 괜찮아요.',
  '벌써 여기까지 왔어요. 눈을 한 번 감았다 뜨고 계속해 볼까요?',
  '잠깐 쉬어도 괜찮아요. 답은 자동으로 저장되고 있어요.',
  '지금 고른 답들이 모여 나만의 진로 지도를 만들어요.',
  '어깨 한 번 쭉 펴고, 물 한 모금 마시고 다시 시작!',
  '너무 오래 고민하지 않아도 돼요. 첫 느낌이 가장 정확해요.',
  '거의 다 왔어요. 마지막까지 솔직하게 답해 주세요.',
];

const REPORT_TIPS = [
  '보고서에는 4가지 검사 결과를 하나로 엮은 종합 분석이 담겨요.',
  '보고서가 만들어지는 동안 창을 닫지 말고 잠시 기다려 주세요.',
  '결과는 "이런 성향이 있다"는 참고 자료예요. 나를 규정하는 정답은 아니에요.',
  '완성된 보고서는 인쇄하거나 워드 파일로 저장해 선생님·부모님과 함께 볼 수 있어요.',
];

const SCHOOL_PLACEHOLDER = {
  elem: '예) 한빛초등학교',
  mid: '예) 한빛중학교',
  high: '예) 한빛고등학교',
};
const GRADE_PLACEHOLDER = { elem: '예) 5학년', mid: '예) 2학년', high: '예) 2학년' };

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

function displayName(session) {
  const n = session && session.student && session.student.name;
  return n && String(n).trim() ? String(n).trim() : '학생';
}

function answersOf(session, key) {
  const a = session && session.answers && session.answers[key];
  return Array.isArray(a) ? a : [];
}

function answeredCount(session, key) {
  return answersOf(session, key).filter((v) => v !== null && v !== undefined && v !== '').length;
}

function testTotal(session, key) {
  try { return testOf(session, key).questions.length; } catch (_) { return 0; }
}

function isDone(session, key) {
  if (session && session.done && session.done[key]) return true;
  const total = testTotal(session, key);
  return total > 0 && answeredCount(session, key) === total;
}

function overall(session) {
  let done = 0;
  for (const key of testKeysOf(session)) done += answeredCount(session, key);
  const total = levelTotal(session);
  return { done, total, percent: pctOf(done, total) };
}

function firstUnanswered(session, key) {
  const arr = answersOf(session, key);
  const total = testTotal(session, key);
  for (let i = 0; i < total; i += 1) {
    const v = arr[i];
    if (v === null || v === undefined || v === '') return i;
  }
  return -1;
}

function cursorOf(session, key) {
  const c = session && session.cursor ? session.cursor[key] : 0;
  const total = testTotal(session, key);
  return clamp(Number(c) || 0, 0, Math.max(0, total - 1));
}

/* 공통 조각 */

function progressBar(percent, metaLeft, metaRight) {
  const p = clamp(Math.round(percent) || 0, 0, 100);
  return el(
    'div',
    { class: 'stack' },
    (metaLeft || metaRight)
      ? el('div', { class: 'progress__meta' },
          el('span', { text: metaLeft || '' }),
          el('span', { text: metaRight || '' }))
      : null,
    el('div', {
      class: 'progress',
      role: 'progressbar',
      'aria-valuenow': String(p),
      'aria-valuemin': '0',
      'aria-valuemax': '100',
    }, el('div', { class: 'progress__bar', style: { width: p + '%' } })),
  );
}

function screen(name, ...kids) {
  return el('section', { class: 'screen', 'data-screen': name }, ...kids);
}

function sectionTitle(text, sub) {
  return el('div', { class: 'stack' },
    el('h2', { text }),
    sub ? el('p', { class: 'muted small', text: sub }) : null);
}

/** 지금 급을 알려주는 작은 배지 */
function levelBadge(x) {
  const info = levelInfoOf(x);
  return el('span', { class: 'badge', text: `${info.emoji} ${info.label}` });
}

/* ────────────────────────── 공개 컴포넌트 ────────────────────────── */

/** 전체 진행률 배지 — 헤더에 꽂아 쓴다. */
export function headerProgress(state) {
  const s = state && state.session;
  const lv = levelKeyFrom(state);
  const { done, total, percent } = overall(s);
  const wrap = el('div', { class: 'progress__meta no-print', 'aria-label': '전체 진행률' });
  if (selectedLevel(state)) wrap.appendChild(levelBadge(lv));
  wrap.appendChild(el('span', { class: 'badge', text: `${percent}%` }));
  wrap.appendChild(el('span', { class: 'small muted nowrap', text: `${done} / ${total}${U(lv)}` }));
  return wrap;
}

/** 4개 검사 진행 스텝퍼 */
export function stepper(currentKey, state) {
  const s = state && state.session;
  const box = el('ol', { class: 'stepper', 'aria-label': '검사 진행 순서' });
  testsOf(state).forEach((test) => {
    const done = isDone(s, test.key);
    const active = test.key === currentKey;
    const mod = active ? 'step--active' : done ? 'step--done' : 'step--todo';
    box.appendChild(el('li', {
      class: `step ${mod}`,
      'aria-current': active ? 'step' : null,
      style: { '--step-accent': TEST_ACCENT[test.key] || 'var(--brand)' },
    },
      el('span', { class: 'step__dot', 'aria-hidden': 'true', text: done && !active ? '✓' : String(test.order) }),
      el('span', { class: 'step__label', text: test.short })));
  });
  return box;
}

/** 막대 목록. items: [{label, value, max, percent, color}] */
export function barList(items) {
  const box = el('div', { class: 'bars' });
  (items || []).forEach((it) => {
    const percent = clamp(
      Math.round(it.percent !== undefined && it.percent !== null ? it.percent : pctOf(it.value, it.max)),
      0, 100,
    );
    box.appendChild(el('div', { class: 'bar' },
      el('span', { class: 'bar__label', text: String(it.label) }),
      el('span', { class: 'bar__track' },
        el('span', {
          class: 'bar__fill',
          style: { width: percent + '%', background: it.color || 'var(--brand)' },
        })),
      el('span', {
        class: 'bar__val nowrap',
        text: it.max ? `${it.value}점 · ${percent}%` : `${percent}%`,
      })));
  });
  return box;
}

/** 레이더(방사형) 차트. 다중지능 8각형 / RIASEC 6각형용 */
export function radarSvg({ labels = [], percents = [], color = 'var(--brand)', size = 300 } = {}) {
  const n = Math.max(labels.length, percents.length);
  // 좌우 라벨(예: "자기성찰")이 잘리지 않도록 가로 여백을 넉넉히 둔다.
  const vw = size + 96;
  const vh = size;
  const cx = vw / 2;
  const cy = vh / 2;
  const R = Math.max(40, vh / 2 - 46);
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / (n || 1);
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const poly = (r) => Array.from({ length: n }, (_, i) => pt(i, r).map((v) => v.toFixed(1)).join(',')).join(' ');

  const svg = svgEl('svg', {
    class: 'radar',
    viewBox: `0 0 ${vw} ${vh}`,
    width: '100%',
    role: 'img',
    'aria-label': labels.map((l, i) => `${l} ${Math.round(percents[i] || 0)}%`).join(', '),
  });

  // 배경 격자 (25 / 50 / 75 / 100%)
  [0.25, 0.5, 0.75, 1].forEach((k) => {
    svg.appendChild(svgEl('polygon', {
      points: poly(R * k),
      fill: 'none',
      stroke: 'var(--line)',
      'stroke-width': k === 1 ? 1.4 : 1,
    }));
  });

  // 축선
  for (let i = 0; i < n; i += 1) {
    const [x, y] = pt(i, R);
    svg.appendChild(svgEl('line', {
      x1: cx, y1: cy, x2: x.toFixed(1), y2: y.toFixed(1),
      stroke: 'var(--line)', 'stroke-width': 1,
    }));
  }

  // 데이터 다각형
  const dataPts = Array.from({ length: n }, (_, i) => {
    const r = (R * clamp(Number(percents[i]) || 0, 0, 100)) / 100;
    return pt(i, r);
  });
  svg.appendChild(svgEl('polygon', {
    points: dataPts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '),
    fill: color,
    'fill-opacity': '0.22',
    stroke: color,
    'stroke-width': 2,
    'stroke-linejoin': 'round',
  }));
  dataPts.forEach((p) => {
    svg.appendChild(svgEl('circle', {
      cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 3.2, fill: color,
    }));
  });

  // 라벨
  for (let i = 0; i < n; i += 1) {
    const [lx, ly] = pt(i, R + 18);
    let anchor = 'middle';
    if (lx > cx + 4) anchor = 'start';
    else if (lx < cx - 4) anchor = 'end';
    let dy = '0.34em';
    if (ly < cy - 6) dy = '-0.15em';
    else if (ly > cy + 6) dy = '0.85em';
    svg.appendChild(svgEl('text', {
      x: lx.toFixed(1), y: ly.toFixed(1),
      'text-anchor': anchor, dy,
      fill: 'var(--text)', 'font-size': 12, 'font-weight': 600,
    }, String(labels[i] ?? '')));
    svg.appendChild(svgEl('text', {
      x: lx.toFixed(1), y: (ly + 13).toFixed(1),
      'text-anchor': anchor, dy,
      fill: 'var(--text-dim)', 'font-size': 10,
    }, `${Math.round(percents[i] || 0)}%`));
  }

  return svg;
}

/** 토스트 알림. 3초 뒤 사라진다. */
export function toast(message, kind = 'ok') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = el('div', { id: 'toast-root', class: 'no-print', 'aria-live': 'polite' });
    document.body.appendChild(root);
  }
  const node = el('div', { class: `toast toast--${kind}`, role: 'status', text: String(message) });
  root.appendChild(node);
  setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 3000);
  return node;
}

/** 로딩 스피너 */
export function spinner(label) {
  return el('div', { class: 'center stack' },
    el('div', { class: 'spinner', 'aria-hidden': 'true' }),
    label ? el('p', { class: 'muted small', text: String(label) }) : null);
}

/**
 * 경과 시간을 1초마다 갱신하는 한 줄.
 * 화면이 바뀌어 노드가 사라지면 타이머도 스스로 멈춘다.
 */
function elapsedLine(startedAt) {
  const node = el('p', { class: 'center small muted', 'aria-live': 'off' });
  const began = Number(startedAt) || Date.now();
  const paint = () => {
    const sec = Math.max(0, Math.round((Date.now() - began) / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const when = m > 0 ? `${m}분 ${s}초` : `${s}초`;
    node.textContent = sec >= 150
      ? `${when} 지났어요. 조금 오래 걸리고 있지만 아직 진행 중이에요. 기다리기 어려우면 아래에서 멈추고 다시 시도해도 괜찮아요.`
      : `${when} 지났어요. 보통 1~2분이면 끝나요.`;
  };
  paint(); // 아직 화면에 붙기 전이라 여기서는 연결 여부를 보지 않는다
  const id = setInterval(() => {
    if (node.isConnected === false) { clearInterval(id); return; } // 화면이 바뀌면 스스로 멈춘다
    paint();
  }, 1000);
  return node;
}

function alertBox(kind, title, body) {
  return el('div', { class: `alert alert--${kind}`, role: kind === 'err' ? 'alert' : 'status' },
    title ? el('strong', { text: title }) : null,
    body ? el('p', { class: 'small', text: body }) : null);
}

/* ────────────────────────── 학교급 선택 ────────────────────────── */

/** 한 급 카드에 붙는 "검사별 문항 수" 줄 — 실제 문항 수를 tests.js 에서 읽는다. */
function levelCountTags(info) {
  let counts = null;
  try { counts = questionCounts(info.key); } catch (_) { counts = null; }
  const row = el('div', { class: 'row' });
  FALLBACK_KEYS.forEach((key) => {
    const n = (counts && counts[key]) || (info.counts ? info.counts[key] : 0);
    if (!n) return;
    row.appendChild(el('span', {
      class: 'tag',
      text: `${TEST_EMOJI[key]} ${TEST_SHORT[key]} ${n}${U(info.key)}`,
    }));
  });
  return row;
}

function levelCard(info, cur, h) {
  const on = cur === info.key;
  return el('div', {
    class: 'card card--pad stack',
    style: { '--card-accent': on ? 'var(--brand)' : 'var(--line)' },
  },
    el('div', { class: 'row' },
      el('span', { class: 'q-index', 'aria-hidden': 'true', text: info.emoji }),
      el('strong', { text: info.label }),
      el('span', { class: 'tag', text: info.grades }),
      el('span', { class: 'spacer' }),
      on ? el('span', { class: 'badge', text: '지금 이 수준' }) : null),
    el('p', { text: info.blurb }),
    el('div', { class: 'row' },
      el('span', { class: 'chip', text: `총 ${levelTotal(info.key)}${U(info.key)}` }),
      el('span', { class: 'chip', text: `약 ${info.estMinutes}분` }),
      el('span', { class: 'chip', text: info.stage })),
    el('p', { class: 'muted small', text: info.stageDesc }),
    levelCountTags(info),
    el('button', {
      class: 'btn btn--block ' + (on ? 'btn--ghost' : 'btn--primary'),
      type: 'button',
      'on:click': () => call(h && h.onPickLevel, info.key),
      text: on ? `${info.label}으로 계속하기` : `${info.label}으로 시작하기`,
    }));
}

/**
 * 학교급 선택 화면. 초·중·고 카드 3장을 보여주고 고르게 한다.
 * 고른 급이 문항 세트와 화면 문구를 모두 결정한다.
 */
export function renderLevelPicker(state, h) {
  const s = state && state.session;
  const cur = selectedLevel(state);
  const answered = s ? overall(s).done : 0;
  const view = screen('level');

  view.appendChild(el('div', { class: 'card card--pad stack' },
    el('h1', { text: t('levelTitle', cur) }),
    el('p', { text: '학교급마다 문항 수와 말투가 달라요. 지금 다니는 학교를 골라 주세요.' }),
    alertBox('info', t('levelNotice', cur),
      '고른 학교급에 맞춰 4가지 검사의 문항이 새로 준비돼요. 검사 도중에 학교급을 바꾸면 지금까지 고른 답은 모두 지워지고 처음부터 다시 하게 돼요.')));

  if (cur && answered > 0) {
    view.appendChild(alertBox('warn', '지금 하던 검사가 있어요',
      `지금까지 ${answered}${U(cur)}에 답했어요. 다른 학교급을 고르면 이 답들은 지워져요. 그대로 이어서 하려면 아래 "${t('home', cur)}" 버튼을 눌러 주세요.`));
  }

  const list = el('div', { class: 'stack' });
  LEVELS.forEach((info) => list.appendChild(levelCard(info, cur, h)));
  view.appendChild(list);

  view.appendChild(el('div', { class: 'row' },
    el('button', {
      class: 'btn btn--ghost btn--sm',
      type: 'button',
      'on:click': () => call(h && h.onGoto, '#/'),
      text: t('home', cur),
    }),
    el('span', { class: 'spacer' }),
    el('span', { class: 'muted small', text: '잘 모르겠으면 지금 다니는 학교를 그대로 고르면 돼요.' })));

  return view;
}

/* ────────────────────────── 홈 ────────────────────────── */

/** 홈 맨 위에 붙는 "지금 학교급" 줄 */
function levelStrip(state, h) {
  const lv = levelKeyFrom(state);
  const cur = selectedLevel(state);
  const info = getLevel(lv);
  return el('div', { class: 'row' },
    cur ? levelBadge(lv) : el('span', { class: 'tag', text: '학교급을 아직 안 골랐어요' }),
    cur ? el('span', { class: 'muted small', text: `${info.grades} · ${info.stage}` }) : null,
    el('span', { class: 'spacer' }),
    el('button', {
      class: 'btn btn--ghost btn--sm',
      type: 'button',
      'on:click': () => call(h && h.onChangeLevel),
      text: cur ? t('levelChange', lv) : t('levelPickFirst', lv),
    }));
}

export function renderHome(state, h) {
  const s = state && state.session;
  const lv = levelKeyFrom(state);
  const info = getLevel(lv);
  const cur = selectedLevel(state);
  const prog = overall(s);
  const started = prog.done > 0;
  const archive = (state && (state.archive || (state.ui && state.ui.archive))) || [];

  const view = screen('home');

  view.appendChild(el('div', { class: 'card card--pad stack' },
    el('h1', { text: t('homeTitle', lv) }),
    levelStrip(state, h),
    el('p', { text: t('homeLead', lv) }),
    // 급을 고르기 전에는 문항 수를 단정하지 않는다(급마다 다르다).
    cur
      ? el('div', { class: 'row' },
          el('span', { class: 'chip', text: `총 ${levelTotal(lv)}${U(lv)}` }),
          el('span', { class: 'chip', text: `약 ${info.estMinutes}분` }),
          el('span', { class: 'chip', text: '검사 4종' }))
      : el('div', { class: 'row' },
          el('span', { class: 'chip', text: '검사 4종' }),
          el('span', { class: 'muted small', text: '학교급을 고르면 문항 수와 걸리는 시간을 알려드려요.' })),
    el('p', { class: 'muted small', text: t('homeSave', lv) }),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn btn--primary btn--lg',
        type: 'button',
        'on:click': () => call(h && h.onNewSession),
        text: started ? t('startAgain', lv) : t('start', lv),
      }),
      started ? el('button', {
        class: 'btn btn--ghost btn--lg',
        type: 'button',
        'on:click': () => call(h && h.onResume),
        text: t('resume', lv),
      }) : null)));

  if (started) {
    const nextKey = testKeysOf(state).find((k) => !isDone(s, k)) || null;
    let nextShort = '';
    if (nextKey) {
      try { nextShort = testOf(state, nextKey).short; } catch (_) { nextShort = TEST_SHORT[nextKey] || ''; }
    }
    view.appendChild(el('div', { class: 'card card--pad stack' },
      el('h2', { text: '이어하기' }),
      el('p', { class: 'small' },
        el('strong', { text: displayName(s) }),
        document.createTextNode('님, 하던 검사가 남아 있어요.')),
      progressBar(prog.percent, '전체 진행률', `${prog.done} / ${prog.total}${U(lv)}`),
      s && s.updatedAt ? el('p', { class: 'muted small', text: `마지막 저장: ${formatDate(s.updatedAt)}` }) : null,
      el('div', { class: 'row' },
        el('button', {
          class: 'btn btn--primary',
          type: 'button',
          'on:click': () => call(h && h.onResume),
          text: nextKey ? `${nextShort} 검사 ${t('resume', lv)}` : t('combineView', lv),
        }),
        el('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          'on:click': () => call(h && h.onGoto, '#/dashboard'),
          text: t('summaryView', lv),
        }))));
  }

  const grid = el('div', { class: 'grid grid--2' });
  testsOf(state).forEach((test) => {
    const done = isDone(s, test.key);
    const cnt = answeredCount(s, test.key);
    const total = test.questions.length;
    grid.appendChild(el('div', {
      class: 'card card--pad stack',
      style: { '--card-accent': test.accent },
    },
      el('div', { class: 'row' },
        el('span', { class: 'q-index', 'aria-hidden': 'true', text: test.emoji }),
        el('strong', { text: test.title }),
        el('span', { class: 'spacer' }),
        el('span', {
          class: 'badge',
          text: done ? '완료' : cnt > 0 ? `${cnt}/${total}` : '시작 전',
        })),
      el('p', { class: 'small', text: test.subtitle }),
      el('p', {
        class: 'muted small',
        text: cur
          ? `${total}${U(lv)} · 약 ${test.estMinutes}분`
          : `학교급을 고르면 ${U(lv)} 수가 정해져요.`,
      }),
      el('div', { class: 'row' },
        el('button', {
          class: 'btn btn--sm ' + (done ? 'btn--ghost' : 'btn--primary'),
          type: 'button',
          'on:click': () => call(h && h.onGoto, `#/intro/${test.key}`),
          text: done ? t('seeResultAgain', lv) : cnt > 0 ? t('resume', lv) : t('doTest', lv),
        }),
        done ? el('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          'on:click': () => call(h && h.onGoto, `#/result/${test.key}`),
          text: t('seeResult', lv),
        }) : null)));
  });
  view.appendChild(el('div', { class: 'stack' },
    sectionTitle(t('testsTitle', lv), t('testsSub', lv)),
    grid));

  // 결과 불러오기 (JSON)
  const fileInput = el('input', {
    type: 'file',
    accept: '.json,application/json',
    id: 'import-json',
    class: 'small',
    // 라벨 버튼으로 대신 누르게 하되, 키보드 포커스는 유지한다.
    style: 'position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;',
    'on:change': (ev) => {
      const file = ev.target && ev.target.files && ev.target.files[0];
      if (file) call(h && h.onImport, file, ev);
      if (ev.target) ev.target.value = '';
    },
  });
  view.appendChild(el('div', { class: 'card card--pad stack' },
    el('h2', { text: '저장해 둔 결과 불러오기' }),
    el('p', { class: 'muted small', text: '예전에 내려받은 결과 파일(.json)을 열면 그때 상태 그대로 이어서 볼 수 있어요.' }),
    el('label', { class: 'btn btn--ghost btn--sm', for: 'import-json', text: '결과 파일 선택' }),
    fileInput));

  // 보관함
  const box = el('div', { class: 'stack' }, sectionTitle('보관함', '이 컴퓨터에 저장된 지난 검사들이에요.'));
  const archiveCount = archive.length;
  if (!archive.length) {
    box.appendChild(el('div', { class: 'empty', text: '아직 보관된 검사가 없어요.' }));
  } else {
    const list = el('div', { class: 'stack' });
    archive.forEach((item) => {
      const st = (item && item.student) || {};
      const who = st.name && String(st.name).trim() ? String(st.name).trim() : '이름 없음';
      const meta = [st.school, st.grade].filter(Boolean).join(' ');
      const itemLv = levelKeyFrom(item && item.level);
      const p = typeof item.percent === 'number'
        ? item.percent
        : pctOf(Number(item.answered) || 0, levelTotal(itemLv));
      const row = el('div', { class: 'card card--pad row' },
        el('div', { class: 'stack' },
          el('div', { class: 'row' },
            el('strong', { text: who }),
            levelBadge(itemLv)),
          meta ? el('span', { class: 'muted small', text: meta }) : null,
          el('span', { class: 'muted small', text: `${formatDate(item.updatedAt)} · 진행 ${p}%` })),
        el('span', { class: 'spacer' }),
        el('button', {
          class: 'btn btn--sm',
          type: 'button',
          'on:click': () => call(h && h.onArchiveOpen, item.id),
          text: '열기',
        }),
        el('button', {
          class: 'btn btn--danger btn--sm',
          type: 'button',
          'on:click': () => call(h && h.onArchiveDelete, item.id),
          text: '삭제',
        }));
      list.appendChild(row);
    });
    box.appendChild(list);
  }
  view.appendChild(box);

  // 공용 컴퓨터 정리 — 학교 컴퓨터에서 다음 학생에게 내 기록이 남지 않게 한다.
  if (started || archiveCount > 0) {
    view.appendChild(el('div', { class: 'card card--pad stack' },
      el('h2', { text: '학교 공용 컴퓨터를 쓰고 있나요?' }),
      el('p', { class: 'muted small', text: `이름과 답변은 이 컴퓨터의 브라우저에 저장돼요. 지금 이 컴퓨터에는 진행 중인 검사${archiveCount > 0 ? ` 1개와 보관함 기록 ${archiveCount}개가` : '가'} 남아 있어요. 다 썼다면 아래 버튼으로 지우고 자리를 비켜 주세요.` }),
      el('div', { class: 'row' },
        el('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          'on:click': () => call(h && h.onExport, 'json'),
          text: '지우기 전에 결과 파일로 저장',
        }),
        el('span', { class: 'spacer' }),
        el('button', {
          class: 'btn btn--danger btn--sm',
          type: 'button',
          'on:click': () => call(h && h.onClearAll),
          text: '이 컴퓨터의 기록 모두 지우기',
        }))));
  }

  return view;
}

/* ────────────────────────── 학생 정보 ────────────────────────── */

export function renderStudentForm(state, h) {
  const st = (state && state.session && state.session.student) || {};
  const lv = levelKeyFrom(state);
  const info = getLevel(lv);
  const view = screen('student');

  const nameInput = el('input', {
    id: 'f-name', type: 'text', name: 'name',
    maxlength: '20', autocomplete: 'off', placeholder: '예) 김하늘',
  });
  const schoolInput = el('input', {
    id: 'f-school', type: 'text', name: 'school',
    maxlength: '30', autocomplete: 'off', placeholder: SCHOOL_PLACEHOLDER[lv] || SCHOOL_PLACEHOLDER.mid,
  });
  const gradeInput = el('input', {
    id: 'f-grade', type: 'text', name: 'grade',
    maxlength: '20', autocomplete: 'off', placeholder: GRADE_PLACEHOLDER[lv] || GRADE_PLACEHOLDER.mid,
  });
  nameInput.value = st.name || '';
  schoolInput.value = st.school || '';
  gradeInput.value = st.grade || '';

  // 보고서를 만들 때 이름·학교를 AI 서버로 보낼지 고르는 스위치. 기본은 보내지 않음.
  const sendNameInput = el('input', { id: 'f-sendname', type: 'checkbox' });
  sendNameInput.checked = (state && state.session && state.session.sendName) === true;

  const submit = () => call(h && h.onSaveStudent, {
    name: nameInput.value.trim(),
    school: schoolInput.value.trim(),
    grade: gradeInput.value.trim(),
    sendName: sendNameInput.checked,
  });

  const form = el('form', {
    class: 'card card--pad stack',
    'on:submit': (ev) => { ev.preventDefault(); submit(); },
  },
    el('h1', { text: t('studentTitle', lv) }),
    el('div', { class: 'row' },
      levelBadge(lv),
      el('span', { class: 'muted small', text: `${info.grades} · 총 ${levelTotal(lv)}${U(lv)}` }),
      el('span', { class: 'spacer' }),
      el('button', {
        class: 'btn btn--ghost btn--sm',
        type: 'button',
        'on:click': () => call(h && h.onChangeLevel),
        text: t('levelChange', lv),
      })),
    el('p', { class: 'muted small', text: t('studentLead', lv) }),
    el('div', { class: 'stack' },
      el('label', { for: 'f-name', text: '이름 (선택)' }), nameInput),
    el('div', { class: 'stack' },
      el('label', { for: 'f-school', text: '학교 (선택)' }), schoolInput),
    el('div', { class: 'stack' },
      el('label', { for: 'f-grade', text: '학년 (선택)' }), gradeInput),
    el('label', { class: 'row', for: 'f-sendname', style: 'align-items:flex-start;gap:10px;cursor:pointer' },
      sendNameInput,
      el('span', { class: 'small' },
        el('strong', { text: '보고서에 내 이름을 넣어 주세요' }),
        el('span', { class: 'muted', html: '<br>체크하면 보고서를 만들 때 이름과 학교가 AI 서버(업스테이지)로 함께 전송됩니다. 체크하지 않으면 “학생”으로만 보내고 이름은 이 컴퓨터 밖으로 나가지 않아요.' }))),
    alertBox('info', '내 정보는 이렇게 다뤄져요',
      '이름·학교·학년과 모든 답변은 이 브라우저 안에만 저장되고 서버에 남지 않아요. ' +
      '다만 보고서를 만들 때는 검사 결과(점수·유형·순위)가 AI 서버로 전송돼요. 개별 문항에 무엇이라 답했는지는 보내지 않아요. ' +
      '공용 컴퓨터라면 다 쓰고 나서 홈 화면 맨 아래의 "이 컴퓨터의 기록 모두 지우기"를 눌러 주세요.'),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn--primary btn--lg', type: 'submit', text: t('studentSave', lv) }),
      el('button', {
        class: 'btn btn--ghost',
        type: 'button',
        'on:click': () => call(h && h.onGoto, '#/'),
        text: t('home', lv),
      })));

  view.appendChild(form);
  return view;
}

/* ────────────────────────── 검사 안내 ────────────────────────── */

export function renderTestIntro(testKey, state, h) {
  let test;
  try { test = testOf(state, testKey); } catch (_) { return renderNotFound(state, h); }

  const s = state && state.session;
  const lv = levelKeyFrom(state);
  const total = test.questions.length;
  const cnt = answeredCount(s, testKey);
  const done = isDone(s, testKey);
  // 이어할 지점은 "답한 개수+1"이 아니라 "아직 답하지 않은 첫 문항"이다.
  // (중간에 건너뛴 문항이 있으면 두 값이 어긋나 안내 문구가 실제 이동 지점과 달라진다)
  const resumeAt = firstUnanswered(s, testKey);
  const resumeNo = (resumeAt === -1 ? Math.min(cnt, total - 1) : resumeAt) + 1;
  const view = screen('intro');

  view.appendChild(stepper(testKey, state));

  const tips = test.mode === 'ab'
    ? ['두 문장 중 더 나에게 가까운 쪽을 고르면 돼요.', '둘 다 애매하면 "조금이라도 더 그런 쪽"을 고르세요.', '너무 오래 고민하지 말고 첫 느낌대로!']
    : ['평소의 나를 떠올리며 솔직하게 고르세요.', '"이래야 한다"가 아니라 "실제로 나는 이렇다"로 답해요.', '너무 오래 고민하지 말고 첫 느낌대로!'];

  const tipList = el('ul', { class: 'stack' });
  ['정답도 오답도 없어요. 좋고 나쁜 결과도 없어요.', ...tips].forEach((x) => tipList.appendChild(el('li', { text: x })));

  const keyHelp = el('ul', { class: 'small muted' });
  const keys = test.mode === 'ab'
    ? ['숫자키 1 / 2 또는 A / B 로 선택', `← → 화살표로 앞뒤 ${U(lv)} 이동`]
    : [`숫자키 1 ~ ${test.scale ? test.scale.length : 5} 로 선택`, `← → 화살표로 앞뒤 ${U(lv)} 이동`];
  keys.forEach((x) => keyHelp.appendChild(el('li', { text: x })));

  view.appendChild(el('div', { class: 'card card--pad stack', style: { '--card-accent': test.accent } },
    el('div', { class: 'row' },
      el('span', { class: 'q-index', 'aria-hidden': 'true', text: test.emoji }),
      el('h1', { text: test.title }),
      el('span', { class: 'spacer' }),
      levelBadge(lv)),
    el('p', { class: 'hl', text: test.subtitle }),
    el('p', { text: test.intro }),
    el('div', { class: 'grid grid--3' },
      el('div', { class: 'stat' }, el('span', { class: 'stat__k', text: t('countLabel', lv) }), el('span', { class: 'stat__v', text: `${total}${U(lv)}` })),
      el('div', { class: 'stat' }, el('span', { class: 'stat__k', text: t('estLabel', lv) }), el('span', { class: 'stat__v', text: `약 ${test.estMinutes}분` })),
      el('div', { class: 'stat' }, el('span', { class: 'stat__k', text: t('soFar', lv) }), el('span', { class: 'stat__v', text: `${cnt}${U(lv)}` }))),
    cnt > 0 ? progressBar(pctOf(cnt, total), '이 검사 진행률', `${cnt} / ${total}`) : null,
    el('div', { class: 'stack' }, el('h3', { text: t('howToAnswer', lv) }), tipList),
    el('div', { class: 'stack' }, el('h3', { text: t('keyHelp', lv) }), keyHelp),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn btn--primary btn--lg',
        type: 'button',
        'on:click': () => call(h && h.onStartTest, testKey),
        text: cnt > 0 ? (done ? '다시 훑어보기' : `${resumeNo}번 ${U(lv)}부터 ${t('resume', lv)}`) : t('start', lv),
      }),
      done ? el('button', {
        class: 'btn btn--ghost',
        type: 'button',
        'on:click': () => call(h && h.onGoto, `#/result/${testKey}`),
        text: t('seeResult', lv),
      }) : null,
      cnt > 0 ? el('button', {
        class: 'btn btn--ghost btn--sm',
        type: 'button',
        'on:click': () => call(h && h.onRetakeTest, testKey),
        text: t('retake', lv),
      }) : null),
    el('p', { class: 'muted small', text: t('keepGoing', lv) })));

  view.appendChild(el('div', { class: 'row' },
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'on:click': () => call(h && h.onGoto, '#/'), text: t('home', lv) })));

  return view;
}

/* ────────────────────────── 문항 ────────────────────────── */

function likertOptions(test, testKey, index, current, h) {
  const box = el('div', { class: 'opts opts--likert', role: 'group', 'aria-label': '보기' });
  (test.scale || []).forEach((opt, i) => {
    const on = current === opt.value;
    box.appendChild(el('button', {
      class: 'opt' + (on ? ' opt--on' : ''),
      type: 'button',
      'aria-pressed': on ? 'true' : 'false',
      dataset: { value: String(opt.value), index: String(index) },
      'on:click': () => call(h && h.onAnswer, testKey, index, opt.value),
    },
      el('span', { class: 'opt__key', 'aria-hidden': 'true', text: String(i + 1) }),
      el('span', { class: 'opt__label', text: opt.label })));
  });
  return box;
}

function abOptions(q, testKey, index, current, h) {
  const box = el('div', { class: 'opts opts--ab', role: 'group', 'aria-label': '보기' });
  [['a', 'A', q.a], ['b', 'B', q.b]].forEach(([value, tag, label]) => {
    const on = current === value;
    box.appendChild(el('button', {
      class: 'opt' + (on ? ' opt--on' : ''),
      type: 'button',
      'aria-pressed': on ? 'true' : 'false',
      dataset: { value, index: String(index) },
      'on:click': () => call(h && h.onAnswer, testKey, index, value),
    },
      el('span', { class: 'opt__key', 'aria-hidden': 'true', text: tag }),
      el('span', { class: 'opt__label', text: String(label || '') })));
  });
  return box;
}

export function renderQuestion(testKey, state, h) {
  let test;
  try { test = testOf(state, testKey); } catch (_) { return renderNotFound(state, h); }

  const s = state && state.session;
  const lv = levelKeyFrom(state);
  const total = test.questions.length;
  const index = cursorOf(s, testKey);
  const q = test.questions[index];
  if (!q) return renderNotFound(state, h);

  const answers = answersOf(s, testKey);
  const current = answers[index] === undefined ? null : answers[index];
  const cnt = answeredCount(s, testKey);
  const remain = firstUnanswered(s, testKey);
  const isLast = index === total - 1;

  const view = screen('test');
  view.setAttribute('data-test-key', testKey);
  view.setAttribute('data-index', String(index));

  view.appendChild(stepper(testKey, state));
  view.appendChild(progressBar(pctOf(cnt, total), `${test.emoji} ${test.short}`, `${cnt} / ${total}${U(lv)} ${t('answerWord', lv)}`));

  const card = el('div', { class: 'q-card card card--pad stack', style: { '--card-accent': test.accent } },
    el('div', { class: 'row' },
      el('span', { class: 'q-index', text: `${index + 1} / ${total}` }),
      el('span', { class: 'spacer' }),
      current === null || current === undefined
        ? el('span', { class: 'tag', text: t('notPicked', lv) })
        : el('span', { class: 'badge', text: t('answeredTag', lv) })),
    el('p', { class: 'q-text', text: test.mode === 'ab' ? String(q.q || '') : String(q.text || '') }),
    test.mode === 'ab'
      ? abOptions(q, testKey, index, current, h)
      : likertOptions(test, testKey, index, current, h));

  view.appendChild(card);

  // 10문항마다 격려 한 줄
  if (index > 0 && index % 10 === 0) {
    const cheer = CHEERS[(Math.floor(index / 10) - 1) % CHEERS.length];
    view.appendChild(el('p', { class: 'hl center small', text: cheer }));
  }

  const nav = el('div', { class: 'q-nav row' },
    el('button', {
      class: 'btn btn--ghost',
      type: 'button',
      disabled: index === 0 ? true : null,
      'on:click': () => call(h && h.onPrev, testKey),
      text: '← 이전',
    }),
    el('span', { class: 'spacer' }),
    isLast
      ? el('button', {
          class: 'btn btn--primary',
          type: 'button',
          'on:click': () => call(h && h.onFinishTest, testKey),
          text: `${t('seeResult', lv)} →`,
          disabled: remain === -1 ? null : true,
        })
      : el('button', {
          class: 'btn btn--primary',
          type: 'button',
          'on:click': () => call(h && h.onNext, testKey),
          text: '다음 →',
        }));
  view.appendChild(nav);

  if (isLast && remain !== -1) {
    view.appendChild(el('div', { class: 'alert alert--warn' },
      el('strong', { text: `아직 ${total - cnt}${U(lv)}이 남았어요.` }),
      el('p', { class: 'small', text: `빠뜨린 ${U(lv)}에 답해야 결과를 볼 수 있어요.` }),
      el('button', {
        class: 'btn btn--sm',
        type: 'button',
        'on:click': () => call(h && h.onJumpTo, testKey, remain),
        text: `${remain + 1}번 ${U(lv)}으로 가기`,
      })));
  }

  view.appendChild(el('div', { class: 'row no-print' },
    el('button', {
      class: 'btn btn--ghost btn--sm',
      type: 'button',
      'on:click': () => call(h && h.onGoto, '#/'),
      text: t('later', lv),
    }),
    el('span', { class: 'spacer' }),
    el('span', { class: 'muted small', text: '숫자키로 선택, ← → 로 이동' })));

  return view;
}

/* ────────────────────────── 결과: 공통 조각 ────────────────────────── */

function noResult(testKey, state, h, label) {
  const lv = levelKeyFrom(state);
  const view = screen('result');
  view.appendChild(stepper(testKey, state));
  view.appendChild(el('div', { class: 'card card--pad stack' },
    el('div', { class: 'empty', text: label || '아직 결과가 없어요. 검사를 먼저 끝내 주세요.' }),
    el('button', {
      class: 'btn btn--primary',
      type: 'button',
      'on:click': () => call(h && h.onGoto, `#/intro/${testKey}`),
      text: t('goTest', lv),
    })));
  return view;
}

function resultFooter(testKey, state, h) {
  const lv = levelKeyFrom(state);
  const next = nextKeyOf(state, testKey);
  let nextShort = '';
  if (next) {
    try { nextShort = testOf(state, next).short; } catch (_) { nextShort = TEST_SHORT[next] || ''; }
  }
  const row = el('div', { class: 'row no-print' },
    el('button', {
      class: 'btn btn--ghost btn--sm',
      type: 'button',
      'on:click': () => call(h && h.onRetakeTest, testKey),
      text: t('retakeThis', lv),
    }),
    el('span', { class: 'spacer' }),
    next
      ? el('button', {
          class: 'btn btn--primary btn--lg',
          type: 'button',
          'on:click': () => call(h && h.onGoto, `#/intro/${next}`),
          text: `다음 검사로 (${nextShort}) →`,
        })
      : el('button', {
          class: 'btn btn--primary btn--lg',
          type: 'button',
          'on:click': () => call(h && h.onGoto, '#/dashboard'),
          text: `${t('combine', lv)} →`,
        }));
  return row;
}

function discTypeCard(rank, info, score, percent) {
  if (!info) return null;
  const strengths = el('div', { class: 'row' });
  (info.strengths || []).forEach((x) => strengths.appendChild(el('span', { class: 'tag', text: x })));
  return el('div', { class: 'card card--pad stack', style: { '--card-accent': `var(--disc-${info.key})` } },
    el('div', { class: 'row' },
      el('span', { class: 'badge', text: rank }),
      el('strong', { text: info.name }),
      el('span', { class: 'spacer' }),
      el('span', { class: 'chip', text: `${score}점 · ${percent}%` })),
    el('p', { class: 'hl', text: info.title }),
    el('p', { text: info.description }),
    strengths,
    el('p', { class: 'muted small', text: info.style }));
}

/** "유형별 점수 (3~15점)" 처럼 급에 맞는 점수 범위 제목 */
function scoreHeading(state, testKey, label) {
  const range = scoreRange(state, testKey);
  return range ? `${label} (${range.min}~${range.max}점)` : label;
}

/* ────────────────────────── 결과: 검사별 ────────────────────────── */

function renderDiscResult(r, state, h) {
  const view = screen('result');
  const range = scoreRange(state, 'disc');
  view.appendChild(stepper('disc', state));
  view.appendChild(sectionTitle('🧭 DISC 행동유형 결과', '내가 자연스럽게 보이는 행동 스타일이에요.'));

  const items = (r.ranked || DISC_ORDER).map((k) => ({
    label: (r.info && r.info[k] ? r.info[k].name : k),
    value: r.scores[k],
    max: range ? range.max : 0,
    percent: r.percents[k],
    color: `var(--disc-${k})`,
  }));
  view.appendChild(el('div', { class: 'card card--pad stack' },
    el('h3', { text: scoreHeading(state, 'disc', '유형별 점수') }),
    barList(items)));

  view.appendChild(el('div', { class: 'grid grid--2' },
    discTypeCard('1순위', r.primaryInfo, r.scores[r.primary], r.percents[r.primary]),
    discTypeCard('2순위', r.secondaryInfo, r.scores[r.secondary], r.percents[r.secondary])));

  const pName = r.primaryInfo ? r.primaryInfo.name : r.primary;
  const sName = r.secondaryInfo ? r.secondaryInfo.name : r.secondary;
  view.appendChild(el('div', { class: 'card card--pad stack' },
    el('h3', { text: '두 모습이 만나면' }),
    el('p', { text: `평소에는 ${pName}의 모습이 가장 먼저 드러나고, 상황에 따라 ${sName}의 모습이 함께 나와요. 이 두 가지가 섞인 방식이 바로 나만의 행동 스타일이에요.` })));

  view.appendChild(resultFooter('disc', state, h));
  return view;
}

function mbtiAxisRow(a) {
  const leftPct = clamp(Math.round(a.leftPct || 0), 0, 100);
  return el('div', { class: 'stack' },
    el('div', { class: 'row small' },
      el('span', { class: a.pick === a.left ? 'hl' : 'muted', text: `${a.leftName}(${a.left}) ${a.leftScore}` }),
      el('span', { class: 'spacer' }),
      el('span', { class: a.pick === a.right ? 'hl' : 'muted', text: `${a.rightScore} ${a.rightName}(${a.right})` })),
    // .bar 는 3칸 그리드(라벨·막대·점수)라, 라벨 없이 쓰면 막대가 라벨 칸(74px)에 끼인다.
    // 두 칸짜리 .bar--duo 로 그린다.
    el('div', { class: 'bar bar--duo' },
      el('span', { class: 'bar__track' },
        el('span', {
          class: 'bar__fill',
          style: { width: leftPct + '%', background: 'var(--accent-mbti)' },
        })),
      el('span', { class: 'bar__val nowrap', text: `${a.pick} ${Math.round(a.strength || 0)}%` })));
}

function renderMbtiResult(r, state, h) {
  const view = screen('result');
  const lv = levelKeyFrom(state);
  const perAxis = getLevel(lv).perScale;
  const info = r.info || {};
  view.appendChild(stepper('mbti', state));
  view.appendChild(sectionTitle('🧩 MBTI 성격유형 결과', '나에게 더 편안한 쪽을 고른 결과예요.'));

  view.appendChild(el('div', { class: 'card card--pad stack center', style: { '--card-accent': 'var(--accent-mbti)' } },
    el('p', { class: 'stat__k', text: '나의 유형' }),
    el('h1', { text: r.type }),
    info.nickname ? el('p', { class: 'hl', text: info.nickname }) : null,
    info.summary ? el('p', { text: info.summary }) : null));

  const axes = el('div', { class: 'card card--pad stack' },
    el('h3', { text: `4가지 지표 (지표당 ${perAxis}${U(lv)})` }));
  (r.axes || []).forEach((a) => axes.appendChild(mbtiAxisRow(a)));
  view.appendChild(axes);

  const fields = [
    ['나의 슈퍼파워', info.strength],
    ['이렇게 하면 더 성장해요', info.growth],
    ['나에게 맞는 공부법', info.study],
    ['친구들 사이에서 나는', info.friends],
  ];
  const grid = el('div', { class: 'grid grid--2' });
  fields.forEach(([title, body]) => {
    if (!body) return;
    grid.appendChild(el('div', { class: 'card card--pad stack' },
      el('h3', { text: title }),
      el('p', { text: body })));
  });
  view.appendChild(grid);

  view.appendChild(resultFooter('mbti', state, h));
  return view;
}

function miMiniCard(item, kind, types) {
  const info = item.info || (types && types[item.key]) || {};
  return el('div', { class: 'card card--pad stack', style: { '--card-accent': `var(--mi-${item.key})` } },
    el('div', { class: 'row' },
      el('strong', { text: `${item.name}지능` }),
      el('span', { class: 'spacer' }),
      el('span', { class: 'chip', text: `${item.percent}%` })),
    el('p', { class: 'small', text: info.description || '' }),
    kind === 'top'
      ? el('p', { class: 'muted small', text: `관련 과목: ${info.subjects || '-'} / 어울리는 직업: ${info.careers || '-'}` })
      : el('p', { class: 'muted small', text: `이렇게 키워봐요: ${info.activities || '-'}` }));
}

function renderMiResult(r, state, h) {
  const view = screen('result');
  const range = scoreRange(state, 'mi');
  const types = typesOf(state, 'mi');
  view.appendChild(stepper('mi', state));
  view.appendChild(sectionTitle('🌟 다중지능 결과', '8가지 재능 중에서 지금 나에게 빛나는 재능이에요.'));

  view.appendChild(el('div', { class: 'card card--pad stack' },
    el('h3', { text: '나의 재능 지도' }),
    radarSvg({
      labels: MI_ORDER.map((k) => (r.info && r.info[k] ? r.info[k].name : (types[k] ? types[k].name : k))),
      percents: MI_ORDER.map((k) => r.percents[k]),
      color: 'var(--accent-mi)',
      size: 320,
    })));

  const items = (r.ranked || MI_ORDER).map((k) => ({
    label: (r.info && r.info[k] ? r.info[k].name : k),
    value: r.scores[k],
    max: range ? range.max : 0,
    percent: r.percents[k],
    color: `var(--mi-${k})`,
  }));
  view.appendChild(el('div', { class: 'card card--pad stack' },
    el('h3', { text: scoreHeading(state, 'mi', '지능별 점수') }),
    barList(items)));

  const top = el('div', { class: 'stack' },
    sectionTitle('빛나는 재능 TOP 3', '가장 편하게, 즐겁게 쓸 수 있는 능력이에요.'),
    el('div', { class: 'grid grid--3' }, ...(r.top3 || []).map((x) => miMiniCard(x, 'top', types))));
  view.appendChild(top);

  if (r.combo) {
    view.appendChild(el('div', { class: 'card card--pad stack', style: { '--card-accent': 'var(--accent-mi)' } },
      el('span', { class: 'badge', text: '강점 조합' }),
      el('h3', { text: r.combo.title || '' }),
      el('p', { html: r.combo.text || '' })));
  }

  const bottom = el('div', { class: 'stack' },
    sectionTitle('성장의 기회가 될 재능 3가지', '못하는 게 아니라, 아직 덜 써본 능력이에요. 조금씩 연습하면 자라나요.'),
    el('div', { class: 'grid grid--3' }, ...(r.bottom3 || []).map((x) => miMiniCard(x, 'bottom', types))));
  view.appendChild(bottom);

  view.appendChild(resultFooter('mi', state, h));
  return view;
}

function riasecTypeCard(rank, info, score, percent) {
  if (!info) return null;
  return el('div', { class: 'card card--pad stack', style: { '--card-accent': `var(--riasec-${info.key})` } },
    el('div', { class: 'row' },
      el('span', { class: 'badge', text: rank }),
      el('strong', { text: info.title }),
      el('span', { class: 'spacer' }),
      el('span', { class: 'chip', text: `${score}점 · ${percent}%` })),
    el('p', { text: info.text }));
}

function renderRiasecResult(r, state, h) {
  const view = screen('result');
  const range = scoreRange(state, 'riasec');
  const types = typesOf(state, 'riasec');
  view.appendChild(stepper('riasec', state));
  view.appendChild(sectionTitle('🎯 RIASEC 직업흥미 결과', '마음이 움직이는 활동을 모아 본 결과예요.'));

  const codeChips = el('div', { class: 'row center' });
  String(r.code || '').split('').forEach((k) => {
    const info = (r.info && r.info[k]) || types[k] || {};
    codeChips.appendChild(el('span', {
      class: 'chip',
      style: { '--chip-accent': `var(--riasec-${k})` },
      text: `${k} ${info.name || ''}`,
    }));
  });
  view.appendChild(el('div', { class: 'card card--pad stack center', style: { '--card-accent': 'var(--accent-riasec)' } },
    el('p', { class: 'stat__k', text: '나의 홀랜드 코드' }),
    el('h1', { text: r.code || '' }),
    codeChips,
    el('p', { class: 'muted small', text: '흥미가 높은 순서대로 세 글자를 이어 붙인 코드예요. 직업 정보를 찾을 때 이 코드로 검색하면 도움이 돼요.' })));

  view.appendChild(el('div', { class: 'card card--pad stack' },
    el('h3', { text: '흥미 분포' }),
    radarSvg({
      labels: RIASEC_ORDER.map((k) => {
        const info = (r.info && r.info[k]) || types[k] || {};
        return `${k} ${info.name || ''}`;
      }),
      percents: RIASEC_ORDER.map((k) => r.percents[k]),
      color: 'var(--accent-riasec)',
      size: 320,
    })));

  const items = (r.ranked || RIASEC_ORDER).map((k) => {
    const info = (r.info && r.info[k]) || types[k] || {};
    return {
      label: `${k} ${info.name || ''}`,
      value: r.scores[k],
      max: range ? range.max : 0,
      percent: r.percents[k],
      color: `var(--riasec-${k})`,
    };
  });
  view.appendChild(el('div', { class: 'card card--pad stack' },
    el('h3', { text: scoreHeading(state, 'riasec', '유형별 점수') }),
    barList(items)));

  view.appendChild(el('div', { class: 'grid grid--2' },
    riasecTypeCard('1순위', r.primaryInfo, r.scores[r.primary], r.percents[r.primary]),
    riasecTypeCard('2순위', r.secondaryInfo, r.scores[r.secondary], r.percents[r.secondary])));

  if (r.tertiaryInfo) {
    view.appendChild(el('div', { class: 'card card--pad stack' },
      el('div', { class: 'row' },
        el('span', { class: 'badge', text: '3순위' }),
        el('strong', { text: r.tertiaryInfo.title })),
      el('p', { class: 'small', text: r.tertiaryInfo.text })));
  }

  view.appendChild(resultFooter('riasec', state, h));
  return view;
}

export function renderTestResult(testKey, state, h) {
  const r = state && state.results ? state.results[testKey] : null;
  if (!r) return noResult(testKey, state, h);
  try {
    if (testKey === 'disc') return renderDiscResult(r, state, h);
    if (testKey === 'mbti') return renderMbtiResult(r, state, h);
    if (testKey === 'mi') return renderMiResult(r, state, h);
    if (testKey === 'riasec') return renderRiasecResult(r, state, h);
  } catch (_) {
    return noResult(testKey, state, h, '결과를 그리는 중에 문제가 생겼어요. 검사를 다시 해보면 해결될 수 있어요.');
  }
  return renderNotFound(state, h);
}

/* ────────────────────────── 대시보드 ────────────────────────── */

function summaryLine(testKey, results) {
  const r = results ? results[testKey] : null;
  if (!r) return null;
  if (testKey === 'disc') {
    const p = r.primaryInfo || {};
    return `${p.name || r.primary} · ${p.title || ''}`;
  }
  if (testKey === 'mbti') {
    const i = r.info || {};
    return `${r.type} · ${i.nickname || ''}`;
  }
  if (testKey === 'mi') {
    const names = (r.top3 || []).map((x) => `${x.name}`).join(' · ');
    return names ? `강점 재능: ${names}` : '';
  }
  if (testKey === 'riasec') {
    const p = r.primaryInfo || {};
    return `${r.code} · ${p.name || ''}(${p.nickname || ''})`;
  }
  return '';
}

export function renderDashboard(state, h) {
  const s = state && state.session;
  const lv = levelKeyFrom(state);
  const info = getLevel(lv);
  const results = (state && state.results) || {};
  const prog = overall(s);
  const allDone = testKeysOf(state).every((k) => isDone(s, k) && results[k]);
  const generating = !!(state && state.ui && state.ui.generating);
  const hasReport = !!(s && s.report && s.report.markdown);

  const view = screen('dashboard');
  view.appendChild(el('div', { class: 'stack' },
    el('h1', { text: `${displayName(s)}님의 검사 결과 요약` }),
    el('div', { class: 'row' },
      levelBadge(lv),
      el('span', { class: 'muted small', text: `${info.grades} · ${info.stage}` })),
    el('p', { class: 'muted small', text: '4가지 검사 결과를 한눈에 모아봤어요.' }),
    progressBar(prog.percent, '전체 진행률', `${prog.done} / ${prog.total}${U(lv)}`)));

  const grid = el('div', { class: 'grid grid--2' });
  testsOf(state).forEach((test) => {
    const done = isDone(s, test.key) && !!results[test.key];
    const line = summaryLine(test.key, results);
    grid.appendChild(el('div', { class: 'card card--pad stack', style: { '--card-accent': test.accent } },
      el('div', { class: 'row' },
        el('span', { class: 'q-index', 'aria-hidden': 'true', text: test.emoji }),
        el('strong', { text: test.short }),
        el('span', { class: 'spacer' }),
        el('span', { class: 'badge', text: done ? '완료' : '미완료' })),
      done
        ? el('p', { class: 'hl', text: line || '' })
        : el('p', { class: 'muted small', text: `${answeredCount(s, test.key)} / ${test.questions.length}${U(lv)} ${t('answerWord', lv)}. 아직 끝나지 않았어요.` }),
      el('div', { class: 'row' },
        done
          ? el('button', {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              'on:click': () => call(h && h.onGoto, `#/result/${test.key}`),
              text: t('seeDetail', lv),
            })
          : el('button', {
              class: 'btn btn--primary btn--sm',
              type: 'button',
              'on:click': () => call(h && h.onGoto, `#/intro/${test.key}`),
              text: t('resume', lv),
            }),
        el('span', { class: 'spacer' }),
        el('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          'on:click': () => call(h && h.onRetakeTest, test.key),
          text: '다시하기',
        }))));
  });
  view.appendChild(grid);

  const cta = el('div', { class: 'card card--pad stack center' },
    el('h2', { text: 'AI 종합 진로보고서' }),
    el('p', { text: `4가지 결과를 하나로 엮어, ${info.label} 수준에 맞는 나만의 강점과 진로 방향을 정리해 드려요.` }),
    allDone
      ? el('button', {
          class: 'btn btn--primary btn--lg btn--block',
          type: 'button',
          disabled: generating ? true : null,
          'on:click': () => call(h && h.onGenerateReport),
          text: generating ? '보고서를 만들고 있어요…' : '✨ AI 종합 진로보고서 만들기',
        })
      : el('div', { class: 'stack' },
          alertBox('warn', '아직 끝나지 않은 검사가 있어요',
            '4가지 검사를 모두 마치면 종합 보고서를 만들 수 있어요.'),
          el('button', {
            class: 'btn btn--primary btn--lg btn--block',
            type: 'button',
            'on:click': () => call(h && h.onResume),
            text: t('resumeRest', lv),
          })),
    el('p', { class: 'muted small', text: '보고서를 만드는 데 보통 1~2분쯤 걸려요. 만드는 동안 창을 닫지 말고 기다려 주세요.' }),
    hasReport ? el('button', {
      class: 'btn btn--ghost',
      type: 'button',
      'on:click': () => call(h && h.onGoto, '#/report'),
      text: '전에 만든 보고서 보기',
    }) : null);
  view.appendChild(cta);

  view.appendChild(el('div', { class: 'row no-print' },
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'on:click': () => call(h && h.onGoto, '#/'), text: t('home', lv) }),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'on:click': () => call(h && h.onExport, 'json'), text: '결과 파일로 저장' }),
    el('button', { class: 'btn btn--danger btn--sm', type: 'button', 'on:click': () => call(h && h.onReset), text: t('retake', lv) })));

  return view;
}

/* ────────────────────────── 보고서 ────────────────────────── */

function reportActions(state, h) {
  const s = state && state.session;
  const md = s && s.report ? s.report.markdown : '';
  const fire = (kind, fallback) => () => {
    if (h && typeof h.onExport === 'function') call(h.onExport, kind);
    else if (typeof fallback === 'function') fallback();
  };
  return el('div', { class: 'report-actions no-print' },
    el('button', {
      class: 'btn', type: 'button', text: '🖨 인쇄 / PDF 저장',
      'on:click': fire('print', () => window.print()),
    }),
    el('button', {
      class: 'btn', type: 'button', text: '📄 워드로 저장',
      'on:click': fire('docx'),
    }),
    el('button', {
      class: 'btn', type: 'button', text: '📋 텍스트 복사',
      'on:click': fire('text', () => {
        if (navigator.clipboard && md) {
          navigator.clipboard.writeText(md)
            .then(() => toast('보고서를 복사했어요.', 'ok'))
            .catch(() => toast('복사하지 못했어요. 직접 선택해서 복사해 주세요.', 'warn'));
        } else {
          toast('복사하지 못했어요. 직접 선택해서 복사해 주세요.', 'warn');
        }
      }),
    }),
    el('button', {
      class: 'btn', type: 'button', text: '💾 결과 파일로 저장',
      'on:click': fire('json'),
    }),
    el('button', {
      class: 'btn btn--ghost', type: 'button', text: '🔄 다시 생성',
      'on:click': () => call(h && h.onRegenerate),
    }));
}

export function renderReportScreen(state, h) {
  const s = state && state.session;
  const lv = levelKeyFrom(state);
  const info = getLevel(lv);
  const ui = (state && state.ui) || {};
  const report = s && s.report ? s.report : null;
  const view = screen('report');

  if (ui.generating) {
    const tips = el('ul', { class: 'small muted' });
    REPORT_TIPS.forEach((x) => tips.appendChild(el('li', { text: x })));

    const stream = el('pre', {
      class: 'report-meta small',
      id: 'stream-preview',
      'aria-live': 'polite',
      text: ui.streamText || '',
    });

    const written = String(ui.fullText || '').length;

    view.appendChild(el('div', { class: 'card card--pad stack' },
      spinner('보고서를 쓰고 있어요…'),
      el('p', { class: 'center', text: `${displayName(s)}님의 검사 결과 4가지를 ${info.label} 수준에 맞춰 하나로 엮는 중이에요.` }),
      elapsedLine(ui.startedAt),
      ui.engine ? el('p', { class: 'center muted small', text: ui.engine === 'fallback' ? '기본 보고서로 만들고 있어요.' : 'AI가 직접 쓰고 있어요.' }) : null,
      el('div', { class: 'stack' }, el('h3', { text: '기다리는 동안 알아두면 좋아요' }), tips),
      el('div', { class: 'stack' },
        el('div', { class: 'row' },
          el('h3', { text: '지금까지 쓴 내용' }),
          el('span', { class: 'spacer' }),
          el('span', { class: 'badge', id: 'stream-count', text: written > 0 ? `${written}자` : '준비 중' })),
        stream),
      el('div', { class: 'row center' },
        el('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          'on:click': () => call(h && h.onCancelReport),
          text: '만들기 멈추기',
        }))));
    return view;
  }

  if (!report || !report.markdown) {
    view.appendChild(el('div', { class: 'card card--pad stack' },
      el('div', { class: 'empty', text: '아직 만들어진 보고서가 없어요.' }),
      el('div', { class: 'row' },
        el('button', {
          class: 'btn btn--primary', type: 'button',
          'on:click': () => call(h && h.onGoto, '#/dashboard'),
          text: '결과 요약으로 가기',
        }),
        el('button', {
          class: 'btn btn--ghost', type: 'button',
          'on:click': () => call(h && h.onGenerateReport),
          text: '지금 보고서 만들기',
        }))));
    return view;
  }

  if (report.engine === 'fallback') {
    view.appendChild(alertBox('warn', 'AI 연결이 잠시 어려워 기본 보고서로 만들었어요',
      '검사 결과는 모두 정확하게 담겨 있어요. 인터넷 상태가 좋아진 뒤 "다시 생성"을 누르면 AI가 쓴 보고서를 받아볼 수 있어요.'));
  }

  view.appendChild(el('div', { class: 'report-meta small muted' },
    el('span', { text: `${displayName(s)}님의 진로 잠재력 종합 보고서` }),
    el('span', { text: ' · ' }),
    el('span', { text: `${info.emoji} ${info.label}` }),
    el('span', { text: ' · ' }),
    el('span', { text: formatDate(report.generatedAt) }),
    report.model ? el('span', { text: ` · ${report.model}` }) : null));

  view.appendChild(reportActions(state, h));

  // 본문 마크다운 렌더링은 report.js 담당. 여기서는 빈 컨테이너만 만든다.
  view.appendChild(el('article', { class: 'report', id: 'report-body' }));

  view.appendChild(reportActions(state, h));

  view.appendChild(el('div', { class: 'row no-print' },
    el('button', {
      class: 'btn btn--ghost btn--sm', type: 'button',
      'on:click': () => call(h && h.onGoto, '#/dashboard'),
      text: '← 결과 요약으로',
    }),
    el('span', { class: 'spacer' }),
    el('button', {
      class: 'btn btn--ghost btn--sm', type: 'button',
      'on:click': () => call(h && h.onGoto, '#/'),
      text: t('home', lv),
    })));

  return view;
}

/* ────────────────────────── 404 ────────────────────────── */

export function renderNotFound(state, h) {
  const view = screen('notfound');
  view.appendChild(el('div', { class: 'card card--pad stack center' },
    el('h1', { text: '길을 잃었어요' }),
    el('p', { class: 'muted', text: '찾으시는 화면이 없어요. 홈에서 다시 시작해 주세요.' }),
    el('button', {
      class: 'btn btn--primary', type: 'button',
      'on:click': () => call(h && h.onGoto, '#/'),
      text: '홈으로 가기',
    })));
  return view;
}
