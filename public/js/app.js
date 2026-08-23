// 앱 컨트롤러 — 해시 라우팅, 학교급(초·중·고) 선택, 세션 상태 관리, 답변 저장, 키보드 조작, 보고서 생성을 총괄합니다.
// 화면 그리기는 ui.js·report.js 가 맡고, 이 파일은 "무엇을 언제 그릴지"와 "상태를 어떻게 바꿀지"만 정합니다.
// 학교급이 정해져야 문항 세트가 정해지므로, 급이 없으면 어떤 검사 화면에서도 #/level 로 되돌립니다.

import { getTests, getTest, totalQuestions } from './tests.js';
import { DEFAULT_LEVEL, getLevel, isValidLevel } from './data/levels.js';
import { scoreAll } from './scoring.js';
import {
  newSession,
  loadSession,
  saveSession,
  clearSession,
  clearAll,
  listArchive,
  archiveSession,
  removeArchived,
  exportSessionFile,
  importSessionFile,
} from './storage.js';
import {
  renderHome,
  renderLevelPicker,
  renderStudentForm,
  renderTestIntro,
  renderQuestion,
  renderTestResult,
  renderDashboard,
  renderReportScreen,
  renderNotFound,
  toast,
  t,
} from './ui.js';
import {
  renderMarkdown,
  requestReport,
  printReport,
  copyReport,
  downloadWord,
  downloadMarkdown,
} from './report.js';

/* ─────────────────────────── 상태 ─────────────────────────── */

// 앱 전체가 공유하는 단 하나의 상태. 이 값이 바뀌면 저장하고 다시 그린다.
const state = {
  session: null,
  results: { disc: null, mbti: null, mi: null, riasec: null },
  archive: [],
  route: { name: 'home', key: null },
  ui: {
    generating: false,
    streamText: '', // 화면에 보여줄 꼬리 부분
    fullText: '', // 지금까지 받은 전체 본문
    engine: '',
    model: '',
    abort: null,
  },
};

const STREAM_TAIL = 700; // 생성 중 미리보기에 보여줄 글자 수(레이아웃이 계속 늘어나지 않게)
const APP_TITLE = '진로 잠재력 내비게이터';
const ROUTE_TITLE = {
  home: '',
  level: '학교급 고르기',
  student: '나를 소개하기',
  intro: '검사 안내',
  test: '검사 진행 중',
  result: '검사 결과',
  dashboard: '결과 요약',
  report: '종합 보고서',
  notfound: '화면을 찾을 수 없어요',
};

// tests.js 를 읽지 못하는 최악의 경우에도 라우팅은 살아 있어야 한다.
const FALLBACK_KEYS = ['disc', 'mbti', 'mi', 'riasec'];

let mount = null; // <main id="app">
let badge = null; // 헤더 진행률 배지
let levelBadge = null; // 헤더 학교급 배지
let firstRoute = true; // 첫 진입(딥링크) 여부 — 순서 안내는 이때만 한다
let storageWarned = false;
let lastErrorToastAt = 0;

/* ─────────────────────────── 학교급 도우미 ─────────────────────────── */

/** 세션에 저장된 학교급 키 (없으면 null) */
function levelOf(session) {
  const k = session && session.level;
  return isValidLevel(k) ? k : null;
}

/** 지금 세션의 학교급 (아직 안 골랐으면 null) */
function currentLevel() {
  return levelOf(state.session);
}

/** 화면을 그릴 때 쓸 학교급 — 안 골랐으면 기본 급으로 대신한다. */
function activeLevel() {
  return currentLevel() || DEFAULT_LEVEL;
}

/** 해당 급의 검사 키 목록 */
function keysOf(level) {
  try {
    const list = getTests(level);
    if (Array.isArray(list) && list.length) return list.map((t) => t.key);
  } catch (_) { /* 아래 기본값을 쓴다 */ }
  return FALLBACK_KEYS;
}

/** 해당 급·검사의 문항 수 */
function questionCount(level, key) {
  try {
    return getTest(level, key).questions.length;
  } catch (_) {
    return 0;
  }
}

/** 해당 급의 전체 문항 수 */
function totalOfLevel(level) {
  try {
    const n = totalQuestions(level);
    if (Number.isFinite(n) && n > 0) return n;
  } catch (_) { /* levels.js 의 값으로 대신한다 */ }
  return getLevel(level).total;
}

/** 지금 급에서 쓰는 '문항' 또는 '질문' (초등은 쉬운 말) */
const unit = (level) => t('question', level || activeLevel());

const testKeys = () => keysOf(activeLevel());
const totalOf = (key) => questionCount(activeLevel(), key);
const testOf = (key) => getTest(activeLevel(), key);

/* ─────────────────────────── 작은 도우미 ─────────────────────────── */

/** 자식 노드를 통째로 갈아 끼운다 (replaceChildren 미지원 브라우저 대비) */
function replaceKids(host, nodes) {
  if (!host) return;
  while (host.firstChild) host.removeChild(host.firstChild);
  for (const n of nodes) if (n) host.appendChild(n);
}

/**
 * storage.js 는 세션을 {session, mismatch} 로 감싸서 돌려준다.
 * (mismatch = 저장된 답 길이가 지금 문항 수와 달라 억지로 맞춘 상태)
 * 혹시 세션 객체가 그대로 넘어와도 받아들인다.
 */
function unwrapSession(loaded) {
  if (!loaded || typeof loaded !== 'object') return { session: null, mismatch: false };
  if (loaded.session && typeof loaded.session === 'object') {
    return { session: loaded.session, mismatch: loaded.mismatch === true };
  }
  if (loaded.answers && typeof loaded.answers === 'object') return { session: loaded, mismatch: false };
  return { session: null, mismatch: false };
}

/** 배열에서 실제로 답한 칸 수 */
function countFilled(arr) {
  if (!Array.isArray(arr)) return 0;
  let n = 0;
  for (const v of arr) if (v !== null && v !== undefined && v !== '') n += 1;
  return n;
}

/** 해당 검사의 답안 배열 */
function answersOf(key) {
  const a = state.session && state.session.answers ? state.session.answers[key] : null;
  return Array.isArray(a) ? a : [];
}

/** 해당 검사에서 답한 문항 수 */
function answeredOf(key) {
  return countFilled(answersOf(key));
}

/** 이 급의 문항 수만큼 빠짐없이 답했는지 */
function isFilled(key, answers) {
  const total = totalOf(key);
  if (total <= 0 || !Array.isArray(answers)) return false;
  for (let i = 0; i < total; i += 1) {
    const v = answers[i];
    if (v === null || v === undefined || v === '') return false;
  }
  return true;
}

/** 해당 검사를 끝냈는지 */
function isTestDone(key) {
  if (!state.session) return false;
  if (state.session.done && state.session.done[key]) return true;
  return isFilled(key, answersOf(key));
}

/** 네 검사를 모두 끝냈는지(채점 결과와 무관하게 응답 기준) */
function isSessionComplete() {
  if (!state.session) return false;
  return testKeys().every((k) => isTestDone(k));
}

/** 아직 끝내지 않은 첫 검사 키 (없으면 null) */
function firstUnfinishedKey() {
  return testKeys().find((k) => !isTestDone(k)) || null;
}

/** 해당 검사에서 아직 답하지 않은 첫 문항 번호 (없으면 -1) */
function firstUnansweredIndex(key) {
  const arr = answersOf(key);
  const total = totalOf(key);
  for (let i = 0; i < total; i += 1) {
    const v = arr[i];
    if (v === null || v === undefined || v === '') return i;
  }
  return -1;
}

/** 네 검사를 모두 끝냈고 채점까지 되는지 */
function allDone() {
  return testKeys().every((k) => isTestDone(k) && state.results[k]);
}

/** 세션 하나의 진행률 — 그 세션에 저장된 급을 기준으로 센다. */
function progressOfSession(session) {
  const lv = levelOf(session) || DEFAULT_LEVEL;
  let answered = 0;
  for (const key of keysOf(lv)) {
    const cap = questionCount(lv, key);
    const got = countFilled(session && session.answers ? session.answers[key] : null);
    answered += cap > 0 ? Math.min(got, cap) : got;
  }
  const total = totalOfLevel(lv);
  return { answered, total, percent: total > 0 ? Math.round((answered / total) * 100) : 0 };
}

/** 전체 진행 문항 수 */
function overallProgress() {
  if (!state.session) return { answered: 0, total: totalOfLevel(activeLevel()), percent: 0 };
  return progressOfSession(state.session);
}

/** 지금 세션을 급에 맞게 채점한다. */
function rescore() {
  const answers = state.session ? state.session.answers : null;
  try {
    state.results = scoreAll(answers, activeLevel()) || { disc: null, mbti: null, mi: null, riasec: null };
  } catch (e) {
    console.error('[app] 채점에 실패했습니다.', e);
    state.results = { disc: null, mbti: null, mi: null, riasec: null };
  }
}

/** 세션 저장. 저장이 막힌 환경이면 한 번만 안내한다. */
function persist() {
  if (!state.session) return;
  const ok = saveSession(state.session);
  if (!ok && !storageWarned) {
    storageWarned = true;
    toast('이 브라우저에 저장할 수 없어 답이 임시로만 보관돼요. 창을 닫기 전에 결과를 파일로 저장해 주세요.', 'warn');
  }
}

/** 보관함 목록을 다시 읽어 화면용 요약값을 붙인다. */
function refreshArchive() {
  try {
    state.archive = listArchive().map((s) => {
      const p = progressOfSession(s);
      return Object.assign({}, s, { answered: p.answered, percent: p.percent });
    });
  } catch (_) {
    state.archive = [];
  }
}

/** 진행 중인 세션을 보관함에 넣는다(답이 하나라도 있을 때만). */
function stashCurrent() {
  if (!state.session) return;
  if (overallProgress().answered <= 0) return;
  archiveSession(state.session);
  refreshArchive();
}

/* ─────────────────────────── 라우팅 ─────────────────────────── */

/**
 * '#/...' 형태가 아닌 해시는 라우트가 아니라 본문 이동용 앵커다.
 * (index.html 의 스킵 링크 #app, 보고서 목차의 #rp-sec-1 등)
 */
function isAnchorHash() {
  const raw = String(window.location.hash || '');
  return raw.length > 1 && raw.charAt(1) !== '/';
}

/** 현재 주소창의 해시를 {name, key} 로 해석한다. */
function parseRoute() {
  const raw = String(window.location.hash || '');
  // 앵커 해시는 지금 화면을 그대로 유지한다(404 로 튕기지 않게).
  if (isAnchorHash()) return { name: state.route.name, key: state.route.key };
  const path = raw.replace(/^#/, '');
  let parts;
  try {
    parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch (_) {
    parts = path.split('/').filter(Boolean);
  }
  if (!parts.length) return { name: 'home', key: null };

  const head = parts[0];
  const key = parts[1] || null;

  if (head === 'level' && parts.length === 1) return { name: 'level', key: null };
  if (head === 'student' && parts.length === 1) return { name: 'student', key: null };
  if (head === 'dashboard' && parts.length === 1) return { name: 'dashboard', key: null };
  if (head === 'report' && parts.length === 1) return { name: 'report', key: null };
  if (head === 'intro' || head === 'test' || head === 'result') {
    if (!key || !FALLBACK_KEYS.includes(key) || parts.length > 2) return { name: 'notfound', key: null };
    return { name: head, key };
  }
  return { name: 'notfound', key: null };
}

/**
 * 진행 조건 검사. 지금 이 화면을 보여줘도 되는지 판단하고,
 * 안 되면 {hash, msg} 로 어디로 보낼지 알려준다.
 */
function guardRoute(route) {
  const needsLevel = ['student', 'intro', 'test', 'result', 'dashboard', 'report'];
  const needsSession = ['intro', 'test', 'result', 'dashboard', 'report'];

  // 학교급이 문항 세트를 정한다. 급이 없으면 어떤 검사 화면도 열 수 없다.
  if (needsLevel.includes(route.name) && !currentLevel()) {
    return { hash: '#/level', msg: '먼저 어느 학교에 다니는지 골라 주세요. 그 수준에 맞는 문항으로 준비할게요.' }; // 급을 모르는 시점이라 기본 어휘를 쓴다
  }

  if (needsSession.includes(route.name) && !state.session) {
    return { hash: '#/student', msg: '먼저 간단한 정보를 입력하면 이어서 검사할 수 있어요.' };
  }

  // 딥링크로 뒤 검사에 바로 들어온 경우에만 앞 검사를 먼저 안내한다.
  if (firstRoute && (route.name === 'intro' || route.name === 'test') && route.key) {
    const keys = testKeys();
    const order = keys.indexOf(route.key);
    const blocked = keys.slice(0, order).find((k) => !isTestDone(k));
    if (blocked && answeredOf(route.key) === 0) {
      let short = blocked;
      try { short = testOf(blocked).short; } catch (_) { /* 키 그대로 쓴다 */ }
      return {
        hash: `#/intro/${blocked}`,
        msg: `${short} 검사를 먼저 마치는 게 좋아요. 그 검사로 안내할게요.`,
      };
    }
  }

  if (route.name === 'result' && !state.results[route.key]) {
    return {
      hash: `#/intro/${route.key}`,
      msg: '검사를 끝까지 마쳐야 결과를 볼 수 있어요.',
    };
  }

  if (route.name === 'report' && !state.ui.generating) {
    const hasReport = !!(state.session && state.session.report && state.session.report.markdown);
    if (!hasReport && !allDone()) {
      return { hash: '#/dashboard', msg: '네 가지 검사를 모두 마치면 종합 보고서를 만들 수 있어요.' };
    }
  }

  return null;
}

/** 해시를 바꾼다. 같은 주소면 그냥 다시 그린다. */
function goto(hash) {
  const target = String(hash || '#/');
  if (window.location.hash === target) {
    handleRoute();
    return;
  }
  window.location.hash = target;
}

/** 해시가 바뀌었을 때(그리고 최초 로드 때) 실행되는 진입점 */
function handleRoute() {
  // 본문 앵커(#app 등)로 이동한 경우엔 다시 그리지 않는다.
  // 브라우저의 기본 스크롤·포커스 이동만 살리고 현재 화면을 유지한다.
  if (isAnchorHash() && !firstRoute) return;

  rescore();

  const route = parseRoute();
  const block = guardRoute(route);
  if (block) {
    firstRoute = false;
    if (block.msg) toast(block.msg, 'warn');
    if (window.location.hash === block.hash) {
      // 이미 그 주소라면 무한 이동을 막고 그대로 그린다.
      state.route = parseRoute();
      render(true);
      return;
    }
    window.location.replace(`${window.location.pathname}${window.location.search}${block.hash}`);
    return;
  }

  const changed = route.name !== state.route.name || route.key !== state.route.key;
  state.route = route;
  firstRoute = false;
  render(changed);
}

/* ─────────────────────────── 렌더링 ─────────────────────────── */

/** 현재 라우트에 맞는 화면 노드를 만든다. */
function viewFor(handlers) {
  const r = state.route;
  switch (r.name) {
    case 'home':
      refreshArchive();
      return renderHome(state, handlers);
    case 'level':
      return renderLevelPicker(state, handlers);
    case 'student':
      return renderStudentForm(state, handlers);
    case 'intro':
      return renderTestIntro(r.key, state, handlers);
    case 'test':
      return renderQuestion(r.key, state, handlers);
    case 'result':
      return renderTestResult(r.key, state, handlers);
    case 'dashboard':
      return renderDashboard(state, handlers);
    case 'report':
      return renderReportScreen(state, handlers);
    default:
      return renderNotFound(state, handlers);
  }
}

/** 헤더의 학교급 배지와 전체 진행률 배지를 갱신한다. */
function updateHeader() {
  const lv = currentLevel();
  if (levelBadge) {
    if (lv) {
      const info = getLevel(lv);
      levelBadge.hidden = false;
      levelBadge.textContent = `${info.emoji} ${info.label}`;
      levelBadge.title = `${info.label} · ${info.grades} · 총 ${totalOfLevel(lv)}${unit(lv)}`;
    } else {
      levelBadge.hidden = true;
      levelBadge.textContent = '';
    }
  }

  if (!badge) return;
  const p = overallProgress();
  if (!state.session || p.answered <= 0) {
    badge.hidden = true;
    badge.textContent = '';
    return;
  }
  badge.hidden = false;
  badge.textContent = `전체 ${p.percent}% · ${p.answered}/${p.total}${unit()}`;
}

/** 보고서 본문(마크다운)을 #report-body 안에 그린다. */
function paintReportBody() {
  if (state.route.name !== 'report') return;
  const host = document.getElementById('report-body');
  if (!host) return;
  const md = state.session && state.session.report ? state.session.report.markdown : '';
  if (!md) return;
  try {
    const doc = renderMarkdown(md);
    replaceKids(host, Array.from(doc.childNodes));
  } catch (e) {
    console.error('[app] 보고서 렌더링 실패', e);
    replaceKids(host, []);
    toast('보고서를 그리는 중에 문제가 생겼어요. 텍스트 복사나 워드 저장은 그대로 쓸 수 있어요.', 'warn');
  }
}

/**
 * 화면을 다시 그린다.
 * @param {boolean} moved 라우트가 바뀐 경우 true — 이때만 맨 위로 올리고 포커스를 옮긴다.
 */
function render(moved) {
  if (!mount) return;
  rescore();

  let view;
  try {
    view = viewFor(handlers);
  } catch (e) {
    console.error('[app] 화면을 그리지 못했습니다.', e);
    view = renderNotFound(state, handlers);
    toast('화면을 여는 중에 문제가 생겼어요. 홈에서 다시 시작해 주세요.', 'err');
  }

  replaceKids(mount, [view]);
  updateHeader();
  paintReportBody();
  const sub = ROUTE_TITLE[state.route.name];
  document.title = sub ? `${sub} · ${APP_TITLE}` : APP_TITLE;

  if (moved) {
    try {
      window.scrollTo(0, 0);
      mount.focus({ preventScroll: true });
    } catch (_) {
      window.scrollTo(0, 0);
    }
  }
}

/* ─────────────────────────── 학교급 선택 ─────────────────────────── */

/** 홈·학생정보 화면의 "학교급 바꾸기" — 고르는 화면으로 보낸다. */
function onChangeLevel() {
  goto('#/level');
}

/**
 * 학교급을 고른다.
 * 급이 바뀌면 문항 세트 자체가 달라지므로 세션을 새로 만든다(답변 초기화).
 * 이미 다 끝낸 검사였다면 지우기 전에 보관함에 남긴다.
 */
function onPickLevel(levelKey) {
  if (!isValidLevel(levelKey)) {
    toast('그 학교급은 없어요. 다시 골라 주세요.', 'warn');
    return;
  }

  const cur = currentLevel();
  if (cur === levelKey) {
    toast('학교급은 그대로 두었어요.', 'ok');
    goto('#/');
    return;
  }

  const started = overallProgress().answered > 0;
  if (cur && started) {
    const ok = window.confirm(
      `학교급을 ${getLevel(cur).label}에서 ${getLevel(levelKey).label}으로 바꿀까요?\n`
      + `${unit(levelKey)}이 새로 바뀌기 때문에 지금까지 답한 내용은 모두 지워지고 처음부터 다시 하게 돼요.`,
    );
    if (!ok) return;
  }

  // 다 끝낸 검사라면 지우기 전에 보관함에 남겨 둔다.
  if (state.session && isSessionComplete()) archiveSession(state.session);

  const student = (state.session && state.session.student) || {};
  state.session = newSession(student, levelKey);
  persist();
  refreshArchive();
  rescore();

  const info = getLevel(levelKey);
  if (cur) {
    toast(`${info.label} ${unit(levelKey)}으로 새로 준비했어요. 총 ${totalOfLevel(levelKey)}${unit(levelKey)}이에요.`, 'ok');
    goto('#/');
    return;
  }
  toast(`${info.label} ${unit(levelKey)}으로 준비했어요. 총 ${totalOfLevel(levelKey)}${unit(levelKey)}이에요.`, 'ok');
  goto('#/student');
}

/* ─────────────────────────── 세션 조작 ─────────────────────────── */

/** 새 검사 시작 — 하던 게 있으면 확인 후 보관함에 넣는다. */
function onNewSession() {
  const started = overallProgress().answered > 0;
  if (started) {
    const ok = window.confirm('하던 검사를 보관함에 넣고 새로 시작할까요?\n지금까지 답한 내용은 보관함에서 다시 열 수 있어요.');
    if (!ok) return;
    stashCurrent();
  }

  const lv = currentLevel();
  if (!lv) {
    // 급을 아직 안 골랐으면 먼저 고른다. 세션은 급을 고를 때 만들어진다.
    goto('#/level');
    return;
  }

  const student = (state.session && state.session.student) || {};
  state.session = newSession(student, lv);
  persist();
  refreshArchive();
  goto('#/student');
}

/** 이어하기 — 아직 안 끝난 검사로 데려간다. */
function onResume() {
  if (!currentLevel()) {
    goto('#/level');
    return;
  }
  if (!state.session) {
    goto('#/student');
    return;
  }
  const key = firstUnfinishedKey();
  if (!key) {
    goto('#/dashboard');
    return;
  }
  if (answeredOf(key) > 0) {
    const at = firstUnansweredIndex(key);
    state.session.cursor[key] = at === -1 ? 0 : at;
    persist();
    goto(`#/test/${key}`);
    return;
  }
  goto(`#/intro/${key}`);
}

/**
 * AI 서버로 내보낼 학생 정보를 만든다.
 * sendName 에 동의하지 않았으면 이름과 학교는 빼고 학년만 남긴다(보고서 말투를 맞추는 데 필요).
 */
function outboundStudent() {
  const st = (state.session && state.session.student) || {};
  if (state.session && state.session.sendName === true) return st;
  return { name: '', school: '', grade: String(st.grade || '') };
}

/** 학생 정보 저장 */
function onSaveStudent(student) {
  const s = student || {};
  if (!state.session) state.session = newSession(s, activeLevel());
  else {
    state.session.student = {
      name: String(s.name || ''),
      school: String(s.school || ''),
      grade: String(s.grade || ''),
    };
  }
  state.session.sendName = s.sendName === true;
  persist();
  toast('반가워요! 이제 시작해 볼까요?', 'ok');
  const key = firstUnfinishedKey();
  goto(key ? `#/intro/${key}` : '#/dashboard');
}

/** 검사 시작 / 이어하기 — 커서를 안 푼 첫 문항으로 옮긴다. */
function onStartTest(key) {
  if (!state.session) {
    goto('#/student');
    return;
  }
  const at = firstUnansweredIndex(key);
  state.session.cursor[key] = at === -1 ? 0 : at;
  persist();
  goto(`#/test/${key}`);
}

/** 이 검사만 처음부터 다시 */
function onRetakeTest(key) {
  if (!state.session) return;
  if (answeredOf(key) > 0) {
    let title = '이 검사';
    try { title = testOf(key).title; } catch (_) { /* 기본 문구를 쓴다 */ }
    const ok = window.confirm(`${title}의 답을 모두 지우고 처음부터 다시 할까요?`);
    if (!ok) return;
  }
  state.session.answers[key] = new Array(totalOf(key)).fill(null);
  state.session.cursor[key] = 0;
  state.session.done[key] = false;
  persist();
  goto(`#/test/${key}`);
}

/* ─────────────────────────── 문항 응답 ─────────────────────────── */

/** 답을 기록하고 저장한 뒤 다음 문항으로 넘어간다. */
function onAnswer(key, index, value) {
  if (!state.session) return;
  const total = totalOf(key);
  if (!testKeys().includes(key) || !Number.isInteger(index) || index < 0 || index >= total) return;

  const answers = state.session.answers[key];
  if (!Array.isArray(answers)) return;
  // 이미 다 푼 검사에서 답을 고쳐 쓰는 중인지 먼저 확인한다.
  const wasDone = isFilled(key, answers);
  answers[index] = value;
  state.session.done[key] = isFilled(key, answers);

  if (state.session.done[key]) {
    state.session.cursor[key] = index;
    persist();
    if (wasDone) {
      // 답을 고치러 되돌아온 경우 — 결과 화면으로 튕기지 않고 그 자리에 머문다.
      toast('답을 바꿨어요. 결과에도 바로 반영돼요.', 'ok');
      render(false);
      return;
    }
    toast('다 풀었어요! 결과를 보여드릴게요.', 'ok');
    goto(`#/result/${key}`);
    return;
  }

  let next = index + 1;
  if (next >= total) {
    const at = firstUnansweredIndex(key);
    next = at === -1 ? total - 1 : at;
  }
  state.session.cursor[key] = next;
  persist();
  render(false);
}

/** 이전 문항 */
function onPrev(key) {
  moveCursor(key, -1);
}

/** 다음 문항 */
function onNext(key) {
  moveCursor(key, 1);
}

/** 커서를 상대 위치로 옮긴다. */
function moveCursor(key, delta) {
  if (!state.session) return;
  const total = totalOf(key);
  const cur = Number(state.session.cursor[key]) || 0;
  const next = Math.max(0, Math.min(total - 1, cur + delta));
  if (next === cur) return;
  state.session.cursor[key] = next;
  persist();
  render(false);
}

/** 특정 문항으로 바로 이동 */
function onJumpTo(key, index) {
  if (!state.session) return;
  const total = totalOf(key);
  const at = Math.max(0, Math.min(total - 1, Number(index) || 0));
  state.session.cursor[key] = at;
  persist();
  render(false);
}

/** 마지막 문항에서 "결과 보기" */
function onFinishTest(key) {
  if (!state.session) return;
  if (!isFilled(key, answersOf(key))) {
    const at = firstUnansweredIndex(key);
    toast(`아직 답하지 않은 ${unit()}이 있어요. ${at + 1}번 ${unit()}으로 이동할게요.`, 'warn');
    onJumpTo(key, at);
    return;
  }
  state.session.done[key] = true;
  persist();
  goto(`#/result/${key}`);
}

/* ─────────────────────────── 키보드 조작 ─────────────────────────── */

/** 입력창에 포커스가 있으면 단축키를 쓰지 않는다. */
function isTypingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return target.isContentEditable === true;
}

/** 문항 화면에서 숫자키·A/B·화살표·Enter 를 처리한다. */
function onKeyDown(ev) {
  if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (isTypingTarget(ev.target)) return;
  if (state.route.name !== 'test' || !state.session) return;

  const key = state.route.key;
  let t;
  try {
    t = testOf(key);
  } catch (_) {
    return;
  }
  const total = t.questions.length;
  const index = Math.max(0, Math.min(total - 1, Number(state.session.cursor[key]) || 0));
  const k = ev.key;
  const code = ev.code || '';

  if (k === 'ArrowLeft') {
    ev.preventDefault();
    onPrev(key);
    return;
  }
  if (k === 'ArrowRight') {
    ev.preventDefault();
    if (index >= total - 1) onFinishTest(key);
    else onNext(key);
    return;
  }
  if (k === 'Enter') {
    // 버튼 위에서 누른 Enter 는 버튼이 처리하게 둔다.
    if (ev.target && ev.target.tagName && ev.target.tagName.toLowerCase() === 'button') return;
    ev.preventDefault();
    if (index >= total - 1) onFinishTest(key);
    else onNext(key);
    return;
  }

  if (t.mode === 'ab') {
    let pick = null;
    // 한글 자판이 켜져 있으면 e.key 가 'ㅁ'/'ㅠ' 로 오므로 e.code 도 함께 본다.
    if (k === '1' || k === 'a' || k === 'A' || code === 'Digit1' || code === 'Numpad1' || code === 'KeyA') pick = 'a';
    else if (k === '2' || k === 'b' || k === 'B' || code === 'Digit2' || code === 'Numpad2' || code === 'KeyB') pick = 'b';
    if (pick) {
      ev.preventDefault();
      onAnswer(key, index, pick);
    }
    return;
  }

  const scale = t.scale || [];
  const n = Number(k);
  if (Number.isInteger(n) && n >= 1 && n <= scale.length) {
    ev.preventDefault();
    onAnswer(key, index, scale[n - 1].value);
  }
}

/* ─────────────────────────── 보고서 ─────────────────────────── */

/** 생성 중 미리보기에 보여줄 꼬리 글자 */
function tailOf(text) {
  const s = String(text || '');
  return s.length > STREAM_TAIL ? `…${s.slice(-STREAM_TAIL)}` : s;
}

/** 스트리밍 중에는 전체를 다시 그리지 않고 미리보기 노드만 바꾼다(스크롤 튐 방지). */
function paintStreamPreview() {
  const pre = document.getElementById('stream-preview');
  if (pre) {
    pre.textContent = state.ui.streamText;
    // 새로 도착한 글자가 늘 보이도록 미리보기 상자 안쪽만 아래로 붙인다.
    try { pre.scrollTop = pre.scrollHeight; } catch (_) { /* 무시 */ }
  }
  const count = document.getElementById('stream-count');
  if (count) {
    const n = String(state.ui.fullText || '').length;
    count.textContent = n > 0 ? `${n}자` : '준비 중';
  }
}

/** 보고서 만들기를 학생이 직접 멈춘다. */
function cancelReport() {
  if (!state.ui.generating) return;
  if (state.ui.abort && typeof state.ui.abort.abort === 'function') {
    try {
      state.ui.abort.abort();
      return; // 나머지 정리는 generateReport 의 catch/finally 가 맡는다
    } catch (_) { /* 아래에서 강제로 정리한다 */ }
  }
  state.ui.generating = false;
  state.ui.abort = null;
  toast('보고서 만들기를 멈췄어요. 언제든 다시 만들 수 있어요.', 'warn');
  render(false);
}

/** 종합 보고서 생성. force 가 아니면 기존 보고서를 덮어쓸지 확인한다. */
async function generateReport(force) {
  if (state.ui.generating) {
    toast('지금 보고서를 만들고 있어요. 조금만 기다려 주세요.', 'warn');
    return;
  }
  if (!currentLevel()) {
    goto('#/level');
    return;
  }
  if (!state.session) {
    goto('#/student');
    return;
  }
  if (!allDone()) {
    toast('네 가지 검사를 모두 마쳐야 종합 보고서를 만들 수 있어요.', 'warn');
    goto('#/dashboard');
    return;
  }
  if (state.session.report && state.session.report.markdown && !force) {
    const ok = window.confirm('이미 만든 보고서가 있어요.\n새로 만들면 지금 보고서는 사라져요. 계속할까요?');
    if (!ok) {
      goto('#/report');
      return;
    }
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  state.ui.generating = true;
  state.ui.streamText = '';
  state.ui.fullText = '';
  state.ui.engine = '';
  state.ui.model = '';
  state.ui.abort = controller;
  state.ui.startedAt = Date.now(); // 생성 화면의 경과 시간 표시에 쓴다

  goto('#/report');
  render(false); // 같은 주소에서 눌렀을 때도 생성 화면이 보이도록

  // 학교급은 보고서의 말투·조언 수준을 정하므로 반드시 함께 보낸다.
  // 이름·학교는 학생이 명시적으로 동의(sendName)했을 때만 보낸다. 기본은 익명.
  const payload = {
    student: outboundStudent(),
    level: currentLevel(),
    results: {
      disc: state.results.disc,
      mbti: state.results.mbti,
      mi: state.results.mi,
      riasec: state.results.riasec,
    },
  };

  try {
    const result = await requestReport(payload, {
      signal: controller ? controller.signal : undefined,
      onMeta: (meta) => {
        state.ui.engine = meta.engine || '';
        state.ui.model = meta.model || '';
      },
      onDelta: (chunk, full) => {
        state.ui.fullText = full;
        state.ui.streamText = tailOf(full);
        paintStreamPreview();
      },
      onReset: () => {
        state.ui.fullText = '';
        state.ui.streamText = '';
        paintStreamPreview();
      },
      onFallback: (err) => {
        console.warn('[app] 스트리밍 실패 → 일반 방식으로 다시 시도합니다.', err);
      },
    });

    state.session.report = {
      markdown: result.markdown,
      generatedAt: new Date().toISOString(),
      engine: result.engine === 'upstage' ? 'upstage' : 'fallback',
      model: result.model || '',
    };
    persist();
    archiveSession(state.session);
    refreshArchive();
    toast('보고서가 완성됐어요!', 'ok');
  } catch (err) {
    console.error('[app] 보고서 생성 실패', err);
    if (err && err.name === 'AbortError') toast('보고서 만들기를 멈췄어요.', 'warn');
    else toast((err && err.message) || '보고서를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'err');
  } finally {
    state.ui.generating = false;
    state.ui.abort = null;
    render(false);
  }
}

/* ─────────────────────────── 내보내기 ─────────────────────────── */

/** 인쇄·워드·복사·파일 저장 등 내보내기 동작을 한 곳에서 처리한다. */
function onExport(kind) {
  const s = state.session;
  const report = s && s.report ? s.report : null;
  const meta = {
    name: s && s.student ? s.student.name : '',
    level: currentLevel() || '',
    generatedAt: report ? report.generatedAt : new Date().toISOString(),
    engine: report ? report.engine : 'fallback',
  };

  if (kind === 'json') {
    if (!s) return;
    const ok = exportSessionFile(s);
    toast(ok ? '결과 파일을 내려받았어요.' : '파일을 저장하지 못했어요.', ok ? 'ok' : 'err');
    return;
  }
  if (kind === 'print') {
    const msg = printReport();
    if (msg) toast(msg, 'warn');
    return;
  }
  if (!report || !report.markdown) {
    toast('먼저 보고서를 만들어 주세요.', 'warn');
    return;
  }
  if (kind === 'docx' || kind === 'word') {
    try {
      downloadWord(report.markdown, meta);
      toast('워드 파일로 저장했어요.', 'ok');
    } catch (e) {
      console.error('[app] 워드 저장 실패', e);
      toast('워드로 저장하지 못했어요. 인쇄하기로 PDF 저장을 해보세요.', 'err');
    }
    return;
  }
  if (kind === 'md' || kind === 'markdown') {
    try {
      downloadMarkdown(report.markdown, meta);
      toast('마크다운 파일로 저장했어요.', 'ok');
    } catch (e) {
      console.error('[app] 마크다운 저장 실패', e);
      toast('파일로 저장하지 못했어요.', 'err');
    }
    return;
  }
  if (kind === 'text' || kind === 'copy') {
    copyReport(report.markdown).then((ok) => {
      toast(ok ? '보고서를 복사했어요.' : '복사하지 못했어요. 화면에서 직접 선택해 복사해 주세요.', ok ? 'ok' : 'warn');
    });
  }
}

/* ─────────────────────────── 보관함 · 불러오기 · 초기화 ─────────────────────────── */

/** 보관함의 검사를 현재 세션으로 가져온다. */
function onArchiveOpen(id) {
  const found = listArchive().find((x) => x.id === id);
  if (!found) {
    toast('그 기록을 찾지 못했어요.', 'warn');
    refreshArchive();
    render(false);
    return;
  }
  if (state.session && state.session.id !== found.id) stashCurrent();
  state.session = found;
  persist();
  refreshArchive();
  rescore();
  if (!currentLevel()) {
    toast('이 기록에는 학교급 정보가 없어요. 학교급을 골라 주세요.', 'warn');
    goto('#/level');
    return;
  }
  toast('보관해 둔 검사를 불러왔어요.', 'ok');
  goto('#/dashboard');
}

/** 보관함에서 삭제 */
function onArchiveDelete(id) {
  const ok = window.confirm('이 기록을 보관함에서 지울까요?\n지우면 되돌릴 수 없어요.');
  if (!ok) return;
  removeArchived(id);
  refreshArchive();
  toast('보관함에서 지웠어요.', 'ok');
  render(false);
}

/** 내려받았던 JSON 파일 불러오기 */
function onImport(file) {
  importSessionFile(file)
    .then((loaded) => {
      const { session, mismatch } = unwrapSession(loaded);
      if (!session) {
        toast('파일에서 검사 기록을 찾지 못했어요.', 'err');
        return;
      }
      stashCurrent();
      state.session = session;
      persist();
      refreshArchive();
      rescore();
      if (!currentLevel()) {
        toast('이 파일에는 학교급 정보가 없어요. 학교급을 골라 주세요.', 'warn');
        goto('#/level');
        return;
      }
      toast(
        mismatch
          ? `결과 파일을 불러왔지만, 저장된 답이 지금 ${unit()}과 맞지 않아 일부가 비었어요.`
          : '결과 파일을 불러왔어요.',
        mismatch ? 'warn' : 'ok',
      );
      goto('#/dashboard');
    })
    .catch((err) => {
      console.error('[app] 파일 불러오기 실패', err);
      toast((err && err.message) || '파일을 불러오지 못했어요.', 'err');
    });
}

/** 이 기기에 저장된 진행 내용을 지우고 처음부터 */
function onReset() {
  const ok = window.confirm('지금까지 답한 내용을 모두 지우고 처음부터 다시 할까요?\n지운 내용은 되돌릴 수 없어요.');
  if (!ok) return;
  clearSession();
  state.session = null;
  state.ui.streamText = '';
  state.ui.fullText = '';
  refreshArchive();
  toast('처음 상태로 되돌렸어요. 학교급부터 다시 골라 주세요.', 'ok');
  goto('#/');
}

/**
 * 공용 컴퓨터용 — 이 기기에 남은 이 앱의 기록을 통째로 지운다.
 * (진행 중인 검사 + 보관함의 지난 학생 기록까지 모두)
 */
function onClearAll() {
  const ok = window.confirm(
    '이 컴퓨터에 저장된 검사 기록을 모두 지울까요?\n지금 하던 검사와 보관함에 남은 지난 기록이 함께 지워지고, 되돌릴 수 없어요.',
  );
  if (!ok) return;
  clearAll();
  state.session = null;
  state.archive = [];
  state.results = { disc: null, mbti: null, mi: null, riasec: null };
  state.ui.streamText = '';
  state.ui.fullText = '';
  refreshArchive();
  toast('이 컴퓨터에 저장된 기록을 모두 지웠어요. 이제 다음 사람이 새로 시작할 수 있어요.', 'ok');
  goto('#/');
}

/* ─────────────────────────── ui.js 에 넘길 핸들러 ─────────────────────────── */

const handlers = {
  onGoto: (hash) => goto(hash),
  onPickLevel,
  onChangeLevel,
  onNewSession,
  onResume,
  onSaveStudent,
  onStartTest,
  onRetakeTest,
  onAnswer,
  onPrev,
  onNext,
  onJumpTo,
  onFinishTest,
  onGenerateReport: () => generateReport(false),
  onRegenerate: () => generateReport(false),
  onCancelReport: cancelReport,
  onExport,
  onImport,
  onArchiveOpen,
  onArchiveDelete,
  onReset,
  onClearAll,
};

/* ─────────────────────────── 전역 이벤트 ─────────────────────────── */

/** 예기치 못한 오류는 콘솔에 원문을 남기고 학생에겐 한국어로만 알린다. */
function reportUnexpected(where, detail) {
  console.error(`[app] ${where}`, detail);
  const now = Date.now();
  if (now - lastErrorToastAt < 5000) return; // 같은 오류가 쏟아질 때 토스트 폭탄 방지
  lastErrorToastAt = now;
  toast('예상치 못한 문제가 생겼어요. 답은 저장돼 있으니 잠시 뒤 다시 시도해 주세요.', 'err');
}

/** 검사 중이거나 보고서를 만드는 중이면 새로고침·닫기 전에 한 번 물어본다. */
function onBeforeUnload(ev) {
  const busy = state.ui.generating || (state.route.name === 'test' && !allDone());
  if (!busy) return undefined;
  ev.preventDefault();
  ev.returnValue = '답은 이미 저장돼 있어요. 다음에 이어서 할 수 있어요.';
  return ev.returnValue;
}

/** 화면을 벗어나기 직전 한 번 더 저장한다(모바일에서 탭이 갑자기 정리될 때 대비). */
function onPageHide() {
  if (state.session) saveSession(state.session);
}

/* ─────────────────────────── 시작 ─────────────────────────── */

/** 앱 초기화 — 저장된 세션을 되살리고 이벤트를 연결한 뒤 첫 화면을 그린다. */
function boot() {
  mount = document.getElementById('app');
  badge = document.getElementById('progress-badge');
  levelBadge = document.getElementById('level-badge');
  if (!mount) return;

  let mismatch = false;
  try {
    const loaded = unwrapSession(loadSession());
    state.session = loaded.session;
    mismatch = loaded.mismatch;
  } catch (e) {
    console.error('[app] 저장된 검사를 불러오지 못했습니다.', e);
    state.session = null;
  }
  refreshArchive();

  window.addEventListener('hashchange', handleRoute);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('error', (ev) => reportUnexpected('실행 중 오류', (ev && ev.error) || (ev && ev.message)));
  window.addEventListener('unhandledrejection', (ev) => reportUnexpected('처리되지 않은 오류', ev && ev.reason));

  handleRoute(); // 여기서 #boot 로딩 표시가 화면째로 교체된다

  // 저장된 답이 지금 문항 세트와 어긋나면(문항이 바뀐 경우) 새로 시작하도록 알려 준다.
  if (mismatch) {
    toast(`저장해 둔 답이 지금 ${unit()}과 맞지 않아 일부가 비었어요. 새로 시작하면 정확한 결과를 받을 수 있어요.`, 'warn');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
