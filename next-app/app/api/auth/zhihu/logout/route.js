import { NextResponse } from 'next/server';
import { appOrigin } from '../../../../../lib/app-origin';

function clearCookies(response) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  };
  response.cookies.set('zhihu_oauth_token', '', cookieOptions);
  response.cookies.set('zhihu_oauth_state', '', cookieOptions);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST() {
  return clearCookies(NextResponse.json({ ok: true, redirect: '/same-frequency/index.html?logged_out=1' }, { headers: { 'Cache-Control': 'no-store' } }));
}

export async function GET(request) {
  return clearCookies(NextResponse.redirect(new URL('/same-frequency/index.html?logged_out=1', appOrigin(request))));
}
