// Service Worker: 任意中转站都能用
//  - 同域名(本代理本身)的请求 -> 直接放行(交给 Cloudflare Functions 的 /api)
//  - 跨域请求:
//      · 若中转站 origin 在「需要走代理」列表 -> 重写为本代理 /api/proxy，真实地址放 x-proxy-target 请求头
//      · 否则 -> 原样放行(直连中转站，不走代理)
//  「需要走代理」列表由 proxy-manage.html 写入 Cache(ic-proxy-cache / ic-proxy-list)
//
//  注意：是否走代理完全由「列表里的域名」决定，与请求路径无关——
//  这样无论中转站用 /v1、/openai 还是自定义路径，只要在列表里就一定走代理。

const PROXY_ORIGIN = self.location.origin; // 例如 https://infinite-canvas-9ec.pages.dev
const PROXY_PATH = '/api/proxy';
const CACHE_NAME = 'ic-proxy-cache';
const LIST_KEY = 'ic-proxy-list';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function getProxyList() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(LIST_KEY);
    if (res) {
      const txt = await res.text();
      const arr = JSON.parse(txt || '[]');
      return Array.isArray(arr) ? arr : [];
    }
  } catch (e) {}
  return [];
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const method = req.method;
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method)) return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // 同域名直接放行(静态资源 / /api 函数)
  if (url.hostname === self.location.hostname) return;

  event.respondWith((async () => {
    const list = await getProxyList();
    const needProxy = list.some((o) => {
      try { return new URL(o).hostname === url.hostname; } catch { return o === url.hostname || o === url.origin; }
    });

    // 直连中转站：原样放行，不走代理
    if (!needProxy) {
      return fetch(req);
    }

    // 走代理：把真实完整请求 URL 放进 x-proxy-target 请求头，统一打到 /api/proxy
    const headers = new Headers();
    for (const [k, v] of req.headers.entries()) {
      if (/^(host|origin|referer|connection|content-length|sec-fetch|sec-|proxy-)/i.test(k)) continue;
      headers.set(k, v);
    }
    headers.set('x-proxy-target', req.url);

    const init = {
      method,
      headers,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      referrer: req.referrer,
    };
    if (method !== 'GET' && method !== 'HEAD') {
      init.body = req.body;
      init.duplex = 'half';
    }

    if (method === 'OPTIONS') {
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

    const proxyUrl = `${PROXY_ORIGIN}${PROXY_PATH}`;
    try {
      const resp = await fetch(proxyUrl, init);
      const outHeaders = new Headers(resp.headers);
      outHeaders.set('Access-Control-Allow-Origin', '*');
      outHeaders.set('Access-Control-Allow-Headers', '*');
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: outHeaders });
    } catch (err) {
      return new Response(JSON.stringify({
        error: 'sw_proxy_error',
        message: String((err && err.message) || err),
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  })());
});
