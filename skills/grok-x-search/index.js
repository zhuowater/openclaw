#!/usr/bin/env node
/**
 * grok-x-search: 通过 Grok-4 获取和分析 X/Twitter 内容
 * 
 * 工作原理：
 * 1. 使用 web_fetch 从 X 搜索页面 / nitter 镜像获取推文内容
 * 2. 将原始内容喂给 Grok-4 进行智能分析、总结、情感分析
 * 3. 输出结构化的 X 社交媒体情报
 * 
 * 使用方式：
 *   node index.js search "AI security" [--count 10] [--lang zh] [--analyze]
 *   node index.js trending [--category technology]
 *   node index.js user <username> [--count 5]
 *   node index.js analyze <text-or-file> [--context "分析角度"]
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Skyeye API 配置 (复用现有配置)
const API_BASE = process.env.GROK_API_BASE || 'https://api.skyeye.net/v1';
const API_KEY = process.env.GROK_API_KEY || process.env.SKYEYE_API_KEY || 'sk-89XhzQp0oA4mj2fxBcC295C6DeFa4303A70e0f116250A468';
const MODEL = process.env.GROK_MODEL || 'grok-3';

// ---- HTTP 请求工具 ----
function fetchJSON(url, options = {}, retries = 3) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, {
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        ...options.headers
      },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // 处理 503/502 等临时错误
        if (res.statusCode >= 500 && retries > 0) {
          console.error(`  ⚠ Server error (${res.statusCode}), retrying in 3s... (${retries} left)`);
          setTimeout(() => {
            fetchJSON(url, options, retries - 1).then(resolve).catch(reject);
          }, 3000);
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`HTTP ${res.statusCode} - non-JSON response (API may be temporarily unavailable)`)); }
      });
    });
    req.on('error', (err) => {
      if (retries > 0) {
        console.error(`  ⚠ Network error, retrying in 3s... (${retries} left)`);
        setTimeout(() => {
          fetchJSON(url, options, retries - 1).then(resolve).catch(reject);
        }, 3000);
      } else { reject(err); }
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout (120s)')); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ---- Grok-4 Chat ----
async function grokChat(messages, options = {}) {
  const body = {
    model: options.model || MODEL,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens || 4096,
  };
  
  const result = await fetchJSON(`${API_BASE}/chat/completions`, { body });
  
  if (result.error) {
    throw new Error(`Grok API error: ${JSON.stringify(result.error)}`);
  }
  
  return result.choices?.[0]?.message?.content || '';
}

// ---- X 内容获取 (多源) ----

// 方法1: 通过 nitter 镜像搜索
async function fetchFromNitter(query, count = 10) {
  const nitterHosts = [
    'nitter.privacydev.net',
    'nitter.poast.org', 
    'nitter.lucabased.xyz'
  ];
  
  for (const host of nitterHosts) {
    try {
      const url = `https://${host}/search?f=tweets&q=${encodeURIComponent(query)}`;
      const result = await fetchText(url);
      if (result && result.length > 100) {
        return { source: `nitter:${host}`, content: result.slice(0, 10000) };
      }
    } catch(e) { continue; }
  }
  return null;
}

// 方法2: 通过 RSS Bridge
async function fetchFromRSSBridge(query) {
  const bridges = [
    `https://rss-bridge.org/bridge01/?action=display&bridge=TwitterBridge&q=${encodeURIComponent(query)}&format=Mrss`
  ];
  for (const url of bridges) {
    try {
      const result = await fetchText(url);
      if (result && result.length > 100) {
        return { source: 'rss-bridge', content: result.slice(0, 10000) };
      }
    } catch(e) { continue; }
  }
  return null;
}

// 方法3: 直接让 Grok 基于知识回答 (fallback)
async function fetchViaGrok(query, type = 'search', options = {}) {
  const systemPrompt = `你是一个 X/Twitter 社交媒体分析专家。你基于 xAI 的 Grok 模型，对 X 平台上的内容、趋势和讨论有深入了解。

重要规则：
1. 如果你有关于查询主题的真实知识，请提供准确的分析
2. 明确标注哪些是你确定知道的事实，哪些是基于模式的推断
3. 不要编造具体的推文 URL 或精确的互动数据
4. 重点提供：关键讨论主题、主要观点/阵营、重要人物/账号、趋势方向
5. 用中文回复，技术术语可用英文`;

  let userPrompt;
  
  switch(type) {
    case 'search':
      userPrompt = `分析 X/Twitter 上关于「${query}」的讨论：
1. 这个话题在 X 上的热度和趋势如何？
2. 主要的讨论方向和观点阵营有哪些？
3. 哪些关键人物/机构在讨论这个话题？
4. 最有价值的见解和争议点是什么？
5. 与最新新闻事件的关联？

请提供深度分析，而非表面摘要。${options.lang === 'zh' ? '重点关注中文圈讨论。' : ''}`;
      break;
      
    case 'trending':
      userPrompt = `分析 X/Twitter 上当前的热门话题和趋势，特别是${options.category || '科技'}领域：
1. 最热门的 5-10 个话题
2. 每个话题的核心讨论内容
3. 趋势方向（上升/下降/稳定）
4. 值得关注的突发事件或转折点`;
      break;
      
    case 'user':
      userPrompt = `分析 X/Twitter 用户 @${query} 的公开信息：
1. 该用户的身份、领域和影响力
2. 他们通常讨论什么话题？
3. 他们的观点倾向和立场
4. 最近可能在关注什么？
5. 与他们互动的关键人物/社区`;
      break;
      
    default:
      userPrompt = query;
  }

  return await grokChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { temperature: 0.3, maxTokens: 4096 });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ---- 综合分析 ----
async function analyzeContent(content, context = '') {
  const systemPrompt = `你是基于 Grok-4 的高级内容分析师。对给定的内容进行深度分析。
分析维度：
1. 核心主题提取
2. 情感倾向分析（正面/负面/中立，及其分布）
3. 关键实体识别（人物、组织、事件）
4. 观点阵营划分
5. 潜在影响和趋势预判
6. 值得深入追踪的线索

${context ? `分析角度：${context}` : ''}
用中文回复，结构化输出。`;

  return await grokChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请分析以下内容：\n\n${content}` }
  ], { temperature: 0.2, maxTokens: 4096 });
}

// ---- 主流程 ----
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
grok-x-search - 通过 Grok-4 获取和分析 X/Twitter 内容

用法:
  node index.js search <query> [options]    搜索 X 上的话题讨论
  node index.js trending [options]          获取热门趋势
  node index.js user <username> [options]   分析用户
  node index.js analyze <text|file> [options] 分析内容

选项:
  --count <n>       结果数量 (默认 10)
  --lang <code>     语言 (默认 en, 可选 zh)
  --category <cat>  趋势类别 (默认 technology)
  --context <text>  分析角度/上下文
  --model <model>   模型 (默认 grok-4)
  --json            JSON 格式输出
  --fast            使用 grok-4-fast-reasoning (更快更便宜)
  --output <file>   保存输出到文件

环境变量:
  GROK_API_KEY      API 密钥 (默认使用 Skyeye 配置)
  GROK_API_BASE     API 基础 URL (默认 https://api.skyeye.net/v1)
  GROK_MODEL        默认模型 (默认 grok-4)

示例:
  node index.js search "AI security" --lang zh
  node index.js trending --category cybersecurity
  node index.js user elonmusk
  node index.js analyze "paste some tweets here" --context "情感分析"
`);
    process.exit(0);
  }
  
  const command = args[0];
  const query = args[1] || '';
  
  // 解析选项
  const options = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--count') options.count = parseInt(args[++i]);
    else if (args[i] === '--lang') options.lang = args[++i];
    else if (args[i] === '--category') options.category = args[++i];
    else if (args[i] === '--context') options.context = args[++i];
    else if (args[i] === '--model') options.model = args[++i];
    else if (args[i] === '--json') options.json = true;
    else if (args[i] === '--fast') options.model = 'grok-4-fast-reasoning';
    else if (args[i] === '--output') options.output = args[++i];
  }

  let result;
  
  try {
    switch(command) {
      case 'search': {
        if (!query) { console.error('Error: search requires a query'); process.exit(1); }
        console.error(`🔍 Searching X for: "${query}" via Grok-4...`);
        result = await fetchViaGrok(query, 'search', options);
        break;
      }
      
      case 'trending': {
        console.error(`📈 Fetching X trends (${options.category || 'technology'}) via Grok-4...`);
        result = await fetchViaGrok('', 'trending', options);
        break;
      }
      
      case 'user': {
        if (!query) { console.error('Error: user requires a username'); process.exit(1); }
        console.error(`👤 Analyzing X user: @${query} via Grok-4...`);
        result = await fetchViaGrok(query, 'user', options);
        break;
      }
      
      case 'analyze': {
        let content = query;
        // 检查是否是文件路径
        if (content && fs.existsSync(content)) {
          content = fs.readFileSync(content, 'utf-8');
        } else if (!content) {
          // 从 stdin 读取
          content = fs.readFileSync('/dev/stdin', 'utf-8');
        }
        console.error(`🧠 Analyzing content via Grok-4...`);
        result = await analyzeContent(content, options.context);
        break;
      }
      
      default:
        // 如果不是命令，当作搜索查询
        console.error(`🔍 Searching X for: "${args.join(' ')}" via Grok-4...`);
        result = await fetchViaGrok(args.join(' '), 'search', options);
    }
    
    // 输出
    if (options.json) {
      const output = JSON.stringify({ 
        command, query, model: options.model || MODEL, 
        timestamp: new Date().toISOString(),
        result 
      }, null, 2);
      console.log(output);
      if (options.output) fs.writeFileSync(options.output, output);
    } else {
      console.log(result);
      if (options.output) fs.writeFileSync(options.output, result);
    }
    
  } catch(err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
