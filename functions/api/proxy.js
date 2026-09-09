// Cloudflare Pages Function: 固定路由 /api/proxy
// 任意中转站转发：SW 在请求头 x-proxy-target 里放入「前端真实请求 URL」，本函数按它转发
// 同时保留 functions/api/[[...path]].js 作为老配置(/api/v1/...)的向后兼容(默认 forkc2p)

const ALLOWED = /^https?:\/\//;

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
  const target = request.headers.get('x-proxy-target') || '';
  if (!ALLOWED.test(target)) {
    return new Response(JSON.stringify({
      error: 'proxy_missing_target',
      message: 'x-proxy-target 缺失或非法，无法定位中转站',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 透传请求头（含 Authorization: Bearer <key>），删除会被 fetch 拒绝/干扰的头
  const headers = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const lk = k.toLowerCase();
    if (/^(host|origin|referer|connection|content-length|sec-fetch|sec-|proxy-|x-proxy-target)/.test(lk)) continue;
    headers.set(k, v);
  }

  const init = { method: request.method, headers, redirect: 'follow' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'proxy_upstream_error',
      message: String((e && e.message) || e),
      target,
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
