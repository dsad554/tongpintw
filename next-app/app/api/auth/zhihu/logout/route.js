import { NextResponse } from 'next/server';

export async function GET(request) {
  const response = NextResponse.redirect(new URL('/same-frequency/index.html?logged_out=1', request.url));
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
