import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Managed Agents（Claude API）用クライアント。
 * 認証は環境変数 ANTHROPIC_API_KEY、または `ant auth login` のプロファイルから解決される
 * （ゼロ引数コンストラクタで自動解決 — claude-api skill 参照）。
 */
export const client = new Anthropic();
