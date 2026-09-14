import { NextResponse } from 'next/server';

const ENDPOINT = 'https://developer.zhihu.com/api/mcp/zhida/v1/stream';

function textFromResult(body) {
  const content = body?.result?.content;
  if (!Array.isArray(content)) return '';
  return content.filter((item) => item?.type === 'text' && typeof item.text === 'string').map((item) => item.text.trim()).filter(Boolean).join('\n\n');
}

export async function POST(request) {
  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) return NextResponse.json({ solved: false, error: 'zhida_not_configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  let input;
  try { input = await request.json(); } catch { return NextResponse.json({ solved: false, error: 'invalid_json' }, { status: 400 }); }
  const query = String(input?.query || '').trim();
  if (!query) return NextResponse.json({ solved: false, error: 'query_required' }, { status: 400 });
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'zhida', arguments: { query, model: 'zhida-fast-1p5' } } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.json().catch(() => ({}));
    const answer = textFromResult(body);
    if (!response.ok || body?.error || body?.result?.isError || !answer) return NextResponse.json({ solved: false, error: 'zhida_failed' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ solved: true, answer }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ solved: false, error: 'zhida_unavailable' }, { status: 504, headers: { 'Cache-Control': 'no-store' } }); }
}
