import { NextResponse } from 'next/server';
import { zhihuUser } from '../../../lib/zhihu';
export async function GET(request) { const token = request.cookies.get('zhihu_oauth_token')?.value; if (!token) return NextResponse.json({ user: null }); try { return NextResponse.json({ user: await zhihuUser(token) }); } catch (error) { return NextResponse.json({ user: null, error: error.message }, { status: 401 }); } }
