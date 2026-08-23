// 문항 데이터 검증 스크립트 — 학교급(초·중·고)별 문항 수·유형 분포·중복 여부를 실제로 세어서 확인한다.
// levels.js 의 counts / perScale / total 을 기준(정답)으로 삼아 disc·mbti·mi·riasec 데이터와 대조한다.
// 문제가 하나라도 있으면 한국어로 이유를 출력하고 exit code 1 로 종료한다. (npm run check)

import { LEVELS } from '../public/js/data/levels.js';
import { DISC_QUESTIONS } from '../public/js/data/disc.js';
import { MBTI_QUESTIONS, MBTI_AXES } from '../public/js/data/mbti.js';
import { MI_QUESTIONS } from '../public/js/data/mi.js';
import { RIASEC_QUESTIONS } from '../public/js/data/riasec.js';

/* ─────────────────────────── 검사 정의 ─────────────────────────── */

// scales = 그 검사가 가진 척도(유형) 목록. perScale × scales.length 가 곧 문항 수가 된다.
const TESTS = [
  {
    key: 'disc',
    name: 'DISC 행동유형',
    data: DISC_QUESTIONS,
    scales: ['D', 'I', 'S', 'C'],
    kind: 'likert',
  },
  {
    key: 'mbti',
    name: 'MBTI 성격유형',
    data: MBTI_QUESTIONS,
    scales: MBTI_AXES.map((axis) => axis.key),
    kind: 'ab',
  },
  {
    key: 'mi',
    name: '다중지능(MI)',
    data: MI_QUESTIONS,
    scales: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    kind: 'likert',
  },
  {
    key: 'riasec',
    name: 'RIASEC 직업흥미',
    data: RIASEC_QUESTIONS,
    scales: ['R', 'I', 'A', 'S', 'E', 'C'],
    kind: 'likert',
  },
];

/* ─────────────────────────── 오류 수집 ─────────────────────────── */

const problems = [];
const notes = [];

const fail = (where, message) => problems.push(`${where} ${message}`);

/** 공백만 있는 값도 비어 있는 것으로 본다. */
const isBlank = (v) => typeof v !== 'string' || v.trim() === '';

/** 중복 판정을 위해 공백을 정규화한다. */
const norm = (v) => String(v).replace(/\s+/g, ' ').trim();

/* ─────────────────────────── 검사 하나 검증 ─────────────────────────── */

function checkOne(level, test) {
  const where = `[${level.label} · ${test.name}]`;
  const expected = level.counts[test.key];

  if (typeof expected !== 'number') {
    fail(where, `levels.js 의 counts 에 "${test.key}" 항목이 없습니다. levels.js 정의를 확인하세요.`);
    return 0;
  }

  const list = test.data[level.key];
  if (!Array.isArray(list)) {
    fail(where, `"${level.key}" 학교급 문항 배열이 없습니다. (levels.js 는 ${expected}문항을 기대합니다)`);
    return 0;
  }

  /* 1) 전체 문항 수 */
  if (list.length !== expected) {
    const diff = list.length - expected;
    fail(
      where,
      `문항 수가 맞지 않습니다. 기대 ${expected}문항 / 실제 ${list.length}문항 ` +
        `(${diff > 0 ? `${diff}개 많음` : `${-diff}개 부족`}).`,
    );
  }

  /* 2) 유형별 개수가 균등한가 (척도당 perScale 문항) */
  const perScale = level.perScale;
  const tally = new Map(test.scales.map((s) => [s, 0]));

  list.forEach((q, i) => {
    const no = i + 1; // 사람이 세는 번호
    const spot = `${no}번 문항`;

    if (!q || typeof q !== 'object') {
      fail(where, `${spot}이 객체가 아닙니다.`);
      return;
    }

    // 유형(type) 확인
    if (isBlank(q.type)) {
      fail(where, `${spot}에 type 이 없습니다.`);
    } else if (!tally.has(q.type)) {
      fail(
        where,
        `${spot}의 type "${q.type}" 은(는) 이 검사에 없는 유형입니다. ` +
          `사용 가능: ${test.scales.join(', ')}.`,
      );
    } else {
      tally.set(q.type, tally.get(q.type) + 1);
    }

    // 문항 본문 확인
    if (test.kind === 'ab') {
      if (isBlank(q.q)) fail(where, `${spot}의 질문(q)이 비어 있습니다.`);
      if (isBlank(q.a)) fail(where, `${spot}의 a 선택지가 비어 있습니다. (${q.q || '질문 없음'})`);
      if (isBlank(q.b)) fail(where, `${spot}의 b 선택지가 비어 있습니다. (${q.q || '질문 없음'})`);
      if (!isBlank(q.a) && !isBlank(q.b) && norm(q.a) === norm(q.b)) {
        fail(where, `${spot}의 a 와 b 선택지 내용이 같습니다. (${q.q || '질문 없음'})`);
      }
    } else if (isBlank(q.text)) {
      fail(where, `${spot}의 text 가 비어 있습니다.`);
    }
  });

  for (const scale of test.scales) {
    const got = tally.get(scale);
    if (got !== perScale) {
      fail(
        where,
        `"${scale}" 유형 문항이 ${got}개입니다. 유형마다 ${perScale}개씩이어야 합니다. ` +
          `(현재 분포: ${test.scales.map((s) => `${s}=${tally.get(s)}`).join(' / ')})`,
      );
    }
  }

  /* 3) 중복 문항 */
  const seen = new Map(); // 정규화한 본문 -> 먼저 나온 번호
  list.forEach((q, i) => {
    if (!q || typeof q !== 'object') return;
    const body = test.kind === 'ab' ? q.q : q.text;
    if (isBlank(body)) return;
    const key = norm(body);
    if (seen.has(key)) {
      fail(where, `${i + 1}번 문항이 ${seen.get(key)}번 문항과 내용이 같습니다: "${key}"`);
    } else {
      seen.set(key, i + 1);
    }
  });

  return list.length;
}

/* ─────────────────────────── 실행 ─────────────────────────── */

console.log('문항 데이터 검증을 시작합니다.\n');

if (!Array.isArray(LEVELS) || LEVELS.length === 0) {
  console.error('levels.js 에서 LEVELS 를 읽지 못했습니다.');
  process.exit(1);
}

for (const level of LEVELS) {
  let sum = 0;
  const parts = [];

  for (const test of TESTS) {
    const n = checkOne(level, test);
    sum += n;
    parts.push(`${test.name} ${n}`);
  }

  // 척도 수 × perScale 이 counts 와 맞는지도 확인한다 (levels.js 내부 정합성)
  for (const test of TESTS) {
    const expected = level.counts[test.key];
    const derived = level.perScale * test.scales.length;
    if (typeof expected === 'number' && expected !== derived) {
      fail(
        `[${level.label} · ${test.name}]`,
        `levels.js 안에서 어긋납니다. perScale ${level.perScale} × 유형 ${test.scales.length}개 = ${derived} 인데 counts 는 ${expected} 입니다.`,
      );
    }
  }

  // 전체 합계
  if (typeof level.total === 'number' && sum !== level.total) {
    fail(`[${level.label}]`, `전체 문항 합계가 ${sum}개입니다. levels.js 의 total 은 ${level.total} 입니다.`);
  }

  notes.push(`  ${level.emoji || '•'} ${level.label} — 합계 ${sum}문항 (${parts.join(' / ')})`);
}

console.log('학교급별 문항 수');
notes.forEach((line) => console.log(line));
console.log('');

if (problems.length > 0) {
  console.error(`문제를 ${problems.length}건 발견했습니다.\n`);
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`));
  console.error('\n위 내용을 고친 뒤 다시 실행해 주세요:  npm run check');
  process.exit(1);
}

console.log('모든 검사를 통과했습니다. 문항 수, 유형 분포, MBTI 선택지, 중복 여부 모두 정상입니다.');
