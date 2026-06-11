import fs from "node:fs";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

/** Supported image extensions mapped to MIME sub-type */
const EXTS: Record<string, string> = {
  jpg: "jpeg", jpeg: "jpeg", png: "png",
  gif: "gif", webp: "webp", bmp: "bmp",
};

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export interface ImageInput {
  source: string;       // file path or URL
  isUrl: boolean;
}

export interface AnalyzeOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  images: ImageInput[];
  prompt: string;
}

/**
 * Validate an image input.
 * For local files: check existence, size, extension.
 * URLs are validated at request time.
 */
export function validateImage(img: ImageInput): string | null {
  if (img.isUrl) return null;

  const resolved = path.resolve(img.source);
  if (!fs.existsSync(resolved)) return `文件不存在: ${resolved}`;
  const stat = fs.statSync(resolved);
  if (stat.size === 0) return `空文件: ${resolved}`;
  if (stat.size > MAX_SIZE) {
    const mb = (stat.size / 1024 / 1024).toFixed(1);
    return `文件过大 (${mb}MB)，最大 20MB: ${resolved}`;
  }
  const ext = path.extname(resolved).toLowerCase().replace(".", "");
  if (!EXTS[ext]) {
    return `不支持的格式: .${ext}（支持: ${Object.keys(EXTS).join(", ")}）`;
  }
  return null;
}

/** Resolve an image input to a data URI or URL */
function resolveImageUrl(img: ImageInput): string {
  if (img.isUrl) return img.source;
  const resolved = path.resolve(img.source);
  const ext = path.extname(resolved).toLowerCase().replace(".", "");
  const mime = EXTS[ext] || "jpeg";
  const base64 = fs.readFileSync(resolved).toString("base64");
  return `data:image/${mime};base64,${base64}`;
}

/**
 * Call the OpenAI-compatible vision API with retry.
 */
async function callVisionAPI(
  baseUrl: string,
  apiKey: string,
  model: string,
  images: ImageInput[],
  prompt: string,
  retries = 2,
): Promise<string> {
  const url = new URL(baseUrl.replace(/\/?$/, "/") + "chat/completions");
  const content: unknown[] = images.map((img) => ({
    type: "image_url",
    image_url: { url: resolveImageUrl(img) },
  }));
  content.push({ type: "text", text: prompt });

  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content }],
    stream: false,
    max_tokens: 4096,
  });

  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const req = transport(
          url,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk: string) => (data += chunk));
            res.on("end", () => {
              if (res.statusCode === 429 || (res.statusCode! >= 500 && res.statusCode! < 600)) {
                return reject(new Error(`HTTP ${res.statusCode}`));
              }
              if (res.statusCode! >= 400) {
                return reject(new Error(`API ${res.statusCode}: ${data.slice(0, 300)}`));
              }
              try {
                const parsed = JSON.parse(data);
                const text = parsed?.choices?.[0]?.message?.content ?? data;
                resolve(text);
              } catch {
                resolve(data);
              }
            });
          },
        );
        req.on("error", reject);
        req.write(body);
        req.end();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < retries && (msg.startsWith("HTTP 429") || msg.startsWith("HTTP 5"))) {
        const delay = (attempt + 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error("API request failed after retries");
}

/** Analyze images and return description text */
export async function analyzeImages(
  options: AnalyzeOptions,
): Promise<string> {
  const { baseUrl, apiKey, model, images, prompt } = options;
  return callVisionAPI(baseUrl, apiKey, model, images, prompt);
}
