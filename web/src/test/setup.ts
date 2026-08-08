import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/reactの自動cleanupはグローバルなafterEachを検出して自己登録するが、
// vitest.config.tsではtest.globalsを有効化していない（明示import方針のため）ので、
// ここで明示的にcleanupを行い、テストごとにDOMが残らないようにする。
afterEach(() => {
  cleanup();
});
