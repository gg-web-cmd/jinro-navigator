// 학교급 정의 — 초·중·고 세 갈래. 문항 세트, 어휘 수준, 보고서 조언 방향이 모두 이 값으로 갈린다.
// perScale = 척도(유형) 하나당 문항 수. 이 숫자가 각 검사의 문항 수를 결정한다.

export const LEVELS = [
  {
    key: 'elem',
    label: '초등학생',
    grades: '4~6학년',
    emoji: '🌱',
    perScale: 3,
    tone: 'easy', // 쉬운 어휘 버전의 유형 설명을 쓴다
    counts: { disc: 12, mbti: 12, mi: 24, riasec: 18 },
    total: 66,
    estMinutes: 15,
    // 진로교육 발달 단계 (교육부 학교진로교육 목표와 성취기준 체계)
    stage: '진로 인식',
    stageDesc: '일과 직업의 세계가 얼마나 넓은지 알아보고, 내가 무엇을 좋아하는지 발견하는 시기',
    policy:
      '아직 학과나 대학을 정할 때가 아닙니다. 다양한 직업의 세계를 구경하고, 좋아하는 활동을 더 많이 해보도록 안내합니다. ' +
      '창의적 체험활동의 진로활동, 실과 수업, 학교 동아리와 연결지어 제안합니다.',
    blurb: '내가 좋아하는 것과 잘하는 것을 찾아보는 검사예요.',
  },
  {
    key: 'mid',
    label: '중학생',
    grades: '1~3학년',
    emoji: '🌿',
    perScale: 5,
    tone: 'standard',
    counts: { disc: 20, mbti: 20, mi: 40, riasec: 30 },
    total: 110,
    estMinutes: 25,
    stage: '진로 탐색',
    stageDesc: '여러 진로를 직접 겪어보며 나에게 맞는 방향을 좁혀가는 시기',
    policy:
      '자유학기(자유학년) 주제선택·진로탐색 활동, 3학년 2학기 진로연계학기, 동아리 선택과 연결지어 제안합니다. ' +
      '고등학교 유형(일반고·특성화고·특목고·마이스터고) 선택에 참고가 될 만한 힌트를 함께 줍니다. ' +
      '학과 추천은 "이런 계열을 눈여겨보라" 수준으로 넓게 제시합니다.',
    blurb: '나의 성향과 흥미를 알아보고 진로 방향을 넓게 탐색해요.',
  },
  {
    key: 'high',
    label: '고등학생',
    grades: '1~3학년',
    emoji: '🌳',
    perScale: 7,
    tone: 'standard',
    counts: { disc: 28, mbti: 28, mi: 56, riasec: 42 },
    total: 154,
    estMinutes: 35,
    stage: '진로 설계',
    stageDesc: '구체적인 전공과 진로를 정하고 그에 맞는 준비를 실행에 옮기는 시기',
    policy:
      '고교학점제에서 어떤 선택과목을 고르면 좋을지 구체적으로 제안합니다(일반선택·진로선택·융합선택 중심). ' +
      '학교생활기록부에 남길 만한 탐구활동·동아리·독서 방향을 학생부 관점에서 제시합니다. ' +
      '학과는 실제 존재하는 학과명으로 구체적으로 추천합니다.',
    blurb: '전공과 진로를 구체적으로 설계하기 위한 정밀 검사예요.',
  },
];

export const LEVEL_KEYS = LEVELS.map((l) => l.key);

export const DEFAULT_LEVEL = 'mid';

export function getLevel(key) {
  return LEVELS.find((l) => l.key === key) || LEVELS.find((l) => l.key === DEFAULT_LEVEL);
}

/** 초등급은 쉬운 어휘 버전의 유형 설명을 쓴다 */
export function isEasy(levelKey) {
  return getLevel(levelKey).tone === 'easy';
}

export function isValidLevel(key) {
  return LEVEL_KEYS.includes(key);
}
