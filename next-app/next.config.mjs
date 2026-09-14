/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/api/state', destination: 'http://127.0.0.1:51283/api/state' },
      { source: '/api/friends/:path*', destination: 'http://127.0.0.1:51283/api/friends/:path*' },
      { source: '/api/questions/:path*', destination: 'http://127.0.0.1:51283/api/questions/:path*' },
      { source: '/api/match', destination: 'http://127.0.0.1:51283/api/match' },
      { source: '/api/messages', destination: 'http://127.0.0.1:51283/api/messages' },
      { source: '/api/topics/:path*', destination: 'http://127.0.0.1:51283/api/topics/:path*' },
      { source: '/api/cards/:path*', destination: 'http://127.0.0.1:51283/api/cards/:path*' },
      { source: '/api/achievements', destination: 'http://127.0.0.1:51283/api/achievements' },
    ];
  },
};
export default nextConfig;
