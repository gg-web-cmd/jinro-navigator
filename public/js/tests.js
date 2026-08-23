// 검사 레지스트리 — 학교급(levelKey)에 맞는 문항·척도·유형 정보를 한 덩어리로 묶어 돌려준다.
// 문항 수가 급마다 달라서 상수 배열 하나로는 표현할 수 없다. 그래서 TESTS 대신 getTests(levelKey) 만 공개한다.
// 검사 순서를 바꾸려면 아래 TEST_META 의 배열 순서(와 order)만 고치면 앱 전체가 따라온다.

import { getLevel, isEasy, isValidLevel, DEFAULT_LEVEL } from './data/levels.js';
import {
  DISC_QUESTIONS,
  DISC_SCALE,
  DISC_SCALE_EASY,
  DISC_TYPES,
  DISC_TYPES_EASY,
} from './data/disc.js';
import { MBTI_QUESTIONS, MBTI_AXES } from './data/mbti.js';
import { MBTI_RESULTS, MBTI_RESULTS_EASY } from './data/mbti-results.js';
import { MI_QUESTIONS, MI_SCALE, MI_SCALE_EASY } from './data/mi.js';
import { MI_TYPES, MI_TYPES_EASY, MI_COMBOS, MI_COMBOS_EASY } from './data/mi-types.js';
import {
  RIASEC_QUESTIONS,
  RIASEC_SCALE,
  RIASEC_SCALE_EASY,
  RIASEC_TYPES,
  RIASEC_TYPES_EASY,
} from './data/riasec.js';

function warn(msg) {
  if (typeof console !== 'undefined' && console.warn) console.warn(`[tests] ${msg}`);
}

/* ── 급과 무관한 검사 메타 ────────────────────────────────────────── */

const TEST_META = [
  {
    key: 'disc',
    order: 1,
    emoji: '🧭',
    title: 'DISC 행동유형 검사',
    short: 'DISC',
    subtitle: '나는 어떻게 행동하는 사람일까?',
    mode: 'likert', // 리커트 척도
    accent: 'var(--accent-disc)',
    intro: {
      easy: '친구들과 있을 때, 무언가를 할 때 내가 자연스럽게 하는 행동을 알아봐요. 정답은 없어요!',
      standard: '친구들과 있을 때, 과제를 할 때 내가 자연스럽게 보이는 행동 스타일을 알아봐요.',
    },
  },
  {
    key: 'mbti',
    order: 2,
    emoji: '🧩',
    title: 'MBTI 성격유형 검사',
    short: 'MBTI',
    subtitle: '나의 타고난 성격은?',
    mode: 'ab', // A/B 양자택일
    accent: 'var(--accent-mbti)',
    intro: {
      easy: '두 가지 중에서 나에게 더 가까운 쪽을 고르면 돼요. 오래 고민하지 않아도 괜찮아요.',
      standard: '두 가지 중에 더 나에게 가까운 쪽을 고르면 돼요. 정답은 없어요!',
    },
  },
  {
    key: 'mi',
    order: 3,
    emoji: '🌟',
    title: '다중지능 검사',
    short: '다중지능',
    subtitle: '나는 어떤 재능을 가졌을까?',
    mode: 'likert',
    accent: 'var(--accent-mi)',
    intro: {
      easy: '8가지 재능 중에서 나에게 반짝이는 재능을 찾아봐요. 문항이 조금 많으니 쉬어가도 좋아요.',
      standard: '8가지 재능 중 나에게서 빛나는 재능을 찾아봐요. 문항이 가장 많으니 쉬어가도 좋아요.',
    },
  },
  {
    key: 'riasec',
    order: 4,
    emoji: '🎯',
    title: 'RIASEC 직업흥미 검사',
    short: 'RIASEC',
    subtitle: '나는 어떤 분야에 흥미를 느낄까?',
    mode: 'likert',
    accent: 'var(--accent-riasec)',
    intro: {
      easy: '어떤 일을 할 때 마음이 두근거리는지 알아보고, 나에게 잘 맞는 일을 찾아봐요.',
      standard: '어떤 활동을 할 때 마음이 움직이는지 알아보고, 잘 맞는 직업 환경을 찾아봐요.',
    },
  },
];

export const TEST_KEYS = TEST_META.map((t) => t.key);

/** 검사 하나의 급 무관 메타(제목·이모지·색 등). 문항이 필요하면 getTest 를 쓴다. */
export function getTestMeta(testKey) {
  const m = TEST_META.find((t) => t.key === testKey);
  if (!m) throw new Error(`알 수 없는 검사 키: ${testKey}`);
  return m;
}

/* ── 학교급 키 정규화 ─────────────────────────────────────────────── */

/**
 * 문자열('mid')이든 레벨 객체({key:'mid'})든 받아 올바른 급 키로 바꾼다.
 * 알 수 없는 값이면 기본급으로 되돌린다.
 */
export function levelKeyOf(level) {
  const raw =
    typeof level === 'string' ? level : level && typeof level === 'object' ? level.key : '';
  if (isValidLevel(raw)) return raw;
  if (raw) warn(`알 수 없는 학교급 "${String(raw)}" — 기본급(${DEFAULT_LEVEL})으로 대체합니다.`);
  return DEFAULT_LEVEL;
}

/* ── 급별 자료 해석기 ─────────────────────────────────────────────── */

/** 급별 문항 배열을 꺼낸다. 비어 있으면 기본급으로 대체한다. */
function pickQuestions(table, levelKey, testKey) {
  const arr = table[levelKey];
  if (Array.isArray(arr) && arr.length) return arr;
  warn(`${testKey}: "${levelKey}" 급 문항이 없어 기본급(${DEFAULT_LEVEL}) 문항을 씁니다.`);
  return Array.isArray(table[DEFAULT_LEVEL]) ? table[DEFAULT_LEVEL] : [];
}

const RESOLVERS = {
  disc: (levelKey, easy) => ({
    questions: pickQuestions(DISC_QUESTIONS, levelKey, 'disc'),
    scale: easy ? DISC_SCALE_EASY : DISC_SCALE, // 5점 리커트
    types: easy ? DISC_TYPES_EASY : DISC_TYPES,
  }),
  mbti: (levelKey, easy) => ({
    questions: pickQuestions(MBTI_QUESTIONS, levelKey, 'mbti'),
    scale: null, // A/B 양자택일이라 척도가 없다
    types: easy ? MBTI_RESULTS_EASY : MBTI_RESULTS, // 16유형 결과 문구
    axes: MBTI_AXES,
  }),
  mi: (levelKey, easy) => ({
    questions: pickQuestions(MI_QUESTIONS, levelKey, 'mi'),
    scale: easy ? MI_SCALE_EASY : MI_SCALE, // 4점 리커트
    types: easy ? MI_TYPES_EASY : MI_TYPES,
    combos: easy ? MI_COMBOS_EASY : MI_COMBOS, // 상위 2개 지능 조합 해설
  }),
  riasec: (levelKey, easy) => ({
    questions: pickQuestions(RIASEC_QUESTIONS, levelKey, 'riasec'),
    scale: easy ? RIASEC_SCALE_EASY : RIASEC_SCALE, // 4점 리커트
    types: easy ? RIASEC_TYPES_EASY : RIASEC_TYPES,
  }),
};

/* ── 예상 소요 시간 배분 ──────────────────────────────────────────── */

/**
 * 급 전체 예상 시간(levels.js 의 estMinutes)을 검사별 문항 수 비율로 나눈다.
 * 반올림 오차는 문항이 가장 많은 검사에서 흡수해 합이 급 예상 시간과 정확히 맞도록 한다.
 */
function splitMinutes(level, counts) {
  const total = TEST_KEYS.reduce((n, k) => n + (counts[k] || 0), 0);
  const out = {};
  const est = Number(level.estMinutes) > 0 ? Number(level.estMinutes) : TEST_KEYS.length;
  if (total <= 0) {
    for (const k of TEST_KEYS) out[k] = 1;
    return out;
  }
  let sum = 0;
  for (const k of TEST_KEYS) {
    out[k] = Math.max(1, Math.round((est * (counts[k] || 0)) / total));
    sum += out[k];
  }
  const diff = est - sum;
  if (diff !== 0) {
    const biggest = TEST_KEYS.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0];
    out[biggest] = Math.max(1, out[biggest] + diff);
  }
  return out;
}

/* ── 급별 검사 배열 만들기 (한 번 만들면 캐시) ────────────────────── */

const cache = new Map();

/**
 * 해당 학교급의 검사 4종 배열. 각 항목에 questions/scale/types/count/estMinutes 가 모두 풀려 있다.
 * @param {string|object} level 급 키('elem'|'mid'|'high') 또는 레벨 객체
 * @returns {Array<object>}
 */
export function getTests(level) {
  const levelKey = levelKeyOf(level);
  if (cache.has(levelKey)) return cache.get(levelKey);

  const lv = getLevel(levelKey);
  const easy = isEasy(levelKey);

  // 검사별 실제 문항 수(데이터가 진실). levels.js 의 counts 와 다르면 알려 준다.
  const counts = {};
  const resolved = {};
  for (const meta of TEST_META) {
    const r = RESOLVERS[meta.key](levelKey, easy);
    resolved[meta.key] = r;
    counts[meta.key] = r.questions.length;
    const declared = lv.counts ? lv.counts[meta.key] : undefined;
    if (typeof declared === 'number' && declared !== counts[meta.key]) {
      warn(
        `${meta.key}(${levelKey}): levels.js 는 ${declared}문항이라고 하는데 실제 문항은 ${counts[meta.key]}개입니다.`,
      );
    }
  }

  const minutes = splitMinutes(lv, counts);

  const list = TEST_META.map((meta) => {
    const r = resolved[meta.key];
    return {
      key: meta.key,
      order: meta.order,
      emoji: meta.emoji,
      title: meta.title,
      short: meta.short,
      subtitle: meta.subtitle,
      intro: easy ? meta.intro.easy : meta.intro.standard,
      mode: meta.mode,
      accent: meta.accent,
      level: levelKey,
      questions: r.questions,
      scale: r.scale,
      types: r.types,
      axes: r.axes || null, // MBTI 만 값이 있다
      combos: r.combos || null, // 다중지능만 값이 있다
      count: r.questions.length,
      estMinutes: minutes[meta.key],
    };
  });

  cache.set(levelKey, list);
  return list;
}

/**
 * 해당 급의 검사 하나.
 * @param {string|object} level 급 키 또는 레벨 객체
 * @param {string} testKey 'disc'|'mbti'|'mi'|'riasec'
 */
export function getTest(level, testKey) {
  const t = getTests(level).find((x) => x.key === testKey);
  if (!t) throw new Error(`알 수 없는 검사 키: ${testKey}`);
  return t;
}

/** 해당 검사의 다음 검사 키 (마지막이면 null) */
export function nextTestKey(testKey) {
  const i = TEST_KEYS.indexOf(testKey);
  return i >= 0 && i < TEST_KEYS.length - 1 ? TEST_KEYS[i + 1] : null;
}

/** 해당 검사의 이전 검사 키 (처음이면 null) */
export function prevTestKey(testKey) {
  const i = TEST_KEYS.indexOf(testKey);
  return i > 0 ? TEST_KEYS[i - 1] : null;
}

/** 그 급의 전체 문항 수 (초등 66 · 중학 110 · 고교 154) */
export function totalQuestions(level) {
  return getTests(level).reduce((n, t) => n + t.count, 0);
}

/** 그 급의 검사별 문항 수 맵 { disc, mbti, mi, riasec } */
export function questionCounts(level) {
  const out = {};
  for (const t of getTests(level)) out[t.key] = t.count;
  return out;
}

/** 그 급의 검사별 예상 소요 시간(분) 맵. 합은 levels.js 의 estMinutes 와 같다. */
export function estMinutesByTest(level) {
  const out = {};
  for (const t of getTests(level)) out[t.key] = t.estMinutes;
  return out;
}

/** 그 급의 전체 예상 소요 시간(분) */
export function totalEstMinutes(level) {
  return getTests(level).reduce((n, t) => n + t.estMinutes, 0);
}
