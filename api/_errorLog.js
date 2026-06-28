// AI 응답 실패 시 구글시트로 기록 — Vercel 로그(1시간 후 삭제)와 달리 영구 보관.
// 성공 경로에는 전혀 영향 없음(이 함수는 에러 분기에서만 호출됨).
export async function logError(endpoint, message) {
  const url = process.env.ERROR_LOG_WEBHOOK_URL;
  if (!url) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, message: String(message ?? '') }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (_) {
    // 로그 기록 자체가 실패해도 본래 에러 응답에는 영향 주지 않음
  }
}
