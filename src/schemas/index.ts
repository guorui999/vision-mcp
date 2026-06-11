import { z } from "zod";

/** Image source: local file path or URL */
const ImageSourceSchema = z.string()
  .min(1, "Image source cannot be empty")
  .max(4096, "Image source too long")
  .describe("Local file path or public URL of the image");

/** Mode for providing images */
export const AnalyzeInputSchema = z.object({
  images: z.array(ImageSourceSchema)
    .min(1, "At least one image is required")
    .max(5, "Maximum 5 images per request")
    .describe("Array of image file paths or URLs to analyze"),
  prompt: z.string()
    .min(1, "Prompt cannot be empty")
    .max(4096, "Prompt too long")
    .default("用中文详细描述这张图片的所有内容，包括构图、颜色、文字、人物、场景等所有细节。")
    .describe("Text prompt describing what to look for in the image(s)"),
  model: z.string()
    .max(128, "Model name too long")
    .optional()
    .describe("Override the configured vision model (e.g. 'qwen-vl-max')"),
}).strict();

export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;

/** Config update fields */
export const UpdateConfigSchema = z.object({
  api_key: z.string()
    .min(1, "API key is required")
    .describe("API key for the vision service"),
  base_url: z.string()
    .url("Must be a valid URL")
    .optional()
    .describe("API base URL (e.g. https://dashscope.aliyuncs.com/compatible-mode/v1)"),
  model: z.string()
    .min(1, "Model name is required")
    .optional()
    .describe("Vision model name (e.g. qwen3.5-omni-plus)"),
  language: z.enum(["zh", "en"])
    .optional()
    .describe("Response language: 'zh' for Chinese, 'en' for English"),
}).strict();

export type UpdateConfigInput = z.infer<typeof UpdateConfigSchema>;
