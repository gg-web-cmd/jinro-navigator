// 세션 저장소 — localStorage 에 진행 중인 검사 세션(학교급 포함)과 보관함을 읽고 쓴다.
// 세션은 항상 level(초·중·고)을 함께 들고 다니며, 답안 배열 길이는 그 급의 문항 수로 맞춘다.
// 사생활 보호 모드처럼 localStorage 가 막힌 환경에서는 메모리 폴백으로 조용히 전환해 앱이 멈추지 않게 한다.

import { TEST_KEYS, getTests, levelKeyOf } from './tests.js';
import { isComplete } from './scoring.js';

export const SESSION_KEY = 'jinro_session_v2';
export const ARCHIVE_KEY = 'jinro_archive_v2';

const VERSION = 2;
const ARCHIVE_MAX = 20;

// 학교급이 없던 시절의 데이터. 되살릴 수 없으므로 조용히 지운다.
const LEGACY_KEYS = ['jinro_session_v1', 'jinro_archive_v1'];

/* ── 저장 백엔드 (localStorage → 실패하면 메모리) ─────────────────── */

const memory = new Map();
const unsaved = new Set(); // localStorage 에 못 넣은 키 — 이 키는 메모리 값이 최신이다
let backend = null; // 'local' | 'memory'
let legacyPurged = false;

function pickBackend() {
  if (backend) return backend;
  try {
    // 읽기가 되는지만 본다. 쓰기 실패(사생활 보호 모드·용량 초과)는 writeRaw 가 따로 처리하므로,
    // 여기서 쓰기로 판정하면 이미 저장돼 있던 세션까지 못 읽게 된다.
    window.localStorage.getItem(SESSION_KEY);
    backend = 'local';
  } catch (e) {
    backend = 'memory';
  }
  return backend;
}

/** 구버전(v1) 기록을 한 번만 정리한다. */
function purgeLegacy() {
  if (legacyPurged) return;
  legacyPurged = true;
  if (pickBackend() !== 'local') return;
  for (const key of LEGACY_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      /* 지우지 못해도 앱은 계속 동작한다 */
    }
  }
}

/** 용량 초과 계열 오류인지 (브라우저마다 이름·코드가 다르다) */
function isQuotaError(e) {
  if (!e) return false;
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  );
}

function readRaw(key) {
  purgeLegacy();
  // 저장에 실패한 키만 메모리 값이 최신이다. 그 외에는 localStorage 를 그대로 믿는다.
  if (unsaved.has(key) && memory.has(key)) return memory.get(key);
  if (pickBackend() === 'local') {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      backend = 'memory';
    }
  }
  return memory.has(key) ? memory.get(key) : null;
}

function writeRaw(key, value) {
  purgeLegacy();
  memory.set(key, value);
  if (pickBackend() !== 'local') {
    unsaved.add(key);
    return false;
  }
  try {
    window.localStorage.setItem(key, value);
    unsaved.delete(key);
    return true;
  } catch (e) {
    if (!isQuotaError(e)) {
      // 쓰기 자체가 막힌 환경(사생활 보호 모드 등) — 이미 저장된 기록을 건드리지 않는다.
      unsaved.add(key);
      return false;
    }
    // 용량 초과 — 보관함을 비워 자리를 만든 뒤 한 번만 더 시도한다.
    // 진행 중인 세션이 지난 기록보다 중요하므로 세션을 먼저 넣고, 보관함은 줄여서 되돌린다.
    const kept = key === ARCHIVE_KEY ? [] : parseArchive(readRaw(ARCHIVE_KEY)).slice(0, 3);
    let saved = false;
    try {
      window.localStorage.removeItem(ARCHIVE_KEY);
      window.localStorage.setItem(key, value);
      unsaved.delete(key);
      saved = true;
    } catch (e2) {
      unsaved.add(key); // 메모리 값이 최신이므로 읽을 때 메모리를 우선한다
    }
    if (kept.length) {
      const trimmed = JSON.stringify(kept);
      memory.set(ARCHIVE_KEY, trimmed);
      try {
        window.localStorage.setItem(ARCHIVE_KEY, trimmed);
        unsaved.delete(ARCHIVE_KEY);
      } catch (e3) {
        unsaved.add(ARCHIVE_KEY);
      }
    }
    return saved;
  }
}

function removeRaw(key) {
  memory.delete(key);
  unsaved.delete(key);
  if (pickBackend() !== 'local') return;
  try {
    window.localStorage.removeItem(key);
  } catch (e) {
    /* 지우지 못해도 앱은 계속 동작한다 */
  }
}

/* ── 급별 명세 (문항 수 · 값 범위) ────────────────────────────────── */

const specCache = new Map();

/** 그 급의 검사별 { len, mode, maxValue } — 문항 수와 척도 최댓값을 데이터에서 그대로 가져온다. */
function levelSpec(level) {
  const levelKey = levelKeyOf(level);
  if (specCache.has(levelKey)) return specCache.get(levelKey);
  const spec = {};
  for (const t of getTests(levelKey)) {
    spec[t.key] = {
      len: t.count,
      mode: t.mode,
      maxValue: Array.isArray(t.scale) && t.scale.length ? Math.max(...t.scale.map((s) => s.value)) : null,
    };
  }
  specCache.set(levelKey, spec);
  return spec;
}

/* ── 값 정규화 도우미 ─────────────────────────────────────────────── */

function str(v) {
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
}

function isoOr(v, fallback) {
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return v;
  return fallback;
}

/** 검사별 값 검증. 이상한 값은 null(=미응답)로 되돌린다. */
function normalizeValue(v, spec) {
  if (spec.mode === 'ab') return v === 'a' || v === 'b' ? v : null;
  const max = spec.maxValue || 0;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= max) return n;
  return null;
}

/** 답안 배열을 그 급의 문항 수 길이로 맞춘다. 남는 값은 버리고 모자란 자리는 null 로 채운다. */
function normalizeAnswers(arr, spec) {
  const out = new Array(spec.len).fill(null);
  if (Array.isArray(arr)) {
    for (let i = 0; i < spec.len; i++) out[i] = normalizeValue(arr[i], spec);
  }
  return out;
}

function normalizeReport(r) {
  if (!r || typeof r !== 'object' || typeof r.markdown !== 'string' || r.markdown === '') return null;
  return {
    markdown: r.markdown,
    generatedAt: isoOr(r.generatedAt, new Date().toISOString()),
    engine: r.engine === 'upstage' ? 'upstage' : 'fallback',
    model: str(r.model),
  };
}

function makeId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ── 세션 생성 · 마이그레이션 ─────────────────────────────────────── */

/**
 * 새 세션을 만든다. answers 는 그 급의 검사별 문항 수만큼 null 로 채워진다.
 * @param {{name?:string, school?:string, grade?:string}} student
 * @param {string|object} level 'elem' | 'mid' | 'high' (또는 레벨 객체)
 */
export function newSession(student, level) {
  const s = student && typeof student === 'object' ? student : {};
  const levelKey = levelKeyOf(level);
  const spec = levelSpec(levelKey);
  const now = new Date().toISOString();

  const answers = {};
  const cursor = {};
  const done = {};
  for (const key of TEST_KEYS) {
    answers[key] = new Array(spec[key].len).fill(null);
    cursor[key] = 0;
    done[key] = false;
  }

  return {
    version: VERSION,
    id: makeId(),
    level: levelKey,
    student: { name: str(s.name), school: str(s.school), grade: str(s.grade) },
    // 보고서를 만들 때 이름·학교를 AI 서버로 함께 보낼지 여부. 기본은 보내지 않음(익명).
    sendName: s.sendName === true,
    startedAt: now,
    updatedAt: now,
    answers,
    cursor,
    done,
    report: null,
  };
}

/**
 * 저장된 값이 지금 데이터와 어긋나는지 본다.
 * 급이 없거나(=구조 이전 데이터), 답안 배열 길이가 그 급의 문항 수와 다르면 true.
 * (문항을 나중에 고친 경우가 여기에 걸린다.)
 */
function detectMismatch(raw, levelKey) {
  if (!raw || typeof raw !== 'object') return true;
  if (levelKeyOf(raw.level) !== raw.level) return true; // level 이 없거나 알 수 없는 값
  const spec = levelSpec(levelKey);
  const bag = raw.answers && typeof raw.answers === 'object' ? raw.answers : {};
  for (const key of TEST_KEYS) {
    const a = bag[key];
    if (!Array.isArray(a)) return true;
    if (a.length !== spec[key].len) return true;
  }
  return false;
}

/**
 * 어떤 모양의 값이든 받아 현재 버전(v2)의 세션으로 보정한다.
 * 버전이 다르면(구버전 v1 이하 · 미래 버전) 되살리지 않고 null 을 돌려준다.
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const version = typeof raw.version === 'number' ? raw.version : 0;
  if (version !== VERSION) return null; // 학교급이 없던 구버전은 조용히 버린다

  const levelKey = levelKeyOf(raw.level);
  const spec = levelSpec(levelKey);

  const answersRaw = raw.answers && typeof raw.answers === 'object' ? raw.answers : {};
  const cursorRaw = raw.cursor && typeof raw.cursor === 'object' ? raw.cursor : {};
  const doneRaw = raw.done && typeof raw.done === 'object' ? raw.done : {};
  const studentRaw = raw.student && typeof raw.student === 'object' ? raw.student : {};

  const answers = {};
  const cursor = {};
  const done = {};
  for (const key of TEST_KEYS) {
    answers[key] = normalizeAnswers(answersRaw[key], spec[key]);
    const c = Number(cursorRaw[key]);
    const last = spec[key].len - 1;
    cursor[key] = Number.isInteger(c) && c >= 0 && c <= last ? c : 0;
    done[key] = doneRaw[key] === true || isComplete(key, answers[key], levelKey);
  }

  const startedAt = isoOr(raw.startedAt, new Date().toISOString());

  return {
    version: VERSION,
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
    level: levelKey,
    student: { name: str(studentRaw.name), school: str(studentRaw.school), grade: str(studentRaw.grade) },
    startedAt,
    updatedAt: isoOr(raw.updatedAt, startedAt),
    answers,
    cursor,
    done,
    report: normalizeReport(raw.report),
  };
}

/* ── 진행 중 세션 ─────────────────────────────────────────────────── */

/**
 * 저장된 세션을 읽는다.
 * @returns {null | {session:object, mismatch:boolean}}
 *  - 저장된 것이 없거나 되살릴 수 없으면 null (구버전 데이터는 여기서 조용히 지워진다)
 *  - mismatch:true 면 저장된 답안이 지금 문항 수와 맞지 않아 길이를 억지로 맞춘 상태다.
 *    이어하기 대신 새로 시작하도록 안내해야 한다.
 */
export function loadSession() {
  const raw = readRaw(SESSION_KEY);
  if (!raw) return null;

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    removeRaw(SESSION_KEY);
    return null;
  }

  const session = migrate(parsed);
  if (!session) {
    removeRaw(SESSION_KEY);
    return null;
  }

  return { session, mismatch: detectMismatch(parsed, session.level) };
}

/** 세션을 저장한다. updatedAt 을 갱신하며, 실패해도 예외 없이 false 만 돌려준다. */
export function saveSession(session) {
  if (!session || typeof session !== 'object') return false;
  try {
    session.updatedAt = new Date().toISOString();
    return writeRaw(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    return false;
  }
}

export function clearSession() {
  removeRaw(SESSION_KEY);
}

/* ── 보관함 ───────────────────────────────────────────────────────── */

function parseArchive(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(migrate).filter(Boolean); // 구버전 기록은 여기서 걸러진다
  } catch (e) {
    return [];
  }
}

function writeArchive(list) {
  try {
    return writeRaw(ARCHIVE_KEY, JSON.stringify(list.slice(0, ARCHIVE_MAX)));
  } catch (e) {
    return false;
  }
}

/** 보관된 세션 목록 (최근 순). 각 항목은 level 을 그대로 보존한다. */
export function listArchive() {
  return parseArchive(readRaw(ARCHIVE_KEY));
}

/** 세션을 보관함 맨 앞에 넣는다. 같은 id 는 최신 것으로 대체하고, 최대 20개만 유지한다. */
export function archiveSession(session) {
  const s = migrate(session);
  if (!s) return false;
  const list = listArchive().filter((x) => x.id !== s.id);
  list.unshift(s);
  return writeArchive(list);
}

export function removeArchived(id) {
  const list = listArchive().filter((x) => x.id !== id);
  return writeArchive(list);
}

/** 보관함을 통째로 비운다. (공용 컴퓨터에서 내 기록을 남기지 않기 위해) */
export function clearArchive() {
  removeRaw(ARCHIVE_KEY);
}

/** 이 기기에 저장된 이 앱의 기록(진행 중 세션 + 보관함)을 모두 지운다. */
export function clearAll() {
  removeRaw(SESSION_KEY);
  removeRaw(ARCHIVE_KEY);
  for (const key of LEGACY_KEYS) removeRaw(key);
}

/* ── 내보내기 · 가져오기 ──────────────────────────────────────────── */

function safeName(name) {
  const n = str(name).trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  return n || '학생';
}

function yyyymmdd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 세션을 JSON 파일로 내려받는다. 파일명: 이름_진로검사_YYYYMMDD.json (level 도 함께 저장된다) */
export function exportSessionFile(session) {
  if (!session || typeof document === 'undefined') return false;
  try {
    const text = JSON.stringify(session, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName(session.student && session.student.name)}_진로검사_${yyyymmdd(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 내려받았던 JSON 파일을 읽어 세션으로 되살린다.
 * @param {File} file
 * @returns {Promise<{session:object, mismatch:boolean}>}
 */
export function importSessionFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('불러올 파일을 선택해 주세요.'));
      return;
    }
    if (typeof FileReader === 'undefined') {
      reject(new Error('이 브라우저에서는 파일 불러오기를 지원하지 않아요.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽지 못했어요. 잠시 후 다시 시도해 주세요.'));
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (e) {
        reject(new Error('진로 검사 파일이 아닌 것 같아요. 내려받았던 JSON 파일을 골라 주세요.'));
        return;
      }
      const session = migrate(parsed);
      if (!session) {
        const old = parsed && typeof parsed === 'object' && Number(parsed.version) < VERSION;
        reject(
          new Error(
            old
              ? '학교급이 없던 예전 버전 파일이라 불러올 수 없어요. 검사를 새로 시작해 주세요.'
              : '파일 내용이 손상되어 불러올 수 없어요. 다른 파일을 골라 주세요.',
          ),
        );
        return;
      }
      resolve({ session, mismatch: detectMismatch(parsed, session.level) });
    };
    try {
      reader.readAsText(file, 'utf-8');
    } catch (e) {
      reject(new Error('파일을 읽지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  });
}
