#!/usr/bin/env node
/**
 * grok-x-search v2: 通过 xAI Responses API + x_search/web_search 获取 X 实时内容
 * 
 * 核心：grok-4-1-fast-reasoning + Responses API + server-side tools
 * 搜索在 xAI 服务端执行，无需本机翻墙
 */

const https = require('https');
const fs = require('fs');

const API_BASE = process.env.GROK_API_BASE || 'https://api.skyeye.net/v1';
const API_KEY = process.env.GROK_API_KEY || process.env.SKYEYE_API_KEY || '';
const DEFAULT_MODEL = 'grok-4-1-fast-reasoning';

// ---- HTTP ----
function request(url, body, retries = 2) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 180000
    };

    const req = https.request(url, opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        if (res.statusCode >= 500 && retries > 0) {
          console.error(`  ⚠ ${res.statusCode} error, retry in 5s (${retries} left)`);
          return setTimeout(() => request(url, body, retries - 1).then(resolve, reject), 5000);
        }
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(new Error(`HTTP ${res.statusCode}: non-JSON response`)); }
      });
    });
    req.on('error', (err) => {
      if (retries > 0) {
        console.error(`  ⚠ Network error, retry in 5s (${retries} left)`);
        return setTimeout(() => request(url, body, retries - 1).then(resolve, reject), 5000);
      }
      reject(err);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout 180s')); });
    req.write(data);
    req.end();
  });
}

// ---- Responses API ----
async function grokResponses(input, tools, options = {}) {
  const body = {
    model: options.model || DEFAULT_MODEL,
    input,
    tools,
    temperature: options.temperature ?? 0.3,
  };
  if (options.instructions) body.instructions = options.instructions;

  const result = await request(`${API_BASE}/responses`, body);

  if (result.error) {
    throw new Error(`API error: ${JSON.stringify(result.error)}`);
  }

  // 提取输出
  const texts = [];
  for (const item of (result.output || [])) {
    for (const c of (item.content || [])) {
      if (c.type === 'output_text') texts.push(c.text);
    }
  }

  return {
    text: texts.join('\n\n'),
    usage: result.usage || {},
    status: result.status,
    model: result.model
  };
}

// ---- 命令实现 ----

async function searchX(query, options = {}) {
  const lang = options.lang === 'zh' ? '用中文回复。' : '';
  const count = options.count || 10;
  
  const instructions = `你是 X/Twitter 社交媒体分析专家。使用 x_search 搜索真实帖子。
规则：
1. 返回真实帖子内容和链接（x.com/i/status/...）
2. 按互动量或重要性排序
3. 提供每条帖子的作者、内容摘要、上下文
4. 最后给出话题趋势总结
${lang}`;

  return grokResponses(
    `搜索 X 上关于「${query}」的最新讨论，返回最多 ${count} 条最相关的帖子，包含真实链接和内容。`,
    [{ type: 'x_search' }],
    { ...options, instructions }
  );
}

async function searchWeb(query, options = {}) {
  const lang = options.lang === 'zh' ? '用中文回复。' : '';
  
  const instructions = `你是网络搜索分析专家。使用 web_search 搜索最新信息。
规则：
1. 返回真实来源和链接
2. 区分事实和推测
3. 给出结构化分析
${lang}`;

  return grokResponses(
    query,
    [{ type: 'web_search' }],
    { ...options, instructions }
  );
}

async function searchBoth(query, options = {}) {
  const lang = options.lang === 'zh' ? '用中文回复。' : '';
  
  const instructions = `你是全网情报分析专家。同时使用 x_search（搜索 X/Twitter）和 web_search（搜索网页）获取最全面的信息。
规则：
1. X 帖子：返回真实链接和内容
2. 网页：返回来源链接和关键信息
3. 交叉验证两个来源
4. 给出综合分析和趋势判断
${lang}`;

  return grokResponses(
    query,
    [{ type: 'x_search' }, { type: 'web_search' }],
    { ...options, instructions }
  );
}

async function analyzeUser(username, options = {}) {
  const lang = options.lang === 'zh' ? '用中文回复。' : '';
  
  const instructions = `你是社交媒体分析专家。${lang}`;

  return grokResponses(
    `搜索 X 用户 @${username} 的最近帖子，分析：
1. 最近发布的内容（返回真实帖子和链接）
2. 关注的话题和立场
3. 互动情况和影响力
4. 值得关注的观点`,
    [{ type: 'x_search' }],
    { ...options, instructions }
  );
}

async function trending(options = {}) {
  const category = options.category || 'technology';
  const lang = options.lang === 'zh' ? '用中文回复。' : '';
  
  const instructions = `你是社交媒体趋势分析专家。${lang}`;

  return grokResponses(
    `搜索 X 上当前 ${category} 领域的热门话题和趋势，返回：
1. 最热门的话题（带真实帖子链接）
2. 每个话题的核心讨论
3. 趋势方向
4. 值得关注的突发事件`,
    [{ type: 'x_search' }],
    { ...options, instructions }
  );
}

// ---- CLI ----
function parseArgs(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (key === 'json' || key === 'both') { opts[key] = true; }
      else { opts[key] = args[++i]; }
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, opts };
}

async function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  const query = positional.slice(1).join(' ');

  if (!command || command === '--help' || command === '-h') {
    console.log(`
grok-x-search v2 — X/Twitter 实时搜索 (via xAI Responses API)

用法:
  grok-x search <query>           搜索 X 上的话题（x_search）
  grok-x web <query>              搜索网页（web_search）  
  grok-x both <query>             同时搜索 X 和网页
  grok-x user <username>          分析 X 用户
  grok-x trending                 获取热门趋势

选项:
  --lang zh          中文输出
  --count <n>        结果数量（默认 10）
  --category <cat>   趋势类别（默认 technology）
  --model <model>    模型（默认 grok-4-1-fast-reasoning）
  --output <file>    保存到文件
  --json             JSON 格式输出

模型推荐:
  grok-4-1-fast-reasoning   ✅ 默认，快速稳定，支持 server-side tools
  grok-4                    ⚠️ 最强但 Skyeye 上不稳定（常 504）

示例:
  node index.js search "AI security" --lang zh
  node index.js both "网络安全 AI agent" --lang zh
  node index.js user elonmusk --lang zh
  node index.js trending --category cybersecurity --lang zh
`);
    return;
  }

  let result;
  try {
    switch (command) {
      case 'search':
      case 'x':
        if (!query) { console.error('❌ 需要搜索关键词'); process.exit(1); }
        console.error(`🔍 X Search: "${query}"`);
        result = await searchX(query, opts);
        break;

      case 'web':
        if (!query) { console.error('❌ 需要搜索关键词'); process.exit(1); }
        console.error(`🌐 Web Search: "${query}"`);
        result = await searchWeb(query, opts);
        break;

      case 'both':
      case 'all':
        if (!query) { console.error('❌ 需要搜索关键词'); process.exit(1); }
        console.error(`🔍🌐 X + Web Search: "${query}"`);
        result = await searchBoth(query, opts);
        break;

      case 'user':
        if (!query) { console.error('❌ 需要用户名'); process.exit(1); }
        console.error(`👤 User: @${query}`);
        result = await analyzeUser(query, opts);
        break;

      case 'trending':
      case 'trend':
        console.error(`📈 Trending: ${opts.category || 'technology'}`);
        result = await trending(opts);
        break;

      default:
        // 默认当搜索
        console.error(`🔍 X Search: "${[command, query].filter(Boolean).join(' ')}"`);
        result = await searchX([command, query].filter(Boolean).join(' '), opts);
    }

    // 输出
    if (opts.json) {
      const out = JSON.stringify({
        command, query, model: result.model,
        timestamp: new Date().toISOString(),
        sources: result.usage.num_sources_used,
        serverTools: result.usage.num_server_side_tools_used,
        tokens: { input: result.usage.input_tokens, output: result.usage.output_tokens },
        content: result.text
      }, null, 2);
      console.log(out);
      if (opts.output) fs.writeFileSync(opts.output, out);
    } else {
      console.log(result.text);
      console.error(`\n📊 sources=${result.usage.num_sources_used || 0} | tokens: in=${result.usage.input_tokens} out=${result.usage.output_tokens}`);
      if (opts.output) fs.writeFileSync(opts.output, result.text);
    }

  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

main();
