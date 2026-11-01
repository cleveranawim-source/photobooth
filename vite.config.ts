import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 상대 경로로 빌드해 정적 호스팅의 하위 경로(/저장소이름/)에서도 그대로 동작하게 합니다.
  base: "./",
  plugins: [react()],
  server: {
    port: 4173,
  },
  test: {
    // .claude/worktrees 아래 사본의 테스트를 두 번 세지 않게 — 워크트리에서 작업하는 동안 main 의 npm test 가 44개로 불던 문제
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
});
