/* Land-KM online-first service worker. No request or response is cached. */
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.mode !== 'navigate' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(fetch(request).catch(() => new Response(
    '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Land-KM ออฟไลน์</title><main style="font-family:Tahoma,sans-serif;max-width:38rem;margin:12vh auto;padding:1.5rem;color:#17233b"><h1>Land-KM</h1><p>ไม่สามารถเชื่อมต่อเครือข่ายได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต</p></main></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )));
});
