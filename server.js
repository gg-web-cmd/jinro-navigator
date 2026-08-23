// 진로 잠재력 내비게이터 웹 서버.
// public 폴더를 정적으로 서빙하고, 요청의 학교급(level: elem/mid/high)에 맞춰
// Upstage Solar API로 급별 맞춤 종합 보고서를 만들어 준다.
// API 키가 없거나 호출이 실패해도 규칙 기반 급별 폴백 보고서를 반드시 200으로 돌려준다.

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSystemPrompt, buildUserMessage } from './lib/prompt.js';
import { buildFallbackReport } from './lib/fallback.js';
import { DEFAULT_LEVEL, isValidLevel, getLevel } from './public/js/data/levels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.UPSTAGE_MODEL || 'solar-pro4';
const API_URL = 'https://api.upstage.ai/v1/chat/completions';
// 보고서 한 편을 쓰는 데 실측 160~190초가 걸린다(고교 기준). 넉넉히 잡지 않으면
// 다 써 가던 보고서를 버리고 폴백으로 떨어진다. 스트리밍이라 학생은 글이 흘러나오는 걸 계속 본다.
const TIMEOUT_MS = 300_000;

// 학교급마다 보고서 분량이 다르다. 초등은 짧고 쉽게, 고교는 선택과목·학과까지 담아 길게.
// 아래 값은 reasoning_effort:'none' (추론 토큰 0) 기준이다. 추론을 켜면 이 예산을 추론이 먹어
// 보고서가 5장을 못 채우고 문장 중간에서 잘린다. 실측: 고교 본문 11,592자 = 완성 4,440토큰.
const MAX_TOKENS = { elem: 6000, mid: 8000, high: 10000 };

// 학교는 IP를 공유하므로 넉넉하게 잡는다. 초과해도 차단이 아니라 폴백으로 강등한다.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const NOTICE = {
  nokey: 'AI 연결 설정이 아직 되어 있지 않아, 기본 분석 엔진으로 보고서를 만들었어요.',
  failed: 'AI 서버와 연결이 원활하지 않아, 기본 분석 엔진으로 보고서를 만들었어요. 잠시 뒤 다시 시도해 볼 수 있어요.',
  limited: '지금 보고서 요청이 많아 기본 분석 엔진으로 보고서를 만들었어요. 조금 뒤에 다시 시도하면 AI 보고서를 받아볼 수 있어요.',
};

const hasKey = () => Boolean((process.env.UPSTAGE_API_KEY || '').trim());

/* ─────────────────────────── 레이트리밋 (인메모리) ─────────────────────────── */

const hits = new Map(); // ip -> number[] (요청 시각)

function overLimit(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_LIMIT;
}

// 오래된 기록은 주기적으로 비운다. (서버 종료를 막지 않도록 unref)
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) {
    const alive = list.filter((t) => now - t < RATE_WINDOW_MS);
    if (alive.length) hits.set(ip, alive);
    else hits.delete(ip);
  }
}, 10 * 60 * 1000).unref();

/* ─────────────────────────── 요청 검증 ─────────────────────────── */

const TEST_KEYS = ['disc', 'mbti', 'mi', 'riasec'];
const KOREAN_NAME = { disc: 'DISC', mbti: 'MBTI', mi: '다중지능', riasec: 'RIASEC' };

const str = (v, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** 본문을 검증하고 안전한 payload 로 정리한다. */
function validate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '요청 형식이 올바르지 않습니다.' };
  }
  const results = body.results;
  if (!results || typeof results !== 'object' || Array.isArray(results)) {
    return { ok: false, error: '검사 결과(results)가 없습니다.' };
  }
  const missing = TEST_KEYS.filter(
    (k) => !results[k] || typeof results[k] !== 'object' || Array.isArray(results[k]),
  );
  if (missing.length) {
    return {
      ok: false,
      error: `${missing.map((k) => KOREAN_NAME[k]).join(', ')} 검사 결과가 아직 없습니다. 네 가지 검사를 모두 마친 뒤 다시 시도해 주세요.`,
    };
  }
  const s = body.student && typeof body.student === 'object' ? body.student : {};
  // 학교급이 없거나 알 수 없는 값이면 중학(mid)으로 보정한다. 이 값 하나로 프롬프트·분량·폴백이 모두 갈린다.
  const level = isValidLevel(body.level) ? body.level : DEFAULT_LEVEL;
  return {
    ok: true,
    payload: {
      level,
      student: { name: str(s.name, 20), school: str(s.school, 40), grade: str(s.grade, 20) },
      results: {
        disc: results.disc,
        mbti: results.mbti,
        mi: results.mi,
        riasec: results.riasec,
      },
    },
  };
}

/* ─────────────────────────── Upstage 호출 ─────────────────────────── */

function requestBody(payload, stream) {
  const level = payload.level || DEFAULT_LEVEL;
  const base = {
    model: MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt(level) },
      { role: 'user', content: buildUserMessage(payload) },
    ],
    temperature: 0.7,
    max_tokens: MAX_TOKENS[level] ?? MAX_TOKENS[DEFAULT_LEVEL],
    // 반드시 'none'. 보고서는 정해진 목차를 채우는 글쓰기 작업이라 추론이 품질을 올려주지 않는데,
    // 추론 토큰은 max_tokens 예산을 함께 쓰기 때문에 본문이 잘린다.
    // 실측(고교, max_tokens 9000): 'low' → 추론 4,097토큰 소모, 본문 8,661자에서 절단 / 'none' → 추론 0, 본문 11,592자 완결.
    reasoning_effort: 'none',
  };
  return stream ? { ...base, stream: true, stream_options: { include_usage: true } } : base;
}

/** 응답 타임아웃(TIMEOUT_MS)과 외부 취소를 함께 거는 AbortController */
function makeAbort(externalSignal) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const onAbort = () => ac.abort();
  if (externalSignal) externalSignal.addEventListener('abort', onAbort, { once: true });
  return {
    signal: ac.signal,
    done() {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    },
  };
}

async function callUpstage(payload, stream, externalSignal) {
  const guard = makeAbort(externalSignal);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody(payload, stream)),
      signal: guard.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Upstage ${res.status} ${detail.slice(0, 300)}`);
    }
    if (!stream) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      if (!text.trim()) throw new Error('Upstage 응답이 비어 있습니다.');
      return { text: text.trim(), close: guard.done };
    }
    return { body: res.body, close: guard.done };
  } catch (err) {
    guard.done();
    throw err;
  }
}

/**
 * SSE 한 줄에서 delta.content 를 뽑는다.
 * @returns 문자열 조각 | undefined(무시할 줄) | null([DONE] — 스트림 종료)
 */
function parseSseLine(raw) {
  const line = raw.trim(); // \r\n 줄바꿈도 여기서 정리된다
  if (!line || !line.startsWith('data:')) return undefined; // 빈 줄, ": ping" 주석
  const data = line.slice(5).trim();
  if (data === '[DONE]') return null;
  try {
    return JSON.parse(data)?.choices?.[0]?.delta?.content || undefined;
  } catch {
    return undefined; // 잘린 조각이나 알 수 없는 줄은 조용히 무시한다.
  }
}

/** SSE 본문 스트림에서 delta.content 조각을 뽑아 준다. */
async function* iterateDeltas(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const piece = parseSseLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (piece === null) return;
        if (piece) yield piece;
      }
    }
    // [DONE] 이나 끝 개행 없이 스트림이 닫힌 경우, 버퍼에 남은 마지막 줄도 흘려보낸다.
    buffer += decoder.decode();
    const tail = parseSseLine(buffer);
    if (tail) yield tail;
  } finally {
    try { await reader.cancel(); } catch { /* 이미 닫힘 */ }
  }
}

/* ─────────────────────────── 폴백 보고서 ─────────────────────────── */

/** 폴백은 마지막 보루다. 여기서 예외가 나도 응답은 반드시 나가야 한다. (payload.level 로 급별 보고서를 만든다) */
function safeFallbackReport(payload) {
  try {
    return buildFallbackReport(payload);
  } catch (err) {
    console.error(`[fallback] 폴백 보고서 생성 실패(${payload?.level ?? '-'}) → 최소 안내문으로 대체:`, err.message);
    const name = (payload?.student?.name || '').trim() || '학생';
    return [
      `# ✨ ${name}님을 위한 진로 잠재력 종합 보고서 ✨`,
      '',
      '지금은 보고서를 만드는 데 문제가 생겼어요. 검사 결과를 다시 확인한 뒤 잠시 후 다시 시도해 주세요.',
      '',
    ].join('\n');
  }
}

/* ─────────────────────────── 앱 ─────────────────────────── */

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// 잘못된 JSON 본문도 한국어 JSON 으로 돌려준다.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '요청 내용을 읽지 못했습니다. 다시 시도해 주세요.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: '보낸 자료가 너무 큽니다.' });
  }
  return next(err);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasKey: hasKey(), model: MODEL });
});

/* ── 비스트리밍 보고서 ── */
app.post('/api/report', async (req, res) => {
  const v = validate(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });
  const payload = v.payload;

  const fallback = (notice) =>
    res.json({
      markdown: safeFallbackReport(payload),
      engine: 'fallback',
      model: 'rule-based',
      notice,
    });

  if (!hasKey()) return fallback(NOTICE.nokey);
  if (overLimit(req.ip)) return fallback(NOTICE.limited);

  try {
    const { text, close } = await callUpstage(payload, false);
    close();
    return res.json({ markdown: text, engine: 'upstage', model: MODEL });
  } catch (err) {
    console.error(`[report] AI 호출 실패(${getLevel(payload.level).label}) → 폴백 보고서로 대체:`, err.message);
    return fallback(NOTICE.failed);
  }
});

/* ── 스트리밍 보고서 (SSE) ── */
app.post('/api/report/stream', async (req, res) => {
  const v = validate(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });
  const payload = v.payload;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  // 클라이언트 조기 종료 감지.
  // req 의 close 는 본문을 다 읽은 시점에도 발생하므로, 응답 쪽에서 감지해야 정확하다.
  const ac = new AbortController();
  let closed = false;
  const onClose = () => {
    if (res.writableEnded) return; // 우리가 정상적으로 끝낸 경우
    closed = true;
    ac.abort();
  };
  res.on('close', onClose);
  req.on('aborted', onClose);

  const send = (obj) => {
    if (closed || res.writableEnded) return false;
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    return true;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 첫 글자가 나오기까지 십여 초 비는 구간이 있다. 그동안 아무것도 안 보내면
  // 중간에 낀 프록시(Render, 학교 방화벽 등)가 연결을 끊어 버릴 수 있어 주석 줄로 심장박동을 보낸다.
  // SSE 주석(: 로 시작)은 클라이언트가 무시하므로 보고서 내용에 섞이지 않는다.
  const heartbeat = setInterval(() => {
    if (closed || res.writableEnded) return;
    res.write(': keep-alive\n\n');
  }, 15_000);
  const stopHeartbeat = () => clearInterval(heartbeat);
  res.on('close', stopHeartbeat);
  res.on('finish', stopHeartbeat);

  // 폴백 보고서를 조금씩 흘려보낸 뒤 done 으로 마무리한다.
  async function streamFallback(notice, alreadyStreamed) {
    const markdown = safeFallbackReport(payload);
    if (!alreadyStreamed) {
      send({ type: 'meta', engine: 'fallback', model: 'rule-based', notice });
      for (let i = 0; i < markdown.length; i += 80) {
        if (!send({ type: 'delta', text: markdown.slice(i, i + 80) })) break;
        await sleep(8);
      }
    }
    send({ type: 'done', engine: 'fallback', model: 'rule-based', markdown, notice });
    if (!res.writableEnded) res.end();
  }

  if (!hasKey()) return streamFallback(NOTICE.nokey, false);
  if (overLimit(req.ip)) return streamFallback(NOTICE.limited, false);

  let upstream;
  try {
    upstream = await callUpstage(payload, true, ac.signal);
  } catch (err) {
    if (closed) return;
    console.error(`[report/stream] 연결 실패(${getLevel(payload.level).label}) → 폴백:`, err.message);
    return streamFallback(NOTICE.failed, false);
  }

  send({ type: 'meta', engine: 'upstage', model: MODEL });

  let full = '';
  try {
    for await (const piece of iterateDeltas(upstream.body)) {
      if (closed) break;
      full += piece;
      send({ type: 'delta', text: piece });
    }
  } catch (err) {
    upstream.close();
    if (closed) return;
    console.error('[report/stream] 스트림 중단 → 폴백:', err.message);
    return streamFallback(NOTICE.failed, full.length > 0);
  }
  upstream.close();
  if (closed) return;

  if (!full.trim()) {
    console.error('[report/stream] 빈 응답 → 폴백');
    return streamFallback(NOTICE.failed, false);
  }

  send({ type: 'done', engine: 'upstage', model: MODEL, markdown: full.trim() });
  if (!res.writableEnded) res.end();
});

// 알 수 없는 API 경로는 항상 JSON 으로 응답한다.
app.use('/api', (req, res) => {
  res.status(404).json({ error: '요청하신 주소를 찾을 수 없습니다.' });
});

// 마지막 안전망 — 학생 화면에 영어 오류가 보이지 않도록 한국어 JSON 으로 감싼다.
app.use((err, req, res, next) => {
  console.error('[server] 처리되지 않은 오류:', err);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: '잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.' });
});

app.listen(PORT, () => {
  // 실행하기.bat 으로 켰을 때 이 창에 보이는 안내문이다. 배치 파일은 한글이 깨지므로
  // 사용자에게 보여줄 한국어 안내는 모두 여기(Node)에서 출력한다.
  console.log('');
  console.log('  ============================================');
  console.log('     진로 잠재력 내비게이터');
  console.log('  ============================================');
  console.log('');
  console.log('  준비가 끝났습니다. 잠시 뒤 브라우저가 저절로 열립니다.');
  console.log(`  안 열리면 주소창에 직접 입력하세요 :  http://localhost:${PORT}`);
  console.log('');
  console.log(
    `  AI 연결 : ${
      hasKey()
        ? `설정됨 (모델 ${MODEL})`
        : '미설정 — .env 에 UPSTAGE_API_KEY 를 넣으면 AI 보고서를 쓸 수 있어요. 지금은 기본 분석 엔진으로 동작합니다.'
    }`,
  );
  console.log('');
  console.log('  --------------------------------------------------');
  console.log('   끝낼 때는 이 창을 닫거나 Ctrl + C 를 누르세요.');
  console.log('   이 창을 닫으면 검사 사이트도 함께 꺼집니다.');
  console.log('  --------------------------------------------------');
  console.log('');
});
