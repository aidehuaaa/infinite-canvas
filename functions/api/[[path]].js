// Cloudflare Pages Function: 浏览器 -> 本函数(加 CORS) -> forkc2p(带浏览器传来的 key)
// 部署后地址形如 https://infinite-canvas-9ec.pages.dev/api/v1/...
// 在无限画布里把 Base URL 填成 https://infinite-canvas-9ec.pages.dev/api/v1 即可

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

  // 去掉 /api 前缀，保留剩余路径与查询串
  const rewritePath = url.pathname.replace(/^\/api(\/.*)?$/, '$1') || '/';
  const targetUrl = TARGET_ORIGIN + rewritePath + url.search;

  // 透传请求头（含浏览器带来的 Authorization: Bearer <key>），只删 host 让 fetch 自设
  const headers = new Headers(request.headers);
  headers.delete('host');

  const init = {
    method: request.method,
    headers,
    redirect: 'follow',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (e) {
    return new Response('Proxy upstream error: ' + e.message, { status: 502 });
  }

  const respHeaders = new Headers(upstream.headers);
  respHeaders.set('Access-Control-Allow-Origin', '*');
  respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  respHeaders.set('Access-Control-Allow-Headers', '*');
  // 透传流式响应，删除可能与流式不匹配的压缩/长度头
  respHeaders.delete('content-encoding');
  respHeaders.delete('content-length');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}
