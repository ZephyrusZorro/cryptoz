import { gateway } from '../server/gateway.js';
import { handleNodeRequest } from '../server/node-adapter.js';
import release from '../package.json' with { type: 'json' };

export function marketRequestUrl(requestUrl) {
  const url = new URL(requestUrl, 'http://localhost');
  // Vercel adds the dynamic file name parameter to the Node request URL.
  if (url.pathname.startsWith('/api/')) url.searchParams.delete('route', url.pathname.slice(5));
  return url;
}

function respond(request) {
  if (!['/healthz', '/api/healthz'].includes(new URL(request.url).pathname)) return gateway(request);
  const headers = { 'Cache-Control': 'no-store' };
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  }
  return new Response(request.method === 'HEAD' ? null : JSON.stringify({ status: 'ok', service: 'CRYPTOZ', version: release.version }), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

export default function handler(req, res) {
  return handleNodeRequest(req, res, respond, marketRequestUrl(req.url));
}
