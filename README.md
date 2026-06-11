# 🖼️ Vision MCP

让没有原生识图能力的模型（如 DeepSeek）也能"看图"——通过调用外部视觉 API 获取图片的文字描述。

提供 **MCP Server** 和 **CLI** 两种使用方式。

---

## MCP Server（推荐）

### 工具

| 工具 | 说明 | 注解 |
|------|------|------|
| `vision_analyze` | 分析图片 — 本地路径或 URL，1-5 张，自定义 prompt | 只读 |
| `vision_get_config` | 查看当前 API 配置（Key 脱敏） | 只读 |
| `vision_update_config` | 更新 API Key / 模型 / 地址 | — |

### 快速开始

```bash
# 安装依赖（本地开发）
npm install
npm run build

# 或直接通过 npx 运行（无需安装）
npx -y @guorui99/vision-mcp
```

**配置 MCP（在 Claude Desktop / claude.json 中添加）:**

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["-y", "@guorui99/vision-mcp"]
    }
  }
}
```

### 首次配置

启动后，通过 MCP 工具配置 API Key：

```
vision_update_config api_key="你的API Key"
```

或用环境变量（不写磁盘）：

```
VISION_API_KEY=你的Key npx -y @guorui99/vision-mcp
```

支持的环境变量：
| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VISION_API_KEY` | API Key | — |
| `VISION_BASE_URL` | API 地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `VISION_MODEL` | 模型名 | `qwen3.5-omni-plus` |
| `VISION_LANGUAGE` | 语言 | `zh` |

### 支持的视觉服务

| 服务 | 模型 | 备注 |
|------|------|------|
| **阿里云百炼（推荐）** | `qwen3.5-omni-plus` | 新用户 100 万 token 免费 |
| 阿里云百炼 | `qwen-vl-max` | 同上 |
| OpenAI | `gpt-4o-mini` | 需海外支付 |
| 其他 | 任何 OpenAI 兼容格式 | 改 `base_url` + model 名 |

### 支持格式

jpg, jpeg, png, gif, webp, bmp（单次最多 5 张，单文件最大 20MB）

### 工作原理

1. 读取图片 → base64 编码
2. 调用 OpenAI 兼容视觉 API
3. 返回文字描述

---

## CLI 模式（legacy）

```bash
# 单张图片
node scripts/vision.cjs photo.jpg "描述这张图片"

# 网络图片
node scripts/vision.cjs --url https://example.com/img.png "这是什么？"

# 多张图片
node scripts/vision.cjs img1.jpg img2.jpg "比较这两张图"

# 配置
node scripts/vision.cjs --setup
node scripts/vision.cjs --config
```

---

## 项目结构

```
vision-mcp/
├── src/                 # MCP Server 源码 (TypeScript)
├── dist/                # 编译产物
├── scripts/vision.cjs   # CLI 工具 (legacy)
├── config.json          # 共享配置文件
├── package.json
└── tsconfig.json
```

## 环境要求

- Node.js >= 18
- 视觉 API 的 Key（阿里云百炼 / OpenAI 等）
