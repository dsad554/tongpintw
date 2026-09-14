export function appOrigin(request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || requestUrl.host;
  const host = forwardedHost.split(',')[0].trim();
  const hostname = host.split(':')[0].toLowerCase();
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (local) return `http://${host}`;

  const protocol = (request.headers.get('x-forwarded-proto') || requestUrl.protocol.replace(':', '')).split(',')[0].trim();
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && local) {
    try {
      const configuredUrl = new URL(configured);
      if (['localhost', '127.0.0.1', '::1'].includes(configuredUrl.hostname.toLowerCase())) return `${configuredUrl.protocol}//${host}`;
    } catch {
      // Fall through to the request origin.
    }
  }
  return `${protocol}://${host}`;
}
