// Cloudflare Pages Function: 老配置向后兼容
// 访问 /api/v1/... -> 固定转发到 https://forkc2p.com/v1/...
// （无限画布里把 Base URL 填成 https://infinite-canvas-9ec.pages.dev/api/v1 时走这里）

const TARGET_ORIGIN = 'https://forkc2p.com';

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const remainder = url.pathname.replace(/^\/api\/v1\/?/, '') || '';
  const targetUrl = TARGET_ORIGIN + '/v1/' + remainder.replace(/^\/+/, '') + url.search;

  const headers = new Headers();
  for (const [k, v] of request.headers.entries()) {
    if (/^(host|origin|referer|connection|content-length|sec-fetch|sec-|proxy-)/i.test(k)) continue;
    headers.set(k, v);
  }

  const init = { method: request.method, headers, redirect: 'follow' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'proxy_upstream_error',
      message: String((e && e.message) || e),
      target: targetUrl,
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const respHeaders = new Headers(upstream.headers);
  respHeaders.set('Access-Control-Allow-Origin', '*');
  respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  respHeaders.set('Access-Control-Allow-Headers', '*');
  respHeaders.set('Access-Control-Expose-Headers', '*');
  respHeaders.delete('content-encoding');
  respHeaders.delete('content-length');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}
