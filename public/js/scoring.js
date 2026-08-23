// 채점 엔진 — 학교급(level)별 문항 세트에 맞춰 4개 검사(DISC/MBTI/다중지능/RIASEC) 답안을 결과로 바꾼다.
// 문항 수와 만점은 절대 하드코딩하지 않고 그 급의 문항 데이터에서 계산한다. DOM·저장소에 접근하지 않는 순수 함수 모음.
// 답안이 불완전하거나 손상되면 예외 대신 null 을 돌려준다.

import { TEST_KEYS, getTests, levelKeyOf } from './tests.js';
import { comboKey as makeComboKey } from './data/mi-types.js';

/* ── 키 순서 (동점일 때 이 순서를 유지한다) ───────────────────────── */
const DISC_KEYS = ['D', 'I', 'S', 'C'];
const MI_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const RIASEC_KEYS = ['R', 'I', 'A', 'S', 'E', 'C'];

/** 리커트 검사의 유형 키 목록 */
const TYPE_KEYS = { disc: DISC_KEYS, mi: MI_KEYS, riasec: RIASEC_KEYS };

function warn(msg) {
  if (typeof console !== 'undefined' && console.warn) console.warn(`[scoring] ${msg}`);
}

/* ── 급별 채점 명세 (문항 수 · 값 범위 · 유형별 만점) ─────────────── */

const specCache = new Map();

/**
 * 그 급의 검사별 채점 명세를 만든다.
 * maxByType[k] = (그 유형의 문항 수) x (척도 최댓값) → percents 의 분모가 된다.
 * 예) DISC 는 5점 척도라 초등 15 · 중학 25 · 고교 35, MI/RIASEC 는 4점 척도.
 */
function specOf(level) {
  const levelKey = levelKeyOf(level);
  if (specCache.has(levelKey)) return specCache.get(levelKey);

  const spec = {};
  for (const t of getTests(levelKey)) {
    const scaleMax =
      Array.isArray(t.scale) && t.scale.length ? Math.max(...t.scale.map((s) => s.value)) : null;
    const keys = TYPE_KEYS[t.key] || null;
    const maxByType = {};
    if (keys) {
      for (const k of keys) maxByType[k] = 0;
      for (const q of t.questions) {
        if (Object.prototype.hasOwnProperty.call(maxByType, q.type)) maxByType[q.type] += scaleMax;
      }
    }
    spec[t.key] = {
      level: levelKey,
      len: t.questions.length,
      questions: t.questions,
      types: t.types,
      axes: t.axes,
      combos: t.combos,
      min: 1,
      max: scaleMax,
      keys,
      maxByType,
    };
  }
  specCache.set(levelKey, spec);
  return spec;
}

/* ── 답안 검증 ────────────────────────────────────────────────────── */

/** 리커트 답안 검사 → 'ok' | 'incomplete' | 'bad' */
function checkLikert(testKey, answers, spec) {
  if (answers === null || answers === undefined) return 'incomplete'; // 아직 시작하지 않은 검사
  if (!Array.isArray(answers)) {
    warn(`${testKey}: 답안이 배열이 아닙니다.`);
    return 'bad';
  }
  if (answers.length !== spec.len) {
    warn(`${testKey}: 문항 수가 ${spec.len}(${spec.level}) 이어야 하는데 ${answers.length} 입니다.`);
    return 'bad';
  }
  let incomplete = false;
  for (let i = 0; i < answers.length; i++) {
    const v = answers[i];
    if (v === null || v === undefined) {
      incomplete = true;
      continue;
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < spec.min || v > spec.max) {
      warn(`${testKey}: ${i + 1}번 문항 값(${String(v)})이 ${spec.min}~${spec.max} 범위를 벗어납니다.`);
      return 'bad';
    }
  }
  return incomplete ? 'incomplete' : 'ok';
}

/** MBTI(A/B) 답안 검사 → 'ok' | 'incomplete' | 'bad' */
function checkAb(answers, spec) {
  if (answers === null || answers === undefined) return 'incomplete';
  if (!Array.isArray(answers)) {
    warn('mbti: 답안이 배열이 아닙니다.');
    return 'bad';
  }
  if (answers.length !== spec.len) {
    warn(`mbti: 문항 수가 ${spec.len}(${spec.level}) 이어야 하는데 ${answers.length} 입니다.`);
    return 'bad';
  }
  let incomplete = false;
  for (let i = 0; i < answers.length; i++) {
    const v = answers[i];
    if (v === null || v === undefined) {
      incomplete = true;
      continue;
    }
    if (v !== 'a' && v !== 'b') {
      warn(`mbti: ${i + 1}번 문항 값(${String(v)})이 "a" 또는 "b" 가 아닙니다.`);
      return 'bad';
    }
  }
  return incomplete ? 'incomplete' : 'ok';
}

/* ── 계산 도우미 ──────────────────────────────────────────────────── */

/** 유형별 합계 */
function sumByType(questions, answers, keys) {
  const scores = {};
  for (const k of keys) scores[k] = 0;
  for (let i = 0; i < questions.length; i++) {
    const t = questions[i].type;
    if (t in scores) scores[t] += answers[i];
  }
  return scores;
}

/** 백분율 맵 (반올림 정수). 분모는 유형별 만점이라 급이 달라도 0~100 으로 비교된다. */
function toPercents(scores, keys, maxByType) {
  const out = {};
  for (const k of keys) {
    const max = maxByType[k];
    out[k] = max > 0 ? Math.round((scores[k] / max) * 100) : 0;
  }
  return out;
}

/** 점수 내림차순 안정 정렬. 동점이면 keys 에 적힌 원래 순서를 유지한다. */
function rankKeys(keys, scores) {
  return keys
    .map((k, i) => ({ k, i }))
    .sort((a, b) => scores[b.k] - scores[a.k] || a.i - b.i)
    .map((o) => o.k);
}

/* ── DISC ─────────────────────────────────────────────────────────── */

/**
 * @param {Array<number|null>} answers 1~5 값 배열
 * @param {string|object} level 학교급 키 또는 레벨 객체
 */
export function scoreDisc(answers, level) {
  const levelKey = levelKeyOf(level);
  const spec = specOf(levelKey).disc;
  if (checkLikert('disc', answers, spec) !== 'ok') return null;

  const types = spec.types;
  const scores = sumByType(spec.questions, answers, DISC_KEYS);
  const percents = toPercents(scores, DISC_KEYS, spec.maxByType);
  const ranked = rankKeys(DISC_KEYS, scores);
  const primary = ranked[0];
  const secondary = ranked[1];

  return {
    level: levelKey,
    scores,
    percents,
    ranked,
    primary,
    secondary,
    primaryInfo: types[primary],
    secondaryInfo: types[secondary],
    info: types,
  };
}

/* ── MBTI ─────────────────────────────────────────────────────────── */

export function scoreMbti(answers, level) {
  const levelKey = levelKeyOf(level);
  const spec = specOf(levelKey).mbti;
  if (checkAb(answers, spec) !== 'ok') return null;

  const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  for (let i = 0; i < spec.questions.length; i++) {
    const pair = spec.questions[i].type; // "EI" | "SN" | "TF" | "JP"
    const letter = answers[i] === 'a' ? pair[0] : pair[1];
    if (letter in scores) scores[letter] += 1;
  }

  const axes = spec.axes.map((ax) => {
    const leftScore = scores[ax.left];
    const rightScore = scores[ax.right];
    const total = leftScore + rightScore;
    const leftPct = total > 0 ? Math.round((leftScore / total) * 100) : 50;
    const rightPct = 100 - leftPct;
    // 동점이면 뒷 글자(I/N/F/P)를 택한다 — 원본 사이트와 동일한 규칙.
    const pick = leftScore > rightScore ? ax.left : ax.right;
    return {
      key: ax.key,
      left: ax.left,
      right: ax.right,
      leftName: ax.leftName,
      rightName: ax.rightName,
      leftScore,
      rightScore,
      leftPct,
      rightPct,
      pick,
      strength: pick === ax.left ? leftPct : rightPct,
    };
  });

  const type = axes.map((a) => a.pick).join('');

  return { level: levelKey, type, scores, axes, info: spec.types[type] };
}

/* ── 다중지능(MI) ─────────────────────────────────────────────────── */

/** top3 중 1·2위 → 1·3위 → 2·3위 순으로 조합 키를 찾는다. 28가지가 모두 있어 보통 첫 번째에서 잡힌다. */
function findComboKey(top3Keys, combos) {
  const pairs = [
    [top3Keys[0], top3Keys[1]],
    [top3Keys[0], top3Keys[2]],
    [top3Keys[1], top3Keys[2]],
  ];
  for (const pair of pairs) {
    if (!pair[0] || !pair[1] || pair[0] === pair[1]) continue;
    const key = makeComboKey(pair[0], pair[1]); // 항상 알파벳 오름차순 "X-Y"
    if (combos && Object.prototype.hasOwnProperty.call(combos, key)) return key;
  }
  return 'default'; // 방어 코드 — 조합표에 구멍이 나도 화면이 비지 않게 한다
}

function miEntry(key, scores, percents, types) {
  return {
    key,
    name: (types && types[key] && types[key].name) || key,
    score: scores[key],
    percent: percents[key],
    info: types ? types[key] : undefined,
  };
}

export function scoreMi(answers, level) {
  const levelKey = levelKeyOf(level);
  const spec = specOf(levelKey).mi;
  if (checkLikert('mi', answers, spec) !== 'ok') return null;

  const types = spec.types;
  const combos = spec.combos;
  const scores = sumByType(spec.questions, answers, MI_KEYS);
  const percents = toPercents(scores, MI_KEYS, spec.maxByType);
  const ranked = rankKeys(MI_KEYS, scores);

  const top3 = ranked.slice(0, 3).map((k) => miEntry(k, scores, percents, types));
  // 가장 낮은 것부터 3개
  const bottom3 = ranked
    .slice(-3)
    .reverse()
    .map((k) => miEntry(k, scores, percents, types));

  const comboKey = findComboKey(ranked.slice(0, 3), combos);

  return {
    level: levelKey,
    scores,
    percents,
    ranked,
    top3,
    bottom3,
    comboKey,
    combo: (combos && combos[comboKey]) || (combos && combos.default) || null,
    info: types,
  };
}

/* ── RIASEC ───────────────────────────────────────────────────────── */

export function scoreRiasec(answers, level) {
  const levelKey = levelKeyOf(level);
  const spec = specOf(levelKey).riasec;
  if (checkLikert('riasec', answers, spec) !== 'ok') return null;

  const types = spec.types;
  const scores = sumByType(spec.questions, answers, RIASEC_KEYS);
  const percents = toPercents(scores, RIASEC_KEYS, spec.maxByType);
  const ranked = rankKeys(RIASEC_KEYS, scores);
  const [primary, secondary, tertiary] = ranked;

  return {
    level: levelKey,
    scores,
    percents,
    ranked,
    primary,
    secondary,
    tertiary,
    code: `${primary}${secondary}${tertiary}`,
    primaryInfo: types[primary],
    secondaryInfo: types[secondary],
    tertiaryInfo: types[tertiary],
    info: types,
  };
}

/* ── 통합 API ─────────────────────────────────────────────────────── */

const SCORERS = {
  disc: scoreDisc,
  mbti: scoreMbti,
  mi: scoreMi,
  riasec: scoreRiasec,
};

/** 검사 하나를 키로 채점한다. */
export function scoreTest(testKey, answers, level) {
  const fn = SCORERS[testKey];
  if (!fn) return null;
  try {
    return fn(answers, level);
  } catch (e) {
    warn(`${testKey}: 채점 중 문제가 생겨 결과를 비웁니다. (${e && e.message})`);
    return null;
  }
}

/**
 * 4개 검사를 한 번에 채점한다.
 * @param {object} answersObj session.answers (세션 객체를 그대로 넘겨도 동작한다)
 * @param {string|object} [level] 생략하면 세션의 level 을 쓴다
 * @returns {{disc:object|null, mbti:object|null, mi:object|null, riasec:object|null}}
 */
export function scoreAll(answersObj, level) {
  const isSession = !!(answersObj && answersObj.answers);
  const src = isSession ? answersObj.answers : answersObj;
  const bag = src && typeof src === 'object' ? src : {};
  const levelKey = levelKeyOf(level !== undefined && level !== null ? level : isSession ? answersObj.level : undefined);

  const out = {};
  for (const key of TEST_KEYS) out[key] = scoreTest(key, bag[key], levelKey);
  return out;
}

/** 해당 검사의 답안이 그 급의 문항 수만큼 모두 채워졌는지 */
export function isComplete(testKey, answers, level) {
  const spec = specOf(level)[testKey];
  if (!spec) return false;
  if (testKey === 'mbti') return checkAb(answers, spec) === 'ok';
  return checkLikert(testKey, answers, spec) === 'ok';
}

/**
 * 답한 문항 수. 검사 하나의 배열도, session.answers 객체 전체도 받는다.
 * @param {Array|object} answers
 */
export function answeredCount(answers) {
  if (Array.isArray(answers)) {
    let n = 0;
    for (const v of answers) if (v !== null && v !== undefined && v !== '') n += 1;
    return n;
  }
  if (answers && typeof answers === 'object') {
    let n = 0;
    for (const key of TEST_KEYS) n += answeredCount(answers[key]);
    return n;
  }
  return 0;
}

/**
 * 세션 전체 진행률. 문항 수는 세션의 급(session.level)을 기준으로 센다.
 * @param {object} session
 * @param {string|object} [level] 세션의 급을 덮어쓰고 싶을 때만 넘긴다
 * @returns {{answered:number,total:number,percent:number,level:string,perTest:object}}
 */
export function progressOf(session, level) {
  const bag = session && session.answers && typeof session.answers === 'object' ? session.answers : {};
  const levelKey = levelKeyOf(
    level !== undefined && level !== null ? level : session ? session.level : undefined,
  );

  const perTest = {};
  let answered = 0;
  let total = 0;

  for (const t of getTests(levelKey)) {
    const testTotal = t.count;
    const testAnswered = Math.min(answeredCount(bag[t.key]), testTotal);
    perTest[t.key] = {
      answered: testAnswered,
      total: testTotal,
      percent: testTotal > 0 ? Math.round((testAnswered / testTotal) * 100) : 0,
      done: testTotal > 0 && testAnswered === testTotal,
    };
    answered += testAnswered;
    total += testTotal;
  }

  return {
    answered,
    total,
    percent: total > 0 ? Math.round((answered / total) * 100) : 0,
    level: levelKey,
    perTest,
  };
}
