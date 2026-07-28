import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 오프라인에서도 열리도록 서비스 워커를 등록합니다(행사장 와이파이가 끊겨도 동작).
//
// **개발 중에는 등록하지 않습니다.** sw.js 는 문서 외 요청에 캐시 우선이라, dev 서버가 주는
// `/src/**.ts` 까지 캐시에 담아 버립니다. 그러면 소스를 고쳐도 브라우저는 옛 모듈을 계속 써서
// "고쳤는데 화면이 그대로"인 상태가 됩니다(실제로 여러 번 헤맸습니다 — 배포본은 Vite 가
// 파일명에 해시를 붙여 주므로 이 문제가 없고, 오직 dev 에서만 생깁니다).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
} else if ("serviceWorker" in navigator) {
  // 이미 등록해 둔 기기(=예전에 dev 로 열어 본 브라우저)에서 옛 캐시를 계속 쓰지 않도록 걷어냅니다.
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
    .catch(() => undefined);
}
