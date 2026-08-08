import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // 各テストファイルはisolate(既定)により独立したモジュールレジストリで実行されるため、
    // ":memory:" のSQLite DBはテストファイルごとに新規・独立して作られる。
    // 実DBファイルやAnthropicへの実接続には一切触れない。
    env: {
      DB_PATH: ":memory:",
    },
    setupFiles: ["./src/test/setup.ts"],
  },
});
