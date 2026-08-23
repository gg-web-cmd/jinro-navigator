// 규칙 기반 급별 폴백 보고서 생성기.
// AI(Upstage) 연결이 안 될 때, 학교급(elem/mid/high)에 맞는 데이터 표를 골라 마크다운 보고서를 만든다.
// 초등은 쉬운 말과 직업 세계·보물지도로, 중학은 자유학기·동아리·고교 유형으로, 고교는 선택과목·학생부·학과로 갈린다.

import { getLevel, isEasy } from '../public/js/data/levels.js';
import { DISC_TYPES, DISC_TYPES_EASY } from '../public/js/data/disc.js';
import { MBTI_RESULTS, MBTI_RESULTS_EASY } from '../public/js/data/mbti-results.js';
import {
  MI_TYPES,
  MI_TYPES_EASY,
  MI_COMBOS,
  MI_COMBOS_EASY,
  getCombo,
} from '../public/js/data/mi-types.js';
import { RIASEC_TYPES, RIASEC_TYPES_EASY } from '../public/js/data/riasec.js';

/* ─────────────────────────── 보조 표현 데이터 (중·고등) ─────────────────────────── */

// DISC 유형별 한 줄 표현 (보고서 문장을 조립할 때 쓰는 조각)
const DISC_TRAIT = {
  D: {
    force: '목표를 향해 밀고 나가는 추진력',
    verb: '빠르게 결정하고 곧바로 실행하는',
    team: '앞장서서 방향을 정하는 자리',
    grow: '결정이 빠른 만큼, 함께 가는 친구들의 속도와 마음을 한 번 더 살펴보면 훨씬 든든한 리더가 될 수 있어요.',
  },
  I: {
    force: '사람들을 밝게 만드는 에너지',
    verb: '이야기를 나누며 분위기를 이끄는',
    team: '팀에 활력을 불어넣고 사람을 모으는 자리',
    grow: '여러 일에 마음이 끌리기 쉬우니, 시작한 일 하나를 끝까지 마무리하는 연습을 더하면 실력이 눈에 보이게 쌓여요.',
  },
  S: {
    force: '한결같이 곁을 지키는 성실함',
    verb: '차분히 듣고 꾸준히 돕는',
    team: '팀의 갈등을 다독이고 뒤를 받쳐 주는 자리',
    grow: '남을 먼저 배려하다 보면 내 의견을 미루기 쉬워요. 하고 싶은 말을 부드럽게 표현하는 연습을 해 보면 좋아요.',
  },
  C: {
    force: '빈틈을 찾아내는 정확함',
    verb: '자료를 살펴 근거를 세우고 계획하는',
    team: '완성도를 책임지고 점검하는 자리',
    grow: '완벽하게 하려다 시작이 늦어질 때가 있어요. "일단 70%로 해 보고 고친다"는 마음가짐이 큰 힘이 됩니다.',
  },
};

// 초등용 DISC 조각 — 같은 자리에 쉬운 말로
const DISC_TRAIT_EASY = {
  D: {
    force: '먼저 나서는 용기',
    verb: '하고 싶은 일을 바로 해 보는',
    team: '앞에서 이끄는 자리',
    grow: '빨리 정하는 만큼, 친구들 마음도 한 번 물어봐 주면 더 멋진 대장이 돼요.',
  },
  I: {
    force: '사람들을 웃게 하는 힘',
    verb: '친구들과 어울리며 분위기를 만드는',
    team: '분위기를 밝게 만드는 자리',
    grow: '하고 싶은 게 많아서 이것저것 시작하기 쉬워요. 하나를 끝까지 해 보면 실력이 쑥 자라요.',
  },
  S: {
    force: '끝까지 곁을 지키는 다정함',
    verb: '잘 들어 주고 꾸준히 돕는',
    team: '친구들 사이를 이어 주는 자리',
    grow: '친구를 먼저 챙기다 보면 내 마음을 말하지 못할 때가 있어요. 하고 싶은 말을 한 번 해 보세요.',
  },
  C: {
    force: '빠진 곳을 찾아내는 꼼꼼함',
    verb: '잘 살펴보고 순서를 정하는',
    team: '틀린 곳이 없는지 확인하는 자리',
    grow: '완벽하게 하려다 시작이 늦어질 수 있어요. "일단 해 보고 고치자"라고 마음먹어 보세요.',
  },
};

// DISC 1순위+2순위 조합 해설 (12가지)
const DISC_PAIR = {
  DI: '결정이 빠르면서 사람들과도 잘 어울려요. 목표를 정하면 친구들을 설득해 함께 움직이게 만드는, 앞에서 끌고 가는 리더 스타일입니다.',
  DS: '겉으로는 단호하지만 속은 따뜻해요. 목표는 분명하게 잡되 팀원이 힘들어하면 기다려 줄 줄 아는, 믿음직한 추진력을 가졌습니다.',
  DC: '목표와 정확함을 둘 다 놓치지 않아요. 계획을 촘촘히 세운 뒤 강하게 밀어붙이기 때문에 결과의 완성도가 높습니다.',
  ID: '분위기를 띄우다가도 결정할 때는 과감해요. 사람들의 마음을 얻은 뒤 그 힘으로 일을 크게 벌여 나가는 스타일입니다.',
  IS: '함께 있으면 마음이 편해지는 사람이에요. 밝은 에너지에 배려심이 더해져 어떤 모임에서도 사람들을 이어 주는 다리가 됩니다.',
  IC: '표현은 자유롭지만 마무리는 꼼꼼해요. 아이디어를 재미있게 풀어내면서도 근거를 챙기기 때문에 설득력이 남다릅니다.',
  SD: '평소엔 조용하지만 중요한 순간에는 앞으로 나서요. 오래 참고 지켜보다가 결정적일 때 책임지는 든든한 사람입니다.',
  SI: '따뜻하고 편안한 분위기를 만드는 사람이에요. 먼저 들어 주고 공감해 주기 때문에 친구들이 속마음을 털어놓습니다.',
  SC: '조용하고 성실하며 실수가 적어요. 맡은 일을 끝까지 정확하게 해내기 때문에 주변에서 가장 믿고 맡기는 사람이 됩니다.',
  CD: '분석한 다음 곧바로 실행에 옮겨요. 근거로 무장한 뒤 밀어붙이기 때문에 어려운 과제일수록 힘을 발휘합니다.',
  CI: '깊이 있게 파고들면서도 그것을 재미있게 설명할 줄 알아요. 어려운 내용을 쉽게 풀어 주는 재능이 있습니다.',
  CS: '꼼꼼함과 배려가 함께 있어요. 세심하게 챙기고 조용히 도와주기 때문에 팀의 완성도와 분위기를 동시에 지켜 줍니다.',
};

// 초등용 DISC 조합 해설 (12가지, 짧게)
const DISC_PAIR_EASY = {
  DI: '앞장서면서 친구들과도 잘 지내요. "이거 하자!" 하고 말하면 친구들이 따라오는 대장이에요.',
  DS: '겉으로는 씩씩하지만 마음은 따뜻해요. 앞장서면서도 뒤처진 친구를 기다려 줄 줄 알아요.',
  DC: '하고 싶은 일을 정하면 순서까지 꼼꼼하게 정해요. 그래서 시작한 일을 잘 끝내요.',
  ID: '재미있게 놀다가도 정할 때는 딱 정해요. 친구들을 모아 새로운 놀이를 만들어 내는 힘이 있어요.',
  IS: '같이 있으면 마음이 편해지는 친구예요. 밝고 다정해서 친구들이 많이 모여요.',
  IC: '재미있게 말하면서도 틀린 게 없는지 확인해요. 발표할 때 특히 빛나요.',
  SD: '평소엔 조용하지만 꼭 필요한 순간에는 앞으로 나서요. 참을성이 아주 커요.',
  SI: '따뜻하고 다정해서 친구들이 속마음을 이야기해요. 잘 들어주는 힘이 있어요.',
  SC: '조용하고 성실해서 실수가 적어요. 맡은 일을 끝까지 해내서 어른들이 믿고 맡겨요.',
  CD: '먼저 잘 살펴본 다음에 바로 해 봐요. 어려운 일일수록 더 힘이 나요.',
  CI: '깊이 알아보고 그걸 재미있게 알려 줘요. 어려운 걸 쉽게 설명하는 재주가 있어요.',
  CS: '꼼꼼하고 다정해요. 조용히 챙겨 주어서 모둠 일이 깔끔하게 끝나요.',
};

// RIASEC 유형별 조각
const RIASEC_TRAIT = {
  R: { doing: '직접 손과 몸을 써서 만들고 고치는 일', joy: '눈앞에 결과물이 만들어질 때', env: '실습실, 작업장, 운동장처럼 몸을 움직일 수 있는 곳' },
  I: { doing: '원리를 파고들어 답을 찾아내는 일', joy: '몰랐던 이유를 알아냈을 때', env: '연구실, 실험실처럼 조용히 집중할 수 있는 곳' },
  A: { doing: '내 감각으로 새로운 것을 만들어 표현하는 일', joy: '나만의 색깔이 담긴 작품이 나왔을 때', env: '작업실, 스튜디오처럼 자유롭게 시도할 수 있는 곳' },
  S: { doing: '사람을 돕고 가르치며 함께 성장하는 일', joy: '내 도움으로 누군가가 웃을 때', env: '학교, 상담실, 병원처럼 사람을 마주하는 곳' },
  E: { doing: '사람들을 모으고 설득해 일을 벌이는 일', joy: '내가 세운 목표를 팀과 함께 이뤘을 때', env: '회의실, 무대, 시장처럼 움직임이 빠른 곳' },
  C: { doing: '자료를 정리하고 절차대로 정확히 처리하는 일', joy: '흐트러진 것이 깔끔하게 맞아떨어질 때', env: '사무실, 도서관처럼 질서가 잡힌 곳' },
};

// 초등용 RIASEC 조각
const RIASEC_TRAIT_EASY = {
  R: { doing: '손으로 만들고 고치고 몸을 쓰는 일', joy: '내가 만든 것이 진짜로 움직일 때', env: '만들기 교실, 운동장처럼 몸을 쓸 수 있는 곳' },
  I: { doing: '궁금한 것을 끝까지 알아내는 일', joy: '"아, 이래서 그렇구나!" 하고 알게 될 때', env: '과학실, 도서관처럼 조용히 집중할 수 있는 곳' },
  A: { doing: '내 마음대로 새로운 것을 만들어 보여 주는 일', joy: '나만의 작품이 완성되었을 때', env: '미술실, 음악실처럼 자유롭게 해 볼 수 있는 곳' },
  S: { doing: '친구를 돕고 함께하는 일', joy: '내 덕분에 누군가 웃을 때', env: '교실, 보건실처럼 사람을 만나는 곳' },
  E: { doing: '친구들을 모아 새로운 일을 벌이는 일', joy: '내가 정한 목표를 다 같이 해냈을 때', env: '무대, 운동장처럼 신나게 움직이는 곳' },
  C: { doing: '차례대로 정리하고 정확하게 하는 일', joy: '어질러진 것이 딱 맞게 정리되었을 때', env: '조용하고 깔끔하게 정돈된 곳' },
};

/* ─────────────────────────── 진로 후보 풀 (급별) ─────────────────────────── */
// 세 풀 모두 { r, mi, disc } 로 매칭 점수를 매긴다. 같은 채점 함수(affinity)를 함께 쓴다.

// 고교 — 실제 존재하는 구체 학과명
const MAJORS = [
  { name: '기계공학과', r: ['R', 'I'], mi: ['B', 'C', 'D'], disc: ['C'], why: '원리를 이해하고 직접 만들어 확인하는 공부' },
  { name: '로봇공학과', r: ['R', 'I'], mi: ['B', 'C', 'D'], disc: ['C', 'D'], why: '기계와 프로그램을 함께 다루는 공부' },
  { name: '체육교육과·스포츠과학과', r: ['R', 'S'], mi: ['D', 'F'], disc: ['D', 'I'], why: '몸을 쓰는 즐거움을 사람들과 나누는 공부' },
  { name: '외식조리학과', r: ['R', 'A'], mi: ['D', 'C'], disc: ['I', 'S'], why: '손끝의 감각으로 결과물을 완성하는 공부' },
  { name: '수의예과', r: ['R', 'I'], mi: ['H', 'B'], disc: ['S', 'C'], why: '생명을 관찰하고 돌보는 공부' },
  { name: '컴퓨터공학과·인공지능학과', r: ['I', 'R'], mi: ['B', 'C'], disc: ['C', 'D'], why: '논리로 문제를 풀어 실제 서비스를 만드는 공부' },
  { name: '데이터사이언스학과', r: ['I', 'C'], mi: ['B', 'G'], disc: ['C'], why: '숫자 속 규칙을 찾아 미래를 예측하는 공부' },
  { name: '수학과·통계학과', r: ['I', 'C'], mi: ['B'], disc: ['C'], why: '깊이 생각하는 힘을 끝까지 밀어붙이는 공부' },
  { name: '생명과학과', r: ['I', 'R'], mi: ['H', 'B'], disc: ['C', 'S'], why: '살아 있는 것들의 원리를 탐구하는 공부' },
  { name: '의예과·간호학과', r: ['I', 'S'], mi: ['B', 'F', 'D'], disc: ['S', 'C'], why: '지식으로 사람을 살리는 공부' },
  { name: '심리학과', r: ['I', 'S'], mi: ['G', 'F', 'A'], disc: ['S', 'C'], why: '사람의 마음을 과학으로 이해하는 공부' },
  { name: '시각디자인학과', r: ['A', 'E'], mi: ['C', 'A'], disc: ['I', 'C'], why: '생각을 보이는 형태로 바꾸는 공부' },
  { name: '애니메이션학과·웹툰학과', r: ['A'], mi: ['C', 'A'], disc: ['I', 'C'], why: '그림과 이야기를 함께 다루는 공부' },
  { name: '문예창작학과·국어국문학과', r: ['A', 'S'], mi: ['A', 'G'], disc: ['S', 'C'], why: '언어로 세상을 그려 내는 공부' },
  { name: '실용음악과', r: ['A'], mi: ['E', 'D'], disc: ['I'], why: '소리로 감정을 전하는 공부' },
  { name: '연극영화학과', r: ['A', 'E'], mi: ['D', 'A', 'F'], disc: ['I', 'D'], why: '표현과 협업이 함께 필요한 공부' },
  { name: '건축학과', r: ['A', 'R'], mi: ['C', 'B'], disc: ['C', 'D'], why: '아름다움과 계산을 동시에 다루는 공부' },
  { name: '초등교육과·교육학과', r: ['S', 'A'], mi: ['A', 'F'], disc: ['S', 'I'], why: '아는 것을 쉽게 전해 주는 공부' },
  { name: '사회복지학과', r: ['S'], mi: ['F', 'G'], disc: ['S'], why: '도움이 필요한 사람 곁에 서는 공부' },
  { name: '상담심리학과', r: ['S', 'I'], mi: ['G', 'F'], disc: ['S', 'C'], why: '듣는 힘을 전문 기술로 키우는 공부' },
  { name: '유아교육과·아동학과', r: ['S', 'A'], mi: ['F', 'E', 'D'], disc: ['S', 'I'], why: '아이의 성장을 함께 만드는 공부' },
  { name: '경영학과', r: ['E', 'C'], mi: ['B', 'F'], disc: ['D', 'I'], why: '사람과 자원을 움직여 성과를 내는 공부' },
  { name: '경제학과', r: ['E', 'I'], mi: ['B', 'A'], disc: ['D', 'C'], why: '세상이 돌아가는 규칙을 숫자로 읽는 공부' },
  { name: '미디어커뮤니케이션학과·광고홍보학과', r: ['E', 'A'], mi: ['A', 'F', 'C'], disc: ['I', 'D'], why: '메시지로 사람의 마음을 움직이는 공부' },
  { name: '법학과·정치외교학과', r: ['E', 'S'], mi: ['A', 'B'], disc: ['D', 'C'], why: '근거와 말로 공정한 답을 찾는 공부' },
  { name: '회계학과·세무학과', r: ['C', 'E'], mi: ['B', 'G'], disc: ['C'], why: '숫자를 정확하게 다루어 신뢰를 만드는 공부' },
  { name: '행정학과·공공정책학과', r: ['C', 'S'], mi: ['A', 'F'], disc: ['S', 'C'], why: '규칙과 제도로 사회를 받쳐 주는 공부' },
  { name: '문헌정보학과', r: ['C', 'I'], mi: ['A', 'G'], disc: ['C', 'S'], why: '지식을 정리해 필요한 사람에게 잇는 공부' },
  { name: '환경공학과·산림조경학과', r: ['R', 'I'], mi: ['H', 'C'], disc: ['S', 'C'], why: '자연을 관찰하고 지켜 내는 공부' },
  { name: '산업디자인학과', r: ['A', 'R'], mi: ['C', 'D'], disc: ['C', 'I'], why: '쓰기 편하고 아름다운 물건을 만드는 공부' },
];

// 중학 — 아직 학과를 정할 때가 아니므로 "계열" 수준으로 넓게. hs 는 고등학교 유형 힌트.
const FIELDS = [
  { name: '공학 계열', r: ['R', 'I'], mi: ['B', 'C', 'D'], disc: ['C', 'D'], why: '원리를 이해하고 직접 만들어 확인하는 분야', hs: '일반고 과학·기술 중점 과정이나 공업 계열 특성화고·마이스터고' },
  { name: 'IT·데이터 계열', r: ['I', 'C'], mi: ['B', 'C'], disc: ['C', 'D'], why: '논리로 문제를 풀어 프로그램과 서비스를 만드는 분야', hs: '일반고, 소프트웨어 마이스터고, IT 특성화고' },
  { name: '자연과학 계열', r: ['I', 'R'], mi: ['B', 'H'], disc: ['C', 'S'], why: '세상이 움직이는 원리를 실험으로 확인하는 분야', hs: '일반고 과학중점학급, 과학고' },
  { name: '의학·보건 계열', r: ['S', 'I'], mi: ['B', 'F', 'D'], disc: ['S', 'C'], why: '지식으로 사람의 건강을 지키는 분야', hs: '일반고(과학·생명 과목을 두텁게 듣는 과정)' },
  { name: '교육 계열', r: ['S', 'A'], mi: ['A', 'F'], disc: ['S', 'I'], why: '아는 것을 쉽게 풀어 다른 사람에게 전하는 분야', hs: '일반고' },
  { name: '사회복지·상담 계열', r: ['S'], mi: ['F', 'G'], disc: ['S'], why: '도움이 필요한 사람 곁에 서는 분야', hs: '일반고' },
  { name: '예술·디자인 계열', r: ['A'], mi: ['C', 'E', 'D'], disc: ['I', 'C'], why: '생각과 감정을 보이는 형태로 바꾸는 분야', hs: '예술고, 일반고 미술·음악 중점 과정, 디자인 특성화고' },
  { name: '미디어·콘텐츠 계열', r: ['A', 'E'], mi: ['A', 'C'], disc: ['I', 'D'], why: '이야기와 영상으로 사람의 마음을 움직이는 분야', hs: '일반고, 방송·콘텐츠 특성화고' },
  { name: '경영·경제 계열', r: ['E', 'C'], mi: ['B', 'F'], disc: ['D', 'I'], why: '사람과 자원을 움직여 성과를 만드는 분야', hs: '일반고, 상업·비즈니스 특성화고' },
  { name: '법·행정 계열', r: ['E', 'S', 'C'], mi: ['A', 'B'], disc: ['D', 'C'], why: '근거와 규칙으로 공정한 답을 찾는 분야', hs: '일반고' },
  { name: '농생명·환경 계열', r: ['R', 'I'], mi: ['H', 'C'], disc: ['S', 'C'], why: '생명과 자연을 살피고 지켜 내는 분야', hs: '일반고, 농생명 계열 특성화고' },
  { name: '어문·인문 계열', r: ['A', 'S'], mi: ['A', 'G'], disc: ['S', 'C'], why: '언어와 사람의 생각을 깊이 들여다보는 분야', hs: '일반고, 외국어고·국제고' },
];

// 초등 — 학과 대신 "직업 세계". 구경하고 궁금해하는 것이 목표다.
const KID_WORLDS = [
  { name: '만들고 고치는 세계', r: ['R'], mi: ['C', 'D'], jobs: ['목수', '자동차 정비사', '로봇 만드는 사람', '드론 조종사', '건축가'], wonder: '집에서 고쳐 보고 싶은 물건을 한 가지 찾아보기' },
  { name: '궁금한 것을 밝혀내는 세계', r: ['I'], mi: ['B'], jobs: ['과학자', '의사', '우주 연구원', '컴퓨터 프로그래머', '발명가'], wonder: '요즘 가장 궁금한 질문 세 개를 적어 보기' },
  { name: '그리고 꾸미는 세계', r: ['A'], mi: ['C'], jobs: ['웹툰 작가', '디자이너', '사진작가', '애니메이션 감독', '게임 그림 작가'], wonder: '좋아하는 그림이나 캐릭터를 따라 그린 뒤 내 방식으로 바꿔 보기' },
  { name: '소리와 노래의 세계', r: ['A'], mi: ['E'], jobs: ['가수', '작곡가', '음악 선생님', '공연 기획자', '음향 감독'], wonder: '좋아하는 노래가 왜 좋은지 이유를 말해 보기' },
  { name: '사람을 돕는 세계', r: ['S'], mi: ['F', 'G'], jobs: ['간호사', '상담 선생님', '사회복지사', '유치원 선생님', '응급구조사'], wonder: '오늘 도와준 사람과 도움받은 사람을 하나씩 적어 보기' },
  { name: '가르치고 알려 주는 세계', r: ['S', 'A'], mi: ['A', 'F'], jobs: ['학교 선생님', '도서관 사서', '박물관 해설사', '과학관 선생님', '공부를 알려 주는 크리에이터'], wonder: '내가 잘 아는 것 한 가지를 친구에게 설명해 보기' },
  { name: '앞장서서 이끄는 세계', r: ['E'], mi: ['F', 'A'], jobs: ['가게 사장님', '행사 기획자', '운동팀 주장', '아나운서', '시청·군청에서 일하는 사람'], wonder: '우리 반에서 해 보고 싶은 행사를 하나 계획해 보기' },
  { name: '정리하고 지키는 세계', r: ['C'], mi: ['B', 'G'], jobs: ['은행원', '경찰관', '공무원', '회계사', '자료를 정리하는 사람'], wonder: '내 책상과 사물함을 나만의 규칙으로 정리해 보기' },
  { name: '생명과 자연을 돌보는 세계', r: ['R', 'I'], mi: ['H'], jobs: ['수의사', '사육사', '농부', '숲 해설사', '환경을 지키는 사람'], wonder: '식물이나 반려동물 하나를 맡아 일주일 동안 돌봐 보기' },
  { name: '몸으로 겨루고 보여 주는 세계', r: ['R', 'E'], mi: ['D'], jobs: ['운동선수', '체육 선생님', '댄서', '소방관', '운동팀 감독'], wonder: '좋아하는 운동을 정해 일주일에 세 번 해 보기' },
];

// 세상에 기여하는 역할 풀 (동사형 서술 + 구체 직업 5개) — 중·고교에서 쓴다.
const ROLES = [
  { text: '복잡한 문제를 논리로 풀어 사람들의 불편을 없애는 역할', jobs: ['프로그래머', '데이터 분석가', '시스템 엔지니어', '알고리즘 연구원', 'IT 컨설턴트'], r: ['I'], mi: ['B'] },
  { text: '눈에 보이지 않던 아이디어를 눈에 보이는 작품으로 만들어 주는 역할', jobs: ['그래픽 디자이너', '웹툰 작가', '영상 감독', '제품 디자이너', '아트 디렉터'], r: ['A'], mi: ['C', 'A'] },
  { text: '지친 마음을 살펴 다시 일어설 힘을 건네는 역할', jobs: ['상담심리사', '사회복지사', '특수교사', '청소년지도사', '임상심리사'], r: ['S'], mi: ['F', 'G'] },
  { text: '어려운 지식을 쉽게 풀어 다음 사람에게 건네주는 역할', jobs: ['교사', '학습 코치', '교육 콘텐츠 기획자', '과학 커뮤니케이터', '교육 크리에이터'], r: ['S', 'A'], mi: ['A', 'F'] },
  { text: '흩어진 자료를 정리해 조직이 흔들리지 않게 받쳐 주는 역할', jobs: ['회계사', '세무사', '공무원', '데이터베이스 관리자', '사서'], r: ['C'], mi: ['B', 'G'] },
  { text: '사람들을 모으고 설득해 없던 일을 새로 시작하는 역할', jobs: ['창업가', '마케터', '브랜드 매니저', '홍보 전문가', '프로젝트 매니저'], r: ['E'], mi: ['F', 'A'] },
  { text: '몸과 손을 써서 세상을 실제로 움직이고 고치는 역할', jobs: ['기계 엔지니어', '로봇 개발자', '요리사', '물리치료사', '소방관'], r: ['R'], mi: ['D', 'C'] },
  { text: '생명과 자연을 돌보고 지켜 내는 역할', jobs: ['수의사', '생명과학 연구원', '환경 컨설턴트', '조경가', '산림 전문가'], r: ['R', 'I'], mi: ['H'] },
  { text: '소리와 리듬으로 사람들의 감정을 어루만지는 역할', jobs: ['작곡가', '음향 감독', '음악 치료사', '공연 기획자', '사운드 디자이너'], r: ['A'], mi: ['E'] },
  { text: '규칙과 근거로 사람들 사이의 갈등을 공정하게 정리하는 역할', jobs: ['변호사', '판사', '노무사', '법무 담당자', '정책 연구원'], r: ['E', 'C'], mi: ['A', 'B'] },
  { text: '건강을 살펴 아픈 사람을 낫게 하는 역할', jobs: ['의사', '간호사', '약사', '응급구조사', '재활치료사'], r: ['S', 'I'], mi: ['B', 'D'] },
  { text: '숫자와 데이터로 미래를 내다보고 좋은 결정을 돕는 역할', jobs: ['데이터 사이언티스트', '금융 애널리스트', '통계 연구원', '시장조사 전문가', '보험계리사'], r: ['I', 'C'], mi: ['B'] },
  { text: '이야기를 만들어 사람들의 마음을 움직이는 역할', jobs: ['작가', '기자', '시나리오 작가', '카피라이터', '출판 편집자'], r: ['A', 'S'], mi: ['A'] },
  { text: '공간을 설계해 사람들이 편하게 지낼 곳을 만드는 역할', jobs: ['건축가', '도시계획가', '인테리어 디자이너', '공간 기획자', '무대 디자이너'], r: ['R', 'A'], mi: ['C'] },
];

// 고교학점제 선택과목 제안 풀 (2022 개정 교육과정 과목명 기준)
const SUBJECTS = [
  { name: '미적분Ⅱ · 기하', r: ['I', 'R'], mi: ['B', 'C'], why: '수식과 도형을 끝까지 다뤄야 하는 이공계 전공의 기초가 됩니다.' },
  { name: '인공지능 수학 · 데이터 과학', r: ['I', 'C'], mi: ['B'], why: '데이터를 다루는 학과에서 가장 먼저 확인하는 준비 과목입니다.' },
  { name: '인공지능 기초 · 소프트웨어와 생활', r: ['I', 'R'], mi: ['B', 'C'], why: '문제를 코드로 옮기는 경험을 학생부에 남길 수 있습니다.' },
  { name: '창의 공학 설계 · 역학과 에너지', r: ['R', 'I'], mi: ['B', 'C', 'D'], why: '설계하고 만들어 검증하는 과정이 공학 전공 적합성으로 이어집니다.' },
  { name: '물질과 에너지 · 화학 반응의 세계', r: ['I'], mi: ['B', 'H'], why: '화학·신소재·에너지 계열 탐구활동의 바탕이 됩니다.' },
  { name: '세포와 물질대사 · 생물의 유전', r: ['I', 'S'], mi: ['H', 'B'], why: '의학·생명 계열에서 가장 자주 요구하는 진로선택 과목입니다.' },
  { name: '지구시스템과학 · 기후변화와 환경생태', r: ['I', 'R'], mi: ['H'], why: '환경·에너지 문제를 자기 주제로 삼기에 좋습니다.' },
  { name: '주제 탐구 독서 · 독서 토론과 글쓰기', r: ['A', 'S'], mi: ['A', 'G'], why: '한 주제를 깊게 읽고 쓰는 과정이 세특에 그대로 드러납니다.' },
  { name: '문학과 영상 · 매체 의사소통', r: ['A', 'E'], mi: ['A', 'C'], why: '콘텐츠·미디어 계열 지망을 구체적인 활동으로 보여 줄 수 있습니다.' },
  { name: '미술 창작 · 미술과 매체', r: ['A'], mi: ['C'], why: '작품과 제작 의도를 함께 남기면 포트폴리오가 단단해집니다.' },
  { name: '음악 연주와 창작 · 음악과 미디어', r: ['A'], mi: ['E'], why: '소리를 다루는 진로에서 실기와 기획 감각을 함께 기릅니다.' },
  { name: '인간과 심리 · 사회문제 탐구', r: ['S', 'I'], mi: ['F', 'G'], why: '사람과 사회를 다루는 학과에서 탐구 주제를 잡기 좋습니다.' },
  { name: '교육의 이해 · 보건', r: ['S'], mi: ['F', 'B'], why: '교육·보건 계열 지망 동기를 활동으로 증명할 수 있습니다.' },
  { name: '금융과 경제생활 · 경제 수학', r: ['E', 'C'], mi: ['B'], why: '경영·경제 계열에서 숫자로 사고하는 힘을 보여 줍니다.' },
  { name: '정치 · 법과 사회 · 윤리문제 탐구', r: ['E', 'S', 'C'], mi: ['A', 'B'], why: '법·행정·정치 계열 지망의 근거가 되는 조합입니다.' },
  { name: '운동과 건강 · 스포츠 생활', r: ['R', 'S'], mi: ['D', 'F'], why: '체육·재활·건강 계열에서 꾸준함을 기록으로 남길 수 있습니다.' },
];

// 중학생용 고등학교 유형 힌트 (RIASEC 1순위 기준)
const HS_HINT = {
  R: '몸과 손을 쓰는 활동에서 힘이 나는 편이라면, 일반고의 과학·기술 중점 과정도 좋고 기계·전기·조리·항공 같은 분야를 일찍 배우는 마이스터고와 특성화고도 진지하게 살펴볼 만해요.',
  I: '원리를 파고드는 힘이 있으니 일반고에서 과학·수학 과목을 두텁게 듣는 길이 가장 무난해요. 탐구 활동이 활발한 과학중점학교나 과학고도 후보가 될 수 있습니다.',
  A: '표현하는 활동에 마음이 크게 움직인다면 예술고나 디자인·콘텐츠 특성화고를 한 번 찾아보세요. 일반고에서 미술·음악 관련 과목과 동아리를 챙기는 방법도 있습니다.',
  S: '사람을 돕고 가르치는 일에 관심이 크니 일반고에서 폭넓게 배우며 봉사·멘토링 경험을 쌓는 길이 잘 맞아요. 보건·유아교육 관련 특성화고도 선택지 중 하나입니다.',
  E: '사람을 모으고 일을 벌이는 힘이 있으니 학생회 활동이 활발한 일반고가 잘 맞습니다. 경영·마케팅을 일찍 배우는 상업 계열 특성화고도 눈여겨볼 만해요.',
  C: '정확하게 정리하는 힘이 강점이니 일반고에서 기초 과목을 탄탄히 하는 길이 좋아요. 회계·사무·정보처리를 배우는 특성화고도 실력을 빨리 쌓을 수 있는 길입니다.',
};

// 급별 추천 경험 (RIASEC 유형별 3개씩)
const EXPERIENCES = {
  elem: {
    R: ['블록·레고·종이접기처럼 손으로 만드는 활동을 한 달에 하나씩 완성해 보기', '학교 텃밭이나 화분을 맡아 직접 물을 주고 자란 모습을 기록해 보기', '학교 방과후나 동아리에서 만들기·과학 활동을 한 학기 해 보기'],
    I: ['궁금한 것을 적는 "질문 공책"을 만들어 일주일에 세 개씩 채워 보기', '과학관·박물관에 가 보거나 온라인 전시를 둘러보고 새로 알게 된 것 세 가지 적어 보기', '관심 있는 주제의 책을 한 달에 두 권 읽고 가족이나 친구에게 이야기해 주기'],
    A: ['그림·글·영상 중 하나를 골라 한 달에 한 작품씩 완성해 모아 두기', '학예회나 학급 행사에서 무대·포스터 만들기에 참여해 보기', '좋아하는 노래나 그림을 따라 해 본 뒤 내 방식으로 바꿔 보기'],
    S: ['친구가 어려워하는 것 한 가지를 쉬는 시간에 알려 주기', '학급 1인 1역을 한 학기 동안 성실하게 맡아 보기', '가족이나 이웃을 도운 일을 "고마움 일기"에 적어 보기'],
    E: ['학급 회의에서 내 의견을 한 번 이상 말해 보기', '친구들과 함께할 놀이나 행사를 직접 계획해서 해 보기', '학급 임원이나 모둠장을 한 번 맡아 보기'],
    C: ['내 책상과 사물함을 나만의 규칙으로 정리하고 일주일 지켜 보기', '하루 계획표를 만들고 지킨 날에 표시해 보기', '모둠 활동에서 준비물과 기록을 챙기는 역할 맡아 보기'],
  },
  mid: {
    R: ['자유학기 주제선택으로 메이커·발명 수업을 골라 작품 하나 완성하기', '학교 스포츠클럽이나 기술 동아리에 한 학기 이상 꾸준히 참여하기', '아두이노·3D 프린터·드론 중 하나를 다뤄 보고 과정을 사진으로 남기기'],
    I: ['자유학기 진로탐색 시간에 관심 분야 직업인 인터뷰를 계획해 실행하기', '과학탐구 동아리에서 나만의 탐구 주제를 정해 결과까지 내 보기', '관심 분야 교양서를 한 학기에 다섯 권 읽고 짧은 서평 남기기'],
    A: ['학교 축제나 학급 행사에서 포스터·영상·무대 제작을 직접 맡아 보기', '한 달에 한 작품씩 완성해 나만의 포트폴리오 폴더 만들기', '예술고·콘텐츠 특성화고 체험 프로그램에 한 번 참여해 분위기 느껴 보기'],
    S: ['또래 상담이나 멘토링 동아리에 참여해 친구의 이야기를 들어 주기', '지역 아동센터·복지관에서 한 학기 이상 정기 봉사활동 하기', '자유학기 진로체험으로 교육·보건 분야 직업 현장에 다녀오기'],
    E: ['학생회나 동아리에서 행사 하나를 기획부터 마무리까지 맡아 보기', '자유학기 주제선택으로 창업·경제 수업을 골라 사업계획서 한 장 써 보기', '교내 토론대회에 나가 근거를 들어 내 주장을 펼쳐 보기'],
    C: ['동아리나 학급의 기록·예산을 정리하는 총무 역할 맡아 보기', '3학년 진로연계학기에 고등학교 유형별 교육과정을 표로 정리해 비교하기', '한 학기 학습 계획표를 만들어 지킨 뒤 스스로 점검해 보기'],
  },
  high: {
    R: ['창의 공학 설계나 메이커 활동으로 시제품을 만들고 개선 과정을 보고서로 남기기', '공학 계열 학과 탐방·전공 체험에 참여하고 진로활동 특기사항으로 정리하기', '동아리에서 센서·제어 프로젝트를 맡아 내가 해결한 문제를 구체적으로 기록하기'],
    I: ['지망 학과와 이어지는 탐구 주제를 정해 가설·데이터·결론이 있는 보고서 완성하기', '교과 세특과 연결되는 심화 독서를 하고 남은 질문을 정리해 발표하기', '자율탐구·과제연구 활동에서 한 주제를 1년간 끝까지 밀고 가기'],
    A: ['학기별 작품을 모은 포트폴리오를 만들고 제작 의도를 글로 함께 남기기', '축제·전시·공연에서 기획과 제작을 맡고 그 과정을 활동 기록으로 정리하기', '지망 학과의 실기·평가 요소를 확인하고 부족한 부분을 학기 계획으로 채우기'],
    S: ['또래 멘토링이나 교육 봉사를 1년 이상 이어 가며 상대의 변화를 기록하기', '보건·상담·복지 분야 진로독서를 사회문제 탐구 활동과 연결해 보고서로 남기기', '학급·동아리에서 갈등을 조정하거나 프로그램을 운영한 경험을 구체적으로 남기기'],
    E: ['교내 프로젝트나 대회에서 팀을 이끌고 목표·역할·결과를 수치로 정리하기', '경제·창업 동아리에서 문제 정의부터 해결안까지 담은 제안서 완성하기', '토론·모의재판·모의국회 활동에 참여해 근거로 설득한 경험 쌓기'],
    C: ['관심 주제의 데이터를 직접 모아 통계로 분석하고 결과를 시각화해 발표하기', '학급·동아리의 자료와 기록을 체계적으로 관리하며 절차를 개선해 보기', '관심 분야의 법·제도나 회계 기초를 조사해 탐구 보고서로 정리하기'],
  },
};

/* ─────────────────────────── 작은 도구들 ─────────────────────────── */

const stripTags = (s = '') => String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const clean = (s = '') => String(s).trim();

/** 마지막 글자에 받침이 있는지 (조사를 골라 쓰기 위해) */
function hasJong(word = '') {
  const ch = String(word).replace(/[)\]\s"'*.·]+$/, '').slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return /[0-9a-zA-Z]/.test(ch);
}

/** 앞 단어에 맞는 조사를 붙인다. josa('추진력', '이', '가') → '추진력이' */
const josa = (word, withJong, withoutJong) => `${word}${hasJong(word) ? withJong : withoutJong}`;

/** 조사만 돌려준다. (앞말을 **굵게** 감싼 뒤 붙일 때 사용) */
const only = (word, withJong, withoutJong) => (hasJong(word) ? withJong : withoutJong);

/** 점수 함수로 풀에서 상위 n개를 겹치지 않게 고른다. */
function pickTop(pool, scoreFn, n) {
  return pool
    .map((item, i) => ({ item, score: scoreFn(item), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, n)
    .map((x) => x.item);
}

/** 배열을 n개가 될 때까지 예비 항목으로 채운다. ("5가지"는 어느 급에서든 정확히 5개) */
function fill(list, spares, n) {
  const out = list.slice(0, n);
  for (const s of spares) {
    if (out.length >= n) break;
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, n);
}

const numbered = (items) => items.map((t, i) => `${i + 1}. ${t}`).join('\n');

/** 문단들을 빈 줄로 이어 붙인다. 비어 있는 문단은 자동으로 빠진다. */
const para = (...parts) => parts.filter((p) => typeof p === 'string' && p.trim() !== '').join('\n\n');

/** 검사 결과와 후보 항목의 궁합 점수. 세 후보 풀(학과·계열·직업 세계)이 함께 쓴다. */
const affinity = (c) => (item) => {
  let s = 0;
  const r = item.r || [];
  const mi = item.mi || [];
  const disc = item.disc || [];
  if (r.includes(c.rP)) s += 5;
  if (r.includes(c.rS)) s += 3;
  if (c.rT && r.includes(c.rT)) s += 1;
  c.topKeys.forEach((k, i) => { if (mi.includes(k)) s += 4 - i; });
  if (disc.includes(c.dP)) s += 2;
  if (disc.includes(c.dS)) s += 1;
  return s;
};

/* ─────────────────────────── 문맥(ctx) 만들기 ─────────────────────────── */

/** 검사 결과와 학교급으로 보고서 조립에 필요한 값을 한 번에 계산한다. */
function makeContext(student, levelKey, results) {
  const L = getLevel(levelKey);
  const easy = isEasy(L.key);

  const DT = easy ? DISC_TYPES_EASY : DISC_TYPES;
  const MB = easy ? MBTI_RESULTS_EASY : MBTI_RESULTS;
  const MT = easy ? MI_TYPES_EASY : MI_TYPES;
  const RT = easy ? RIASEC_TYPES_EASY : RIASEC_TYPES;
  const TRAIT = easy ? DISC_TRAIT_EASY : DISC_TRAIT;
  const PAIR = easy ? DISC_PAIR_EASY : DISC_PAIR;
  const RTRAIT = easy ? RIASEC_TRAIT_EASY : RIASEC_TRAIT;

  const disc = results.disc || null;
  const mbti = results.mbti || null;
  const mi = results.mi || null;
  const riasec = results.riasec || null;

  // 알 수 없는 키(오래된 저장 데이터 등)가 들어와도 보고서가 반드시 나오도록 기본값으로 되돌린다.
  const okDisc = (k) => typeof k === 'string' && Object.hasOwn(DT, k) && Object.hasOwn(TRAIT, k);
  const dP = okDisc(disc?.primary) ? disc.primary : 'S';
  const dS = okDisc(disc?.secondary) && disc.secondary !== dP ? disc.secondary : (dP === 'D' ? 'C' : 'D');

  const mType = mbti?.type && MB[mbti.type] ? mbti.type : null;

  const miEntries = (list) => (list || [])
    .filter((t) => t && typeof t.key === 'string' && Object.hasOwn(MT, t.key))
    .map((t) => ({ ...t, name: MT[t.key].name }));
  const top3 = miEntries(mi?.top3);
  const bottom3 = miEntries(mi?.bottom3);
  const topKeys = top3.map((t) => t.key);

  const okR = (k) => typeof k === 'string' && Object.hasOwn(RT, k) && Object.hasOwn(RTRAIT, k);
  const rP = okR(riasec?.primary) ? riasec.primary : 'S';
  const rS = okR(riasec?.secondary) && riasec.secondary !== rP ? riasec.secondary : (rP === 'I' ? 'S' : 'I');
  const rT = okR(riasec?.tertiary) && riasec.tertiary !== rP && riasec.tertiary !== rS ? riasec.tertiary : null;

  const name = clean(student.name) || '학생';

  const c = {
    L,
    key: L.key,
    easy,
    DT, MB, MT, RT, TRAIT, PAIR, RTRAIT,
    student,
    name,
    // 초등에게 "님"은 어색하므로 급에 따라 부르는 말을 바꾼다.
    who: easy ? name : `${name}님`,
    disc, mbti, mi, riasec,
    dP, dS,
    dPi: DT[dP], dSi: DT[dS],
    dPt: TRAIT[dP], dSt: TRAIT[dS],
    mType,
    mInfo: mType ? MB[mType] : null,
    top3, bottom3, topKeys,
    combo: topKeys.length >= 2
      ? getCombo(topKeys[0], topKeys[1], easy)
      : (easy ? MI_COMBOS_EASY : MI_COMBOS).default,
    rP, rS, rT,
    rPi: RT[rP], rSi: RT[rS],
    rPt: RTRAIT[rP], rSt: RTRAIT[rS],
    miName: (k) => MT[k]?.name ?? k,
  };
  /** 급별로 다른 문구를 고른다. 정의가 없으면 중학 문구를 쓴다. */
  c.V = (map) => map[c.key] ?? map.mid;
  return c;
}

/* ─────────────────────────── 1~4. 검사별 섹션 ─────────────────────────── */

function discSection(c) {
  const { disc, dP, dS, dPi, dSi, dPt, dSt, who, V } = c;
  return para(
    V({
      elem: '## 1. 나는 어떤 친구일까? (DISC 행동유형)',
      mid: '## 1. 나는 어떤 사람일까? (DISC 행동유형 분석)',
      high: '## 1. 나는 어떤 사람일까? (DISC 행동유형 분석)',
    }),
    V({ elem: '### 내가 가장 자주 보이는 모습', mid: '### 나의 주된 모습 (1순위 유형)' }),
    `**${dPi.name} · ${dPi.title}** (${disc?.scores?.[dP] ?? '-'}점 / ${disc?.percents?.[dP] ?? '-'}%)`,
    dPi.description,
    V({ elem: `학교에서는 이런 모습이에요. ${dPi.style}`, mid: `학교에서는 이런 모습으로 나타나요. ${dPi.style}` }),
    `${who}의 가장 큰 무기는 **${dPt.force}**${only(dPt.force, '이', '')}에요.`,
    V({ elem: '### 가끔 나오는 또 다른 모습', mid: '### 나의 보조적 모습 (2순위 유형)' }),
    `**${dSi.name} · ${dSi.title}** (${disc?.scores?.[dS] ?? '-'}점 / ${disc?.percents?.[dS] ?? '-'}%)`,
    dSi.description,
    V({
      elem: `가장 자주 보이는 모습이 잠시 쉬어갈 때, ${dSt.verb} 이 모습이 조용히 힘을 보태 줘요.`,
      mid: `주된 모습이 잠시 쉬어갈 때, ${dSt.verb} 이 모습이 조용히 힘을 보태 줍니다.`,
    }),
    V({ elem: '### 두 모습이 만나면', mid: '### 두 모습이 만났을 때 (유형 조합 분석)' }),
    c.PAIR[dP + dS] || `${dPi.name}의 힘과 ${dSi.name}의 힘이 함께 있어, 상황에 따라 다른 얼굴을 꺼내 쓸 수 있는 사람이에요.`,
    `그래서 ${who}${only(who, '은', '는')} 팀 안에서 **${dPt.team}**${only(dPt.team, '이', '가')} 가장 잘 어울려요. 여기에 ${dSi.name}의 ${josa(dSt.force, '이', '가')} 더해지면 혼자 할 때도, 함께 할 때도 잘 해내는 사람이 됩니다.`,
    `**강점 키워드**: ${(dPi.strengths || []).concat(dSi.strengths || []).slice(0, 5).join(' · ')}`,
  );
}

function mbtiSection(c) {
  const { mbti, mType, mInfo, V } = c;
  const axisLines = (mbti?.axes || []).map(
    (a) => `- **${a.leftName}(${a.left}) ${a.leftScore} : ${a.rightScore} ${a.rightName}(${a.right})** → ${a.pick === a.left ? a.leftName : a.rightName} 쪽으로 기울어요.`,
  );
  const careers = Array.isArray(mInfo?.careers) ? mInfo.careers : [];
  return para(
    V({
      elem: '## 2. 내 마음은 어떻게 움직일까? (MBTI 성격유형)',
      mid: '## 2. 나의 타고난 성격은? (MBTI 성격유형 분석)',
    }),
    `### 나의 MBTI 유형: ${mType ?? '(결과 없음)'}`,
    mInfo && `**${mType} · ${mInfo.nickname}**`,
    mInfo && mInfo.summary,
    mInfo && mInfo.strength,
    axisLines.length && `**네 가지 지표를 하나씩 보면**\n\n${axisLines.join('\n')}`,
    mInfo && `**공부할 때**\n\n${mInfo.study}`,
    mInfo && `**친구들과 있을 때**\n\n${mInfo.friends}`,
    mInfo && `**더 자라날 수 있는 부분**\n\n${mInfo.growth}`,
    careers.length && `**${V({ elem: '이런 일도 재미있을 거예요', mid: '이 유형이 힘을 내는 직업 예시' })}**: ${careers.join(', ')}`,
    // subjects 는 중·고등 표에만 있다.
    mInfo?.subjects && c.key !== 'elem' ? `**힘이 나는 과목·활동**: ${mInfo.subjects}` : '',
  );
}

function miSection(c) {
  const { top3, bottom3, topKeys, MT, combo, miName, V } = c;
  const topLines = top3.map(
    (t, i) => `${i + 1}. **${t.name}지능** (${t.score}점 / ${t.percent}%) — ${MT[t.key]?.description ?? ''}\n   - 잘 맞는 과목: ${MT[t.key]?.subjects ?? '-'}\n   - 키우기 좋은 활동: ${MT[t.key]?.activities ?? '-'}`,
  );
  const botLines = bottom3.map(
    (t, i) => `${i + 1}. **${t.name}지능** (${t.score}점 / ${t.percent}%) — ${MT[t.key]?.description ?? ''}`,
  );

  const firstActivity = (k, n = 0) => {
    const list = String(MT[k]?.activities ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return list[n] ?? list[0] ?? '좋아하는 활동';
  };

  const balance = bottom3.length && top3.length
    ? [
        V({
          elem: '가장 좋은 방법은 **잘하는 것으로 아직 어색한 것에 다가가기**예요.',
          mid: '가장 좋은 방법은 **잘하는 것으로 아직 어색한 것에 다가가기**예요.',
        }),
        `- ${miName(bottom3[0].key)}지능은 ${top3[0].name}지능의 방식으로 접근해 보세요. 예를 들어 ${josa(firstActivity(topKeys[0]), '을', '를')} 하면서 ${miName(bottom3[0].key)} 요소를 살짝 섞는 거예요.`,
        `- ${miName(bottom3[1]?.key ?? bottom3[0].key)}지능은 혼자 잘하려 하기보다, 그 재능이 뛰어난 친구와 팀을 이뤄 함께 해 보는 것이 가장 빠릅니다.`,
        `- ${miName(bottom3[2]?.key ?? bottom3[0].key)}지능은 하루 10분씩 아주 작게 시작해 보세요. 점수를 올리는 게 목표가 아니라, "해 봤다"는 경험을 쌓는 것이 목표예요.`,
        V({
          elem: '점수가 낮게 나온 재능은 **아직 안 써 본 근육**이에요. 쓰면 반드시 자라요.',
          mid: '낮게 나온 지능은 못하는 재능이 아니라 **아직 덜 써 본 근육**이에요. 쓰면 반드시 자랍니다.',
        }),
      ].join('\n')
    : '강점 지능을 활용해 아직 익숙하지 않은 영역에 조금씩 도전해 보세요.';

  return para(
    V({
      elem: '## 3. 나는 어떤 재능을 가졌을까? (다중지능)',
      mid: '## 3. 나는 어떤 재능을 가졌을까? (다중지능 분석)',
    }),
    V({ elem: '### 내가 가장 잘하는 재능 세 가지', mid: '### 나의 빛나는 재능들 (강점 지능 TOP 3)' }),
    topLines.length ? topLines.join('\n') : '- (결과 없음)',
    V({ elem: '### 세 가지 재능이 만나면', mid: '### 강점 재능들의 시너지' }),
    `**${combo?.title ?? '나만의 조합'}** — ${stripTags(combo?.text ?? '')}`,
    top3.length >= 3
      ? `여기에 ${top3[2].name}지능까지 더해지면, ${top3[0].name}·${top3[1].name}·${top3[2].name}의 세 가지 힘이 한 번에 움직여요. 예를 들어 ${josa(firstActivity(topKeys[0]), '을', '를')} 할 때, 남들보다 한 단계 깊은 결과물을 만들어 낼 수 있습니다.`
      : '',
    V({ elem: '### 앞으로 자라날 재능 세 가지', mid: '### 성장의 기회가 될 재능들 (아직 덜 써 본 지능 TOP 3)' }),
    botLines.length ? botLines.join('\n') : '- (결과 없음)',
    V({ elem: '### 골고루 자라는 방법', mid: '### 균형 잡힌 성장을 위하여' }),
    balance,
  );
}

function riasecSection(c) {
  const { riasec, rP, rS, rT, rPi, rSi, rPt, rSt, RT, who, V, key } = c;
  const listOf = (arr) => (Array.isArray(arr) ? arr.map((t) => `- ${t}`).join('\n') : '');

  // 급별 마무리 블록: 초등은 궁금증, 중학은 활동, 고교는 학과까지.
  const tailTitle = V({
    elem: '### 더 알아보면 좋은 것',
    mid: '### 지금 해 보면 좋은 활동',
    high: '### 이 흥미와 이어지는 학과',
  });
  const tailBody = key === 'elem'
    ? listOf(RT[rP]?.wonder)
    : key === 'mid'
      ? listOf(RT[rP]?.activities)
      : para(listOf(RT[rP]?.majors), `여기에 2순위 ${rSi.name}까지 고려하면 ${(RT[rS]?.majors || []).slice(0, 3).join(', ')} 쪽도 함께 살펴볼 만합니다.`);

  return para(
    V({
      elem: '## 4. 나는 무엇을 할 때 신날까? (RIASEC 흥미)',
      mid: '## 4. 나는 어떤 분야에 흥미를 느낄까? (RIASEC 직업흥미 분석)',
    }),
    `**나의 홀랜드 코드: ${riasec?.code ?? '-'}**`,
    V({ elem: '### 내가 좋아하는 것 1번', mid: '### 나의 흥미 분야 (1순위 유형)' }),
    `**${rPi.title}** (${riasec?.scores?.[rP] ?? '-'}점 / ${riasec?.percents?.[rP] ?? '-'}%)`,
    rPi.text,
    `${josa(rPt.doing, '을', '를')} 할 때 시간 가는 줄 모르고, ${rPt.joy} 가장 큰 만족을 느낍니다.`,
    V({ elem: '### 내가 좋아하는 것 2번', mid: '### 나의 잠재적 흥미 분야 (2순위 유형)' }),
    `**${rSi.title}** (${riasec?.scores?.[rS] ?? '-'}점 / ${riasec?.percents?.[rS] ?? '-'}%)`,
    rSi.text,
    V({ elem: '### 두 가지가 만나면', mid: '### 두 흥미가 만났을 때 (유형 조합 분석)' }),
    `${rPi.name}(${rP})${only(rPi.name, '과', '와')} ${rSi.name}(${rS})의 조합은 **${rPt.doing}**${only(rPt.doing, '과', '와')} **${rSt.doing}**${only(rSt.doing, '을', '를')} 함께 하고 싶어 하는 마음이에요.`,
    `그래서 ${who}${only(who, '은', '는')} ${rPt.env}에서 지내면서도, ${josa(rSt.doing, '이', '가')} 함께 들어 있는 자리에서 가장 오래, 가장 즐겁게 지낼 수 있어요.`,
    rT ? `여기에 3순위 ${RT[rT]?.name}(${rT})까지 더해진 **${riasec?.code}** 코드는, 한 가지 색이 아니라 세 가지 색이 섞인 ${who}만의 흥미 지도예요.` : '',
    tailTitle,
    tailBody,
  );
}

/* ─────────────────────────── 5. 종합 섹션의 조각들 ─────────────────────────── */

function integrated(c) {
  const { name, who, dPi, dSi, dPt, mType, mInfo, top3, rP, rS, rPi, rSi, rPt, V } = c;
  return [
    V({
      elem: `${who}${only(who, '은', '는')} **${dPi.title}**의 모습을 가장 많이 보이면서, ${dSi.name}의 모습도 함께 가진 친구예요.`,
      mid: `${who}${only(who, '은', '는')} **${dPi.title}**의 모습을 기본으로 하면서, ${dSi.name}의 결이 함께 흐르는 사람이에요.`,
    }),
    mInfo ? `MBTI **${mType}(${mInfo.nickname})** 유형답게 ${mInfo.summary}` : '',
    top3.length ? `재능으로 보면 **${top3.map((t) => t.name + '지능').join(' · ')}**이 가장 빛나고, 이 세 가지가 서로 손을 잡을 때 ${name}만의 결과물이 나옵니다.` : '',
    `흥미는 **${rPi.name}(${rP})**에 가장 크게 기울어 있어요. ${rPt.joy} 마음이 움직이고, 여기에 ${rSi.name}(${rS})의 관심이 더해져 폭이 넓습니다.`,
    V({
      elem: `정리하면 ${who}${only(who, '은', '는')} ${dPt.verb} 모습으로, ${top3[0] ? top3[0].name + '지능' : '자신의 재능'}을 무기 삼아, ${rPt.doing} 속에서 나만의 멋진 모습을 보여 줄 친구예요.`,
      mid: `정리하면 ${who}${only(who, '은', '는')} ${dPt.verb} 태도로, ${top3[0] ? top3[0].name + '지능' : '자신의 재능'}을 무기 삼아, ${rPt.doing} 속에서 자신을 증명해 나갈 사람이에요.`,
    }),
    V({
      elem: '아직 다 자라지 않았다는 것이 가장 큰 힘이에요. 지금 결과는 도착점이 아니라 **출발점**이에요.',
      mid: '아직 완성되지 않았다는 것이 가장 큰 강점이에요. 지금의 결과는 목적지가 아니라 **출발점**입니다.',
      high: '아직 완성되지 않았다는 것이 가장 큰 강점이에요. 지금의 결과는 목적지가 아니라, 고등학교 3년을 설계할 **출발점**입니다.',
    }),
  ].filter(Boolean).join('\n');
}

function strengths(c) {
  const { dPi, dSi, dPt, dSt, mInfo, top3, topKeys, MT, rPi, L, V } = c;
  return fill([
    `**${(dPi.strengths || [])[0] ?? dPt.force}** — ${dPi.name}의 대표 강점이에요. ${josa(dPt.force, '이', '가')} 어떤 팀에 가도 눈에 띕니다.`,
    V({
      elem: `**${(dSi.strengths || [])[0] ?? dSt.force}** — ${dSi.name}의 모습까지 더해져, 한쪽으로만 치우치지 않아요.`,
      mid: `**${(dSi.strengths || [])[0] ?? dSt.force}** — ${dSi.name}의 결이 더해져, 한쪽으로만 치우치지 않는 균형을 갖췄어요.`,
    }),
    mInfo ? `**${mInfo.nickname}의 힘** — ${String(mInfo.strength).split('.')[0]}.` : '',
    top3[0] ? `**${top3[0].name}지능(${top3[0].percent}%)** — ${MT[topKeys[0]]?.description}` : '',
    top3[1] ? `**${top3[1].name}지능 + ${rPi.name} 흥미** — 잘하는 것과 좋아하는 것이 겹치는 지점이에요. 이 겹침이 진로에서 가장 강력한 무기가 됩니다.` : '',
  ].filter(Boolean), [
    V({
      elem: `**끝까지 해 보려는 마음** — ${L.total}개나 되는 질문에 끝까지 답한 것만으로도 참 성실한 친구예요.`,
      mid: `**끝까지 해 보려는 태도** — ${L.total}개나 되는 문항을 끝까지 마쳤다는 것 자체가 성실함의 증거예요.`,
    }),
    '**자신을 알아보려는 마음** — 스스로를 궁금해하는 사람은 반드시 자기 길을 찾아냅니다.',
    `**${rPi.name} 흥미가 뚜렷하다는 것** — ${V({ elem: '무엇이 재미있는지 아는 사람은 하고 싶은 일을 훨씬 빨리 찾아요.', mid: '무엇에 마음이 끌리는지 아는 사람은 진로를 훨씬 빨리 좁혀 갑니다.' })}`,
  ], 5);
}

function growths(c) {
  const { dPt, mInfo, bottom3, miName, MT, riasec, RT, V } = c;
  const lowKey = riasec?.ranked?.[5];
  const lowName = (typeof lowKey === 'string' && RT[lowKey]?.name) || '아직 낯선';
  return fill([
    `**${c.dPi.name} 성향의 성장 포인트** — ${dPt.grow}`,
    mInfo ? `**${String(mInfo.growth).split('.')[0]}.** 조금씩만 연습해도 충분히 달라져요.` : '',
    bottom3[0] ? `**${miName(bottom3[0].key)}지능 넓히기** — ${MT[bottom3[0].key]?.activities} 중 하나만 골라 가볍게 시작해 보세요.` : '',
    bottom3[1] ? `**${miName(bottom3[1].key)}지능 경험하기** — 잘하려고 하지 말고, 한 번 해 보는 것을 목표로 삼아요.` : '',
    `**${lowName} 영역 맛보기** — 흥미가 낮게 나온 분야도 한 번쯤 겪어 보면, 내 강점이 왜 강점인지 더 또렷해져요.`,
  ].filter(Boolean), [
    '**쉬어 가는 법 익히기** — 열심히 하는 사람일수록 쉬는 계획도 같이 세워야 오래갑니다.',
    '**남과 비교하지 않기** — 검사 결과는 등수가 아니라 나만의 지도예요.',
    V({
      elem: '**시작한 일 끝내 보기** — 작아도 좋으니 한 가지를 끝까지 해낸 경험을 이번 학기에 하나 만들어 보세요.',
      mid: '**한 가지를 끝까지 해 보기** — 크지 않아도 좋으니 시작한 일을 마무리한 경험을 한 학기에 하나씩 쌓아 보세요.',
      high: '**기록으로 남기기** — 열심히 한 활동도 기록이 없으면 남지 않아요. 활동마다 배운 점을 세 줄로 정리해 두세요.',
    }),
  ], 5);
}

function potentials(c) {
  const { name, who, dPi, dPt, mType, mInfo, top3, rP, rS, rPi, rSi, V } = c;
  return fill([
    top3[0] && top3[1] ? `${top3[0].name}지능과 ${top3[1].name}지능이 함께 쓰이는 새로운 분야를 스스로 만들어 낼 가능성이 있어요. 지금 세상에 없는 직업일 수도 있습니다.` : '',
    `${dPi.name}의 ${josa(dPt.force, '이', '가')} ${rPi.name} 분야와 만나면, 같은 일을 해도 ${name}만의 방식이 생겨요. 몇 년 뒤 "그 사람 스타일"이라는 말을 듣게 될 거예요.`,
    mInfo ? `${mType} 유형은 관심이 생긴 주제를 깊게 파고들 때 갑자기 실력이 뛰는 편이에요. 아직 그 주제를 만나지 못했을 뿐입니다.` : '',
    top3[2] ? `${top3[2].name}지능은 지금은 3위지만, 앞으로 쓰이는 자리를 만나면 1순위 재능을 뒷받침하는 숨은 무기가 됩니다.` : '',
    `${rSi.name}(${rS}) 흥미는 아직 충분히 써 보지 못했을 가능성이 커요. ${V({
      elem: '이쪽으로 작은 경험을 쌓으면 하고 싶은 일이 훨씬 많아져요.',
      mid: '이 방향으로 작은 경험을 쌓으면 진로의 선택지가 눈에 띄게 넓어집니다.',
      high: '이 방향의 활동을 하나만 더해도 지원할 수 있는 학과의 폭이 넓어집니다.',
    })}`,
  ].filter(Boolean), [
    '지금은 조용한 재능도, 맞는 무대를 만나면 갑자기 커집니다.',
    '여러 분야를 잇는 사람이 될 가능성이 있어요. 서로 다른 관심사를 버리지 말고 함께 가져가 보세요.',
    `지금의 검사 결과는 지금의 ${who}예요. 새로운 경험을 할 때마다 이 지도는 조금씩 넓어집니다.`,
    `${rP} 흥미가 지금은 1순위지만, 앞으로 만나는 사람과 경험에 따라 순위는 얼마든지 바뀔 수 있어요.`,
  ], 5);
}

/** 초등: 더 알고 싶은 직업 세계 5가지 */
function kidWorlds(c) {
  return pickTop(KID_WORLDS, affinity(c), 5).map(
    (w) => `**${w.name}** — ${w.jobs.join(', ')} 같은 일이 있어요. 이번 주 미션: ${w.wonder}!`,
  );
}

/** 중학: 눈여겨볼 만한 계열 5가지 */
function fields(c) {
  return pickTop(FIELDS, affinity(c), 5).map(
    (f) => `**${f.name}** — ${f.why}예요. 고등학교는 ${f.hs} 쪽에서 이어 갈 수 있어요.`,
  );
}

/** 고교: 관심 가져볼 만한 학과 5가지 */
function majors(c) {
  const { name, topKeys, MT, top3, rP, rS, rPi, rSi } = c;
  const TAILS = [
    (r, t) => `${r} 흥미가 강한 ${name}에게 잘 맞고, ${josa(t, '을', '를')} 마음껏 쓸 수 있어요.`,
    (r, t) => `${josa(t, '이', '가')} 그대로 무기가 되는 학과예요. ${r} 흥미와도 결이 맞습니다.`,
    (r, t) => `${r} 성향과 ${josa(t, '이', '가')} 만나는 지점에 있는 전공이에요.`,
    (r, t) => `평소 좋아하는 ${r} 활동을 전공으로 이어 갈 수 있고, ${josa(t, '이', '가')} 큰 도움이 돼요.`,
    (r, t) => `${josa(t, '을', '를')} 가진 사람이 특히 즐겁게 공부할 수 있는 분야예요.`,
  ];
  return pickTop(MAJORS, affinity(c), 5).map((m, i) => {
    const hit = topKeys.find((k) => m.mi.includes(k));
    const talent = `${hit ? MT[hit].name : (top3[0]?.name ?? '나만의')}지능`;
    const rName = m.r.includes(rP) ? rPi.name : m.r.includes(rS) ? rSi.name : rPi.name;
    return `**${m.name}** — ${m.why}예요. ${TAILS[i % TAILS.length](rName, talent)}`;
  });
}

/** 중·고교: 세상에 기여할 수 있는 나의 역할 5가지 */
function roles(c) {
  return pickTop(ROLES, affinity(c), 5).map((r) => `**${r.text}** (${r.jobs.join(', ')})`);
}

/** 고교: 고교학점제 선택과목 제안 5가지 */
function subjects(c) {
  return pickTop(SUBJECTS, affinity(c), 5).map((s) => `**${s.name}** — ${s.why}`);
}

/** 급별 추천 경험 5가지 */
function experiences(c) {
  const { key, rP, rS, top3, topKeys, MT, V } = c;
  const table = EXPERIENCES[key] || EXPERIENCES.mid;
  const activity = (k, n = 0) => {
    const list = String(MT[k]?.activities ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return list[n] ?? list[0] ?? '좋아하는 활동';
  };
  const pool = [
    ...(table[rP] || []).slice(0, 2),
    ...(table[rS] || []).slice(0, 1),
    top3[0] ? `${activity(topKeys[0])} 활동을 한 학기 동안 이어 가며 결과물을 모아 두기 — ${top3[0].name}지능이 눈에 보이게 쌓여요.` : '',
    top3[1] ? `${activity(topKeys[1], 1)} 활동에 한 번은 도전해 보기 — ${top3[1].name}지능을 꾸준히 키워 주는 경험이에요.` : '',
  ].filter(Boolean);
  return fill(pool, [
    V({
      elem: '되고 싶은 직업을 가진 어른 한 분에게 궁금한 것을 물어보고 답을 적어 두기',
      mid: '관심 있는 직업을 가진 어른 한 분을 인터뷰하고 기록으로 남기기',
      high: '지망 학과의 교육과정을 찾아보고 내 선택과목과 맞는지 표로 정리하기',
    }),
    V({
      elem: '학교 진로 프로그램이나 직업 체험에 한 번 이상 참여해 보기',
      mid: '학교 진로체험이나 고등학교 설명회에 한 번 이상 참여해 보기',
      high: '대학 전공 체험·모의 강의에 참여하고 느낀 점을 진로활동 기록으로 남기기',
    }),
    '한 학기에 한 번, 이 보고서를 다시 읽고 달라진 점을 적어 보기',
  ], 5);
}

/** 2026 관점 — AI 와 함께 일하기, 사람만의 강점 (모든 급에 한 단락) */
function aiParagraph(c) {
  const { who, top3, dPi, V } = c;
  const talent = top3[0] ? `${top3[0].name}지능` : '나만의 재능';
  return V({
    elem: `요즘은 AI 가 글도 써 주고 그림도 그려 줘요. 그래서 앞으로 중요한 힘은 "AI 에게 무엇을 부탁할지 정하는 힘", "AI 가 준 답이 진짜 맞는지 확인하는 힘", 그리고 "친구와 함께 해내는 힘"이에요. ${who}의 ${talent}${only(talent, '과', '와')} ${dPi.title}다운 모습은 AI 가 대신해 줄 수 없어요. AI 는 도와주는 도구일 뿐, 무엇을 하고 싶은지 정하는 사람은 언제나 ${josa(who, '이에요', '예요')}.`,
    mid: `2026년의 진로 이야기에서 AI 를 빼놓을 수 없어요. 앞으로는 AI 를 못 쓰는 사람이 아니라 **AI 에게 좋은 질문을 던지고, 그 답을 검증해 자기 결론으로 만드는 사람**이 앞서갑니다. 자유학기 활동이나 수행평가에서 AI 를 도구로 쓰되, 결과를 그대로 옮기지 말고 근거를 한 번 더 확인하는 습관을 지금부터 들여 보세요. 문제를 스스로 정의하는 힘, 사람의 마음을 읽는 힘, 끝까지 책임지는 힘은 여전히 사람의 몫이고, ${who}의 ${talent}${only(talent, '은', '는')} 바로 그 자리에서 쓰입니다.`,
    high: `2026년 기준으로 대학과 사회가 함께 보는 것은 "AI 를 쓸 줄 아는가"를 넘어 **AI 와 함께 일한 과정을 스스로 설명할 수 있는가**입니다. 탐구활동이나 수행평가에서 AI 를 어디에 썼고 무엇을 직접 판단했는지 구분해 기록해 두면, 그 자체가 신뢰가 됩니다. 문제를 새로 정의하는 힘, 맥락과 윤리를 따지는 힘, 사람을 설득하고 책임지는 힘은 자동화되지 않아요. ${who}의 ${talent}${only(talent, '과', '와')} ${dPi.name}다운 태도를 AI 라는 도구 위에 올려놓을 때, 대체되지 않는 사람이 됩니다.`,
  });
}

/** 초등: SWOT 대신 "나의 보물지도" 네 칸 */
function treasureMap(c) {
  const { top3, bottom3, dPt, rPi, miName, mInfo } = c;
  return [
    `- **내가 이미 가진 보물**: ${dPt.force}, 그리고 ${top3[0] ? top3[0].name + '지능' : '나만의 재능'}${top3[1] ? '과 ' + top3[1].name + '지능' : ''}.`,
    `- **더 키우면 좋을 보물**: ${bottom3[0] ? miName(bottom3[0].key) + '지능' : '아직 안 써 본 재능'}처럼 아직 자주 쓰지 않은 힘. 조금씩 해 보면 금방 자라요.`,
    `- **나를 도와줄 사람과 기회**: 선생님, 가족, 그리고 ${rPi.name} 활동을 함께할 친구들. 학교 동아리와 방과후 수업도 좋은 기회예요.`,
    `- **조심하면 좋은 것**: ${mInfo ? String(mInfo.growth).split('.')[0] + '.' : '한 번에 잘하려고 마음 급해지는 것.'} 잘 안 되는 날이 있어도 괜찮아요.`,
  ].join('\n');
}

/** 중·고교: SWOT */
function swot(c) {
  const { dPi, dPt, dP, top3, bottom3, miName, mInfo, mType, rPi, V } = c;
  return [
    `- **S (강점)**: ${dPt.force}, ${top3[0] ? top3[0].name + '지능' : '나만의 재능'}${top3[1] ? '과 ' + top3[1].name + '지능' : ''}, 그리고 ${rPi.name} 분야에 대한 분명한 흥미.`,
    `- **W (보완점)**: ${dPt.grow} ${bottom3[0] ? `또한 ${miName(bottom3[0].key)} 영역은 아직 경험이 적어요.` : ''}`,
    `- **O (기회)**: ${V({
      mid: `${rPi.name} 분야는 자유학기 주제선택과 동아리로 지금 바로 겪어 볼 수 있어요. 고등학교 유형을 고를 때도 이 흥미가 중요한 기준이 됩니다.`,
      high: `${rPi.name} 분야는 고교학점제 선택과목과 학교 탐구활동으로 바로 이어 갈 수 있어요. 학생부에 남길 소재가 이미 손에 있다는 뜻입니다.`,
    })} ${mInfo ? mType + ' 특유의 ' : ''}${top3[0] ? top3[0].name + '지능' : '강점'}을 살릴 무대도 계속 늘고 있습니다.`,
    `- **T (위협)**: 결과가 빨리 나오지 않으면 마음이 흔들릴 수 있어요. ${dPi.name} 성향은 특히 ${dP === 'D' || dP === 'I' ? '기다리는 시간' : '변화가 큰 상황'}을 힘들어할 수 있으니, 작은 목표로 나누어 성취감을 자주 느끼는 것이 좋습니다.`,
  ].join('\n');
}

function insight(c) {
  const { who, dPi, mType, mInfo, top3, rPt, L, V } = c;
  return [
    `${who}${only(who, '을', '를')} 한 문장으로 표현하면 **"${dPi.title}의 마음으로 ${josa(rPt.doing, '을', '를')} 해내는 사람"**이에요.`,
    `${top3.length ? top3.map((t) => t.name).join('·') + '지능' : '지금의 재능'}이라는 도구를 이미 손에 쥐고 있고, ${mInfo ? `${mType}(${mInfo.nickname})다운 방식으로 그 도구를 쓰는 법도 조금씩 익혀 가는 중입니다.` : '그 도구를 쓰는 법을 익혀 가는 중입니다.'}`,
    V({
      elem: `지금은 **${L.stage}** 시기예요. 무엇을 정해야 하는 때가 아니라, 세상에 어떤 일이 있는지 구경하고 좋아하는 것을 많이 해 보는 때랍니다.`,
      mid: `지금은 **${L.stage}** 시기예요. 하나를 정하기보다 여러 방향을 직접 겪어 보며 나에게 맞는 쪽을 좁혀 가는 것이 가장 좋은 전략입니다.`,
      high: `지금은 **${L.stage}** 시기예요. 방향을 정하고, 그 방향에 맞는 과목과 활동을 실제로 선택해 실행에 옮길 때입니다.`,
    }),
    '검사 결과는 정답표가 아니라 지도예요. 지도가 있다고 길이 저절로 걸어지지는 않지만, 어느 쪽으로 첫걸음을 뗄지는 훨씬 쉬워집니다.',
    `오늘 이 보고서에서 딱 한 가지만 골라 이번 주에 해 보세요. 그 한 걸음이 쌓여 ${who}만의 길이 됩니다. 진로 내비게이터가 늘 응원할게요! ${L.emoji}`,
  ].join(' ');
}

/* ─────────────────────────── 5. 종합 섹션 ─────────────────────────── */

/** 급별로 목차가 달라진다. [소제목, 본문] 쌍의 배열을 만든다. */
function summaryItems(c) {
  const common = {
    strengths: numbered(strengths(c)),
    growths: numbered(growths(c)),
    potentials: numbered(potentials(c)),
    experiences: numbered(experiences(c)),
    ai: aiParagraph(c),
    insight: insight(c),
  };

  if (c.key === 'elem') {
    return [
      ['### 나는 이런 친구예요', integrated(c)],
      ['### 나를 빛나게 하는 좋은 점 5가지', common.strengths],
      ['### 앞으로 더 자라날 점 5가지', common.growths],
      ['### 아직 숨어 있는 나의 힘 5가지', common.potentials],
      ['### 더 알고 싶은 직업 세계 5가지', numbered(kidWorlds(c))],
      ['### 지금 해 보면 좋은 일 5가지', common.experiences],
      ['### AI 와 함께 크는 나', common.ai],
      ['### 나의 보물지도', treasureMap(c)],
      ['### 진로 내비게이터의 편지', common.insight],
    ];
  }

  if (c.key === 'high') {
    return [
      ['### 나의 통합적 특성', integrated(c)],
      ['### 나를 빛나게 하는 강점 5가지', common.strengths],
      ['### 성장을 위한 기회 5가지', common.growths],
      ['### 아직 발견하지 못한 나의 가능성 5가지', common.potentials],
      ['### 관심 가져볼 만한 학과 5가지', numbered(majors(c))],
      ['### 세상에 기여할 수 있는 나의 역할 5가지', numbered(roles(c))],
      ['### 고교학점제, 이런 선택과목 5가지', numbered(subjects(c))],
      ['### 학교생활기록부에 남길 활동 5가지', common.experiences],
      ['### AI 시대에 대체되지 않는 나의 강점', common.ai],
      ['### 나의 미래를 위한 SWOT 분석', swot(c)],
      ['### 진로 내비게이터의 최종 인사이트', common.insight],
    ];
  }

  // 중학
  return [
    ['### 나의 통합적 특성', integrated(c)],
    ['### 나를 빛나게 하는 강점 5가지', common.strengths],
    ['### 성장을 위한 기회 5가지', common.growths],
    ['### 아직 발견하지 못한 나의 가능성 5가지', common.potentials],
    ['### 눈여겨볼 만한 계열 5가지', numbered(fields(c))],
    ['### 세상에 기여할 수 있는 나의 역할 5가지', numbered(roles(c))],
    ['### 자유학기와 동아리에서 해 볼 경험 5가지', common.experiences],
    ['### 어떤 고등학교가 어울릴까?', hsHint(c)],
    ['### AI 시대, 나만의 강점', common.ai],
    ['### 나의 미래를 위한 SWOT 분석', swot(c)],
    ['### 진로 내비게이터의 최종 인사이트', common.insight],
  ];
}

/** 중학 전용 — 고등학교 유형 힌트 */
function hsHint(c) {
  const { rP, rPi, who } = c;
  return para(
    HS_HINT[rP] || HS_HINT.S,
    `다만 고등학교는 성적만으로 고르는 곳이 아니라 **3년 동안 무엇을 배우고 싶은지**로 고르는 곳이에요. ${who}의 ${rPi.name} 흥미가 실제로 즐거운지, 자유학기와 동아리에서 한 번 더 확인해 본 뒤 결정해도 늦지 않습니다.`,
  );
}

function summarySection(c) {
  const head = c.V({
    elem: '## 5. 나의 보물지도 (종합 정리)',
    mid: '## 5. 나의 잠재력을 하나로 모아보기! (종합 분석)',
    high: '## 5. 나의 잠재력을 하나로 모아보기! (종합 분석 · 진로 설계)',
  });
  const body = summaryItems(c).flatMap(([title, text]) => [title, text]);
  return para(head, ...body);
}

/* ─────────────────────────── 머리말·꼬리말 ─────────────────────────── */

function header(c) {
  const { L, name, who, student, dP, dS, mType, top3, riasec, V } = c;
  const belong = [clean(student.school), clean(student.grade)].filter(Boolean).join(' ');
  const today = new Date().toLocaleDateString('ko-KR');
  const line = [belong, `${L.emoji} ${L.label}`, `검사일 ${today}`].filter(Boolean).join(' · ');
  return para(
    V({
      elem: `# ✨ ${name}의 진로 보물지도 ✨`,
      mid: `# ✨ ${name}님을 위한 진로 잠재력 종합 보고서 ✨`,
      high: `# ✨ ${name}님을 위한 진로 잠재력 종합 보고서 ✨`,
    }),
    `**${line}**`,
    V({
      elem: `안녕하세요! 저는 ${who}의 좋은 점을 함께 찾아 줄 진로 내비게이터예요. ${L.total}개나 되는 질문에 끝까지 답한 것만으로도 정말 대단해요. 이제 네 가지 검사 결과로 ${josa(who, '이', '가')} 어떤 친구인지 같이 살펴볼까요?`,
      mid: `안녕하세요! 저는 여러분의 잠재력을 함께 찾아 나설 진로 내비게이터예요. ${L.total}개나 되는 문항을 끝까지 마친 것만으로도 이미 대단한 일을 해냈어요. 이제 네 가지 검사 결과로 여러분이라는 멋진 사람에 대해 함께 알아볼까요?`,
      high: `안녕하세요! 저는 여러분의 진로 설계를 함께할 진로 내비게이터예요. ${L.total}개나 되는 문항을 끝까지 마쳤다는 것은, 자신을 제대로 알아보겠다는 마음이 있다는 뜻이에요. 이제 네 가지 검사 결과를 이어 붙여 앞으로의 선택을 함께 설계해 볼까요?`,
    }),
    `**한눈에 보기** — DISC ${dP}${dS} · MBTI ${mType ?? '-'} · 강점 지능 ${top3.map((t) => t.name).join('/') || '-'} · 홀랜드 코드 ${riasec?.code ?? '-'}`,
    `지금은 **${L.stage}** 시기예요. ${L.stageDesc}.`,
  );
}

const FOOTER = '_이 보고서는 AI 연결이 원활하지 않아 기본 분석 엔진으로 작성되었습니다. 잠시 뒤 다시 시도하면 더 자세한 AI 분석 보고서를 받아볼 수 있어요._';

/* ─────────────────────────── 보고서 생성 ─────────────────────────── */

/**
 * 규칙 기반 급별 종합 보고서를 마크다운 문자열로 만든다.
 * @param {{student?:{name?:string,school?:string,grade?:string}, level?:string, results?:object}} payload
 * @returns {string} 마크다운
 */
export function buildFallbackReport(payload = {}) {
  const c = makeContext(payload.student || {}, payload.level, payload.results || {});
  return [
    header(c),
    discSection(c),
    mbtiSection(c),
    miSection(c),
    riasecSection(c),
    summarySection(c),
    FOOTER,
  ].join('\n\n---\n\n') + '\n';
}

export default buildFallbackReport;
