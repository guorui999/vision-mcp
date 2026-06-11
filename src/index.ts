#!/usr/bin/env node
/**
 * Vision MCP Server
 *
 * Provides image analysis capabilities to LLMs via external visual API
 * (e.g. Alibaba Cloud Bailian / Qwen models).
 *
 * Tools:
 *   vision_analyze       - Analyze image(s) from local path or URL
 *   vision_get_config    - Show current configuration
 *   vision_update_config - Update API key / model / base URL
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, saveConfig, maskApiKey } from "./config.js";
import { validateImage, analyzeImages, type ImageInput } from "./services/vision.js";
import {
  AnalyzeInputSchema,
  UpdateConfigSchema,
} from "./schemas/index.js";

// ── Server setup ──

const server = new McpServer({
  name: "vision-mcp",
  version: "1.0.0",
});

// ── Tool: vision_analyze ──

server.registerTool(
  "vision_analyze",
  {
    title: "Analyze Images",
    description: `Analyze one or more images using a vision-capable model.

Accepts local file paths (absolute) or public URLs. Supports jpg, jpeg, png, gif, webp, bmp formats.
Returns a detailed text description of image contents.

Examples:
  - "What's in this photo?" -> { images: ["/path/to/photo.jpg"] }
  - "Compare these two images" -> { images: ["img1.png", "img2.png"], prompt: "Compare these two images" }
  - "Read the text in this image" -> { images: ["https://example.com/screenshot.png"], prompt: "Extract all text from this image" }

Args:
  - images (string[]): Array of file paths or URLs (1-5 images)
  - prompt (string): What to look for in the image(s), defaults to "用中文详细描述..."
  - model (string, optional): Override the configured vision model

Returns: Detailed text description of the image(s).

Error Handling:
  - "文件不存在: <path>" if a local file is not found
  - "不支持的格式: .<ext>" for unsupported file types
  - "API 请求失败: ..." if the upstream vision API fails`,
    inputSchema: AnalyzeInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params) => {
    const config = loadConfig();
    if (!config.api_key) {
      return {
        content: [{
          type: "text",
          text: "错误: API Key 未配置。请先运行 vision_update_config 配置 API Key。",
        }],
        isError: true,
      };
    }

    // Classify inputs: absolute paths → local files, otherwise try URL detection
    const images: ImageInput[] = [];
    for (const src of params.images) {
      const isUrl = /^https?:\/\//i.test(src);
      images.push({ source: src, isUrl });
    }

    // Validate local files
    for (const img of images) {
      const err = validateImage(img);
      if (err) {
        return {
          content: [{ type: "text", text: `错误: ${err}` }],
          isError: true,
        };
      }
    }

    try {
      const result = await analyzeImages({
        baseUrl: config.base_url,
        apiKey: config.api_key,
        model: params.model ?? config.model,
        images,
        prompt: params.prompt,
      });

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `API 请求失败: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ── Tool: vision_get_config ──

server.registerTool(
  "vision_get_config",
  {
    title: "View Vision Configuration",
    description: `Show the current vision service configuration (masking the API key).

Displays: API base URL, model name, and whether an API key is set.

No arguments required.`,
    inputSchema: UpdateConfigSchema.pick({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const config = loadConfig();
    return {
      content: [{
        type: "text",
        text: [
          `API 地址: ${config.base_url}`,
          `模型名称: ${config.model}`,
          `API Key: ${maskApiKey(config.api_key)}`,
          `语言: ${config.language === "en" ? "English" : "中文"}`,
        ].join("\n"),
      }],
    };
  },
);

// ── Tool: vision_update_config ──

server.registerTool(
  "vision_update_config",
  {
    title: "Update Vision Configuration",
    description: `Update the vision service configuration (API key, base URL, model).

At minimum, an API key must be provided. Base URL and model can also be changed.

Args:
  - api_key (string, required): API key for the vision service
  - base_url (string, optional): API base URL (default: https://dashscope.aliyuncs.com/compatible-mode/v1)
  - model (string, optional): Model name (default: qwen3.5-omni-plus)
  - language ("zh" | "en", optional): Response language

Examples:
  - Configure with API key: { "api_key": "sk-xxx" }
  - Full config: { "api_key": "sk-xxx", "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini" }

Returns the updated config with API key masked.`,
    inputSchema: UpdateConfigSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (params) => {
    const updated = saveConfig({
      api_key: params.api_key,
      ...(params.base_url ? { base_url: params.base_url } : {}),
      ...(params.model ? { model: params.model } : {}),
      ...(params.language ? { language: params.language } : {}),
    });

    return {
      content: [{
        type: "text",
        text: [
          "✅ 配置已更新",
          `API 地址: ${updated.base_url}`,
          `模型名称: ${updated.model}`,
          `API Key: ${maskApiKey(updated.api_key)}`,
          `语言: ${updated.language === "en" ? "English" : "中文"}`,
        ].join("\n"),
      }],
    };
  },
);

// ── Start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Vision MCP server running via stdio");
}

main().catch((error) => {
  console.error("Fatal server error:", error);
  process.exit(1);
});
