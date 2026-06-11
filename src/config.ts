import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, "..");
const CONFIG_FILE = path.join(SKILL_DIR, "config.json");

export interface VisionConfig {
  base_url: string;
  api_key: string;
  model: string;
  language: string;
}

const DEFAULT_CONFIG: VisionConfig = {
  base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  api_key: "",
  model: "qwen3.5-omni-plus",
  language: "zh",
};

export function loadConfig(): VisionConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      return { ...DEFAULT_CONFIG, ...raw };
    }
  } catch {
    // ignore parse errors, return default
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<VisionConfig>): VisionConfig {
  const current = loadConfig();
  const updated = { ...current, ...config };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "❌ 未设置";
  return `****${key.slice(-4)}`;
}
