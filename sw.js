// 행사장 와이파이가 끊겨도 앱이 열리도록 하는 최소한의 오프라인 캐시입니다.
// 해시가 붙은 번들은 프리캐시하지 않고(배포마다 이름이 바뀝니다) 요청될 때 담습니다.
const CACHE = "photobooth-v2";
// 이름이 고정된 파일만 프리캐시합니다. 폰트 서브셋(구글 unicode-range 조각)은 수백 개라
// 여기 넣지 않고, 실제로 쓰인 조각만 아래 fetch 핸들러가 캐시에 담습니다.
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./fonts/korean.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // 문서는 네트워크 우선 — 배포 직후 낡은 화면이 뜨지 않게. 실패하면 캐시로 폴백합니다.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("./index.html"))),
    );
    return;
  }

  // 나머지는 캐시 우선. response.ok 를 확인하지 않으면 404 응답이 영구 캐싱되어
  // 배포를 고쳐도 계속 깨진 파일이 나옵니다 — 반드시 성공 응답만 담습니다.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
