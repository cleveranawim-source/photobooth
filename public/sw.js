// 행사장 와이파이가 끊겨도 앱이 열리도록 하는 최소한의 오프라인 캐시입니다.
// 해시가 붙은 번들은 프리캐시하지 않고(배포마다 이름이 바뀝니다) 요청될 때 담습니다.
// 아이콘·폰트처럼 이름이 그대로인 파일을 바꿨다면 반드시 올려야 합니다.
// 캐시 우선 전략이라 버전을 안 올리면 이미 설치된 기기가 옛 파일을 계속 씁니다.
const CACHE = "photobooth-v5";
// 문서 요청에서 네트워크를 기다려 주는 상한. 넘기면 캐시본으로 먼저 엽니다.
const NAVIGATE_TIMEOUT_MS = 3000;
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
  // 단, 행사장 와이파이는 "연결은 됐는데 응답이 없는" 상태가 잦아 실패를 기다리면 앱이
  // 수십 초 멈춥니다. 그래서 상한을 두고, 그 안에 못 받으면 캐시본으로 먼저 열어 줍니다.
  // 캐시도 없을 때만 네트워크 응답을 끝까지 기다립니다.
  if (request.mode === "navigate") {
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    });
    const timeout = new Promise((resolve) => setTimeout(() => resolve(undefined), NAVIGATE_TIMEOUT_MS));
    event.respondWith(
      Promise.race([network.catch(() => undefined), timeout]).then(
        (response) =>
          response ||
          caches
            .match(request)
            .then((hit) => hit || caches.match("./index.html"))
            .then((hit) => hit || network),
      ),
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
