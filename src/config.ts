import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Search order for config.json */
function findConfigFile(): string {
  // 1. Package directory (works for local dev)
  const pkgDir = path.resolve(__dirname, "..");
  const pkgPath = path.join(pkgDir, "config.json");
  if (fs.existsSync(pkgPath)) return pkgPath;

  // 2. Current working directory (works for npx users)
  const cwdPath = path.join(process.cwd(), "config.json");
  if (fs.existsSync(cwdPath)) return cwdPath;

  // 3. Default: write to CWD so user can find it
  return path.join(process.cwd(), "config.json");
}

const CONFIG_FILE = findConfigFile();

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
  // Env vars override everything
  if (process.env.VISION_API_KEY) {
    return {
      base_url: process.env.VISION_BASE_URL || DEFAULT_CONFIG.base_url,
      api_key: process.env.VISION_API_KEY,
      model: process.env.VISION_MODEL || DEFAULT_CONFIG.model,
      language: (process.env.VISION_LANGUAGE as VisionConfig["language"]) || DEFAULT_CONFIG.language,
    };
  }

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
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error(`警告: 无法写入配置文件 ${CONFIG_FILE}: ${err}`);
  }
  return updated;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "❌ 未设置";
  return `****${key.slice(-4)}`;
}
