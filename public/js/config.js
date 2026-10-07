// 보고서 요청을 보낼 서버 주소.
// - 서버(server.js)가 화면까지 함께 내보내는 경우(내 컴퓨터, Render 주소): 빈 문자열 → 같은 주소로 요청한다.
// - 깃허브 페이지스(github.io)에서는 화면만 있고 서버가 없으므로, AI 보고서를 만드는 Render 서버 주소를 쓴다.
//   서버가 응답하지 않으면 report.js 가 브라우저 안의 기본 분석 엔진으로 보고서를 만든다.
export const RENDER_API = 'https://jinro-navigator.onrender.com';

export const API_BASE = location.hostname.endsWith('.github.io') ? RENDER_API : '';
