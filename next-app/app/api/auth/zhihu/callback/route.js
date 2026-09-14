import { NextResponse } from 'next/server';
import { exchangeCode } from '../../../../../lib/zhihu';

function appUrl(request) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

export async function GET(request) {
  const url = new URL(request.url);
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return NextResponse.redirect(new URL(`/same-frequency/index.html?error=oauth_${encodeURIComponent(oauthError)}`, appUrl(request)));
  }

  const code = url.searchParams.get('authorization_code') || url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = request.cookies.get('zhihu_oauth_state')?.value;
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.json({ error: 'OAuth 回调参数无效' }, { status: 400 });
  }

  try {
    const token = await exchangeCode(code);
    const response = NextResponse.redirect(new URL('/same-frequency/index.html', appUrl(request)));
    response.cookies.set('zhihu_oauth_token', token.access_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: Number(token.expires_in) || 3600,
      path: '/',
    });
    response.cookies.set('zhihu_oauth_state', '', { maxAge: 0, path: '/' });
    return response;
  } catch {
    return NextResponse.json({ error: '知乎 OAuth token 交换失败' }, { status: 502 });
  }
}
