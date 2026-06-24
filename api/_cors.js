const ALLOWED_ORIGINS = [
  'https://celescode.com',
  'https://www.celescode.com',
  'https://csw-saju.vercel.app',
];

// true를 반환하면 OPTIONS 프리플라이트 요청이므로 호출부에서 즉시 return해야 함
export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
