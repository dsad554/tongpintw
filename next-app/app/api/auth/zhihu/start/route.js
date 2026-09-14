import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { oauthAuthorizeUrl, oauthConfigured } from '../../../../../lib/zhihu';
function appUrl(request) { return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin; }
export async function GET(request) { if (!oauthConfigured()) return NextResponse.redirect(new URL('/same-frequency/index.html?error=oauth_not_configured', appUrl(request))); const state = randomUUID(); const response = NextResponse.redirect(oauthAuthorizeUrl(state).toString()); response.cookies.set('zhihu_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 600, path: '/' }); return response; }
