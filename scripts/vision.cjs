#!/usr/bin/env node
/**
 * Vision - 让没有识图能力的模型获得识图能力
 *
 * 用法:
 *   node vision.js <图片路径> [问题]
 *   node vision.js --url <图片链接> [问题]
 *   node vision.js --setup
 *   node vision.js --config
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const readline = require("readline");
const crypto = require("crypto");

const SKILL_DIR = path.resolve(__dirname, "..");
const CONFIG_FILE = path.join(SKILL_DIR, "config.json");
const CACHE_FILE = path.join(SKILL_DIR, "cache.json");
const CACHE_MAX = 50;
const DEF_CFG = { base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", api_key: "", model: "qwen3.5-omni-plus", language: "zh" };

// ── In-memory cache (lazy write) ──

let _cacheData = null;
let _cacheDirty = false;

function loadCache() {
  if (_cacheData) return _cacheData;
  try {
    if (fs.existsSync(CACHE_FILE)) _cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    else _cacheData = {};
  } catch (e) { _cacheData = {}; }
  return _cacheData;
}
function flushCache() {
  if (!_cacheDirty || !_cacheData) return;
  try {
    const e = Object.entries(_cacheData).sort((a, b) => (a[1].t || 0) - (b[1].t || 0));
    if (e.length > CACHE_MAX) _cacheData = Object.fromEntries(e.slice(-CACHE_MAX));
    fs.writeFileSync(CACHE_FILE, JSON.stringify(_cacheData, null, 2), "utf-8");
    _cacheDirty = false;
  } catch (e) { /* best-effort write */ }
}
process.on("exit", flushCache);
const EXTS = { jpg: "jpeg", jpeg: "jpeg", png: "png", gif: "gif", webp: "webp", bmp: "bmp" };
const MAX_SIZE = 20 * 1024 * 1024;

// ── Config ──

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")); } catch (e) { console.error("⚠️ 配置文件格式错误:", e.message); }
  if (fs.existsSync(path.join(SKILL_DIR, ".env"))) {
    try { require("dotenv").config({ path: path.join(SKILL_DIR, ".env") }); } catch { /* dotenv not installed, skip .env loading */ }
  }
  if (process.env.DASHSCOPE_API_KEY) return { base_url: process.env.DASHSCOPE_BASE_URL || DEF_CFG.base_url, api_key: process.env.DASHSCOPE_API_KEY, model: process.env.VISION_MODEL || DEF_CFG.model };
  return DEF_CFG;
}
function saveConfig(c) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2), "utf-8"); }

// ── Cache helpers (backed by in-memory cache above) ──

function cacheKey(imgs, prompt) {
  const parts = imgs.map(i => {
    if (i.isUrl) return `url:${i.source}`;
    try { const s = fs.statSync(i.source); return `${i.source}::${s.mtimeMs}::${s.size}`; } catch { return i.source; }
  });
  return crypto.createHash("md5").update(parts.join("|") + "||" + prompt).digest("hex");
}
function cacheGet(k) { const c = loadCache(); return c[k]?.result ?? null; }
function cacheSet(k, r) { const c = loadCache(); c[k] = { result: r, t: Date.now() }; _cacheDirty = true; }

// ── Setup UI ──

async function setup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const q = (q) => new Promise(r => rl.question(q, r));
  console.log("\n╔══════════════════════════════════════╗\n║     🖼️  Vision 图片识别配置          ║\n╚══════════════════════════════════════╝\n");
  const cur = loadConfig();
  console.log("推荐阿里云千问（新用户 100 万 token 免费）\n📎 https://bailian.console.aliyun.com/\n");
  const apiKey = await q(`API Key (当前: ${cur.api_key ? "****" + cur.api_key.slice(-4) : "未设置"}): `);
  const baseUrl = await q(`API 地址 (回车保持 ${cur.base_url}): `) || cur.base_url;
  const model = await q(`模型 (回车保持 ${cur.model}): `) || cur.model;
  const lang = (await q(`语言 Language (zh/en, 回车保持 ${cur.language || "zh"}): `) || cur.language || "zh").toLowerCase();
  saveConfig({ base_url: baseUrl.trim(), api_key: apiKey.trim() || cur.api_key, model: model.trim(), language: lang });
  console.log("\n✅ 配置完成！\n配置已保存到: " + CONFIG_FILE + "\n");
  rl.close();
}

function showConfig() {
  const c = loadConfig();
  console.log(`\n📋 当前配置\n  API 地址: ${c.base_url}\n  模型名称: ${c.model}\n  API Key: ${c.api_key ? "****" + c.api_key.slice(-4) : "❌ 未设置"}\n  语言: ${c.language === "en" ? "English" : "中文"}\n  配置文件: ${CONFIG_FILE}\n`);
  if (!c.api_key) console.log("  💡 运行 node vision.js --setup 配置 API Key\n");
}

function showHelp() {
  console.log(`\n🖼️  Vision 使用帮助\n\n用法:\n  node vision.js <图片路径> [问题]\n  node vision.js <图1> <图2> [问题]\n  node vision.js --url <链接> [问题]\n\n命令:\n  --setup  首次配置\n  --config 查看配置\n  --cache  启用缓存（避免重复调用）\n  --help   帮助\n\n示例:\n  node vision.js photo.jpg "描述图片"\n  node vision.js --cache a.jpg b.jpg "比较这两张图"\n\n配置文件: ${CONFIG_FILE}\n`);
}

// ── Parse Args ──

function parseArgs() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--setup") return { action: "setup" };
  if (argv[0] === "--config") return { action: "config" };
  if (argv[0] === "--help" || argv[0] === "-h") return { action: "help" };

  let useCache = false;
  const images = [];
  const promptParts = [];
  let inPrompt = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cache") { useCache = true; continue; }
    if (!inPrompt && a === "--url" && argv[i + 1]) { images.push({ source: argv[++i], isUrl: true }); continue; }

    if (inPrompt) { promptParts.push(a); continue; }

    const resolved = path.resolve(a);
    if (fs.existsSync(resolved)) {
      const ext = path.extname(a).toLowerCase().replace(".", "");
      if (EXTS[ext]) { images.push({ source: a, isUrl: false }); continue; }
      inPrompt = true; promptParts.push(a); continue;
    }

    if (a.startsWith("http") && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a)) {
      images.push({ source: a, isUrl: true }); continue;
    }

    inPrompt = true;
    promptParts.push(a);
  }

  const cfg = loadConfig();
  const defaultPrompt = cfg.language === "en"
    ? "Describe this image in detail in English, including composition, colors, text, people, objects, scene, and any other notable elements."
    : "用中文详细描述这张图片的所有内容，包括构图、颜色、文字、人物、场景等所有细节。";
  return { action: "run", images, prompt: promptParts.join(" ") || defaultPrompt, useCache };
}

// ── Image Processing ──

function validateImage(source, isUrl) {
  if (isUrl) return;
  const r = path.resolve(source);
  if (!fs.existsSync(r)) throw new Error(`文件不存在: ${r}`);
  const s = fs.statSync(r);
  if (s.size === 0) throw new Error(`空文件: ${r}`);
  if (s.size > MAX_SIZE) throw new Error(`文件过大 (${(s.size / 1024 / 1024).toFixed(1)}MB)，最大 20MB: ${r}`);
  const ext = path.extname(r).toLowerCase().replace(".", "");
  if (!EXTS[ext]) throw new Error(`不支持的格式: .${ext}（支持: ${Object.keys(EXTS).join(", ")}）`);
}

function resolveImage(source, isUrl) {
  if (isUrl) return source;
  const r = path.resolve(source);
  const ext = path.extname(r).toLowerCase().replace(".", "");
  return `data:image/${EXTS[ext] || "jpeg"};base64,${fs.readFileSync(r).toString("base64")}`;
}

// ── API Request with Retry ──

async function request(baseUrl, apiKey, payload, retries = 2) {
  const url = new URL(baseUrl.replace(/\/?$/, "/") + "chat/completions");
  const body = JSON.stringify(payload);
  const transport = url.protocol === "https:" ? https : http;

  for (let i = 0; i <= retries; i++) {
    try {
      return await new Promise((resolve, reject) => {
        const req = transport.request(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
        }, (res) => {
          let data = "";
          res.on("data", c => data += c);
          res.on("end", () => {
            if (res.statusCode === 429 || (res.statusCode >= 500 && res.statusCode < 600))
              return reject(new Error(`HTTP ${res.statusCode}`));
            if (res.statusCode >= 400) return reject(new Error(`API ${res.statusCode}: ${data.slice(0, 300)}`));
            try { resolve(JSON.parse(data)?.choices?.[0]?.message?.content || data); } catch { resolve(data); }
          });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
      });
    } catch (err) {
      if (i < retries && (err.message.startsWith("HTTP 429") || err.message.startsWith("HTTP 5"))) {
        const d = (i + 1) * 1000;
        process.stderr.write(`\n⏳ API 限流/错误，${d / 1000}s 后重试 (${i + 1}/${retries})...\n`);
        await new Promise(r => setTimeout(r, d));
        continue;
      }
      throw err;
    }
  }
}

// ── Main ──

async function main() {
  const args = parseArgs();

  switch (args.action) {
    case "setup": return await setup();
    case "config": return showConfig();
    case "help": return showHelp();
    case "run": break;
  }

  const config = loadConfig();
  if (!fs.existsSync(CONFIG_FILE)) saveConfig(DEF_CFG);

  if (!config.api_key) {
    console.error("\n❌ 未配置 API Key\n\n请运行: node vision.js --setup\n");
    process.exit(1);
  }

  if (!args.images.length) { showHelp(); process.exit(1); }

  for (const img of args.images) {
    try { validateImage(img.source, img.isUrl); }
    catch (e) { console.error(`❌ ${e.message}`); process.exit(1); }
  }

  if (args.useCache) {
    const key = cacheKey(args.images, args.prompt);
    const cached = cacheGet(key);
    if (cached) { console.log("\n📦 命中缓存\n"); console.log(cached); return; }
  }

  process.stderr.write(`⏳ 正在识别 ${args.images.length} 张图片...`);
  const start = Date.now();

  try {
    const content = args.images.map(img => ({ type: "image_url", image_url: { url: resolveImage(img.source, img.isUrl) } }));
    content.push({ type: "text", text: args.prompt });

    const result = await request(config.base_url, config.api_key, {
      model: config.model, messages: [{ role: "user", content }], stream: false, max_tokens: 4096
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    process.stderr.write(` ✅ (${elapsed}s)\n\n`);
    console.log(result);
    process.stderr.write(`--- [模型: ${config.model}, 耗时: ${elapsed}s] ---\n`);

    if (args.useCache) cacheSet(cacheKey(args.images, args.prompt), result);
  } catch (err) {
    process.stderr.write("\n");
    console.error("❌ 识图失败:", err.message);
    process.exit(1);
  }
}

main();
