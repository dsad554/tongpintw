import { NextResponse } from 'next/server';
import { configured, zhihuApi } from '../../../lib/zhihu';
export async function GET(request) {
  if (!configured()) return NextResponse.json({ error: '服务端尚未配置知乎 Access Secret' }, { status: 503 });
  try {
    const data = await zhihuApi('/content/hot_list', { Limit: 30 });
    return NextResponse.json({ items: data?.Items || data?.items || data || [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
