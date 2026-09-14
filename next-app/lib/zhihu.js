const OPEN = 'https://openapi.zhihu.com';
const API = 'https://developer.zhihu.com/api/v1';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function zhihuApi(path, search = {}, oauthToken) {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(search)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  const headers = { Authorization: `Bearer ${required('ZHIHU_ACCESS_SECRET')}`, 'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)) };
  if (oauthToken) headers['X-OAuth-Token'] = oauthToken;
  const response = await fetch(url, { headers, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.Code !== 0) throw new Error(body.Message || `Zhihu API HTTP ${response.status}`);
  return body.Data;
}

export async function zhihuUser(token) {
  const response = await fetch(`${OPEN}/user`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.uid) throw new Error('知乎用户信息读取失败');
  return body;
}

export function oauthAuthorizeUrl(state) {
  const url = new URL(`${OPEN}/authorize`);
  url.searchParams.set('redirect_uri', required('ZHIHU_OAUTH_REDIRECT_URI'));
  url.searchParams.set('app_id', required('ZHIHU_OAUTH_APP_ID'));
  url.searchParams.set('response_type', 'code');
  if (state) url.searchParams.set('state', state);
  return url;
}

export async function exchangeCode(code) {
  const form = new URLSearchParams({ app_id: required('ZHIHU_OAUTH_APP_ID'), app_key: required('ZHIHU_OAUTH_APP_KEY'), grant_type: 'authorization_code', redirect_uri: required('ZHIHU_OAUTH_REDIRECT_URI'), code });
  const response = await fetch(`${OPEN}/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error('知乎 OAuth token 交换失败');
  return body;
}

export function configured() { return Boolean(process.env.ZHIHU_ACCESS_SECRET && process.env.ZHIHU_OAUTH_APP_ID && process.env.ZHIHU_OAUTH_APP_KEY && process.env.ZHIHU_OAUTH_REDIRECT_URI); }
export function oauthConfigured() { return Boolean(process.env.ZHIHU_OAUTH_APP_ID && process.env.ZHIHU_OAUTH_APP_KEY && process.env.ZHIHU_OAUTH_REDIRECT_URI); }
