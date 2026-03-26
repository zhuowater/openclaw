/**
 * model-bench — LLM model benchmarking tool
 * 
 * Measures latency, throughput, and quality across OpenAI-compatible endpoints.
 * No external dependencies — uses Node.js built-in https/http.
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

// ─── Default Config ──────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.skyeye.chat/v1';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_RUNS = 3;

// ─── Default Benchmark Prompts ───────────────────────────

const DEFAULT_PROMPTS = [
  {
    name: 'reasoning',
    category: 'Reasoning',
    messages: [
      { role: 'user', content: 'A farmer has 17 sheep. All but 9 run away. How many sheep does the farmer have left? Explain your reasoning step by step, then give the final answer as a single number.' }
    ],
    expected_contains: '9',
  },
  {
    name: 'coding',
    category: 'Coding',
    messages: [
      { role: 'user', content: 'Write a JavaScript function called `isPalindrome` that checks if a string is a palindrome (ignoring case and non-alphanumeric characters). Return only the function, no explanation.' }
    ],
    expected_contains: 'function',
  },
  {
    name: 'chinese',
    category: 'Chinese',
    messages: [
      { role: 'user', content: '请用一段话解释"耗散结构"的概念，要求通俗易懂，不超过100字。' }
    ],
    expected_contains: '能量',
  },
  {
    name: 'summarization',
    category: 'Summarization',
    messages: [
      { role: 'user', content: 'Summarize the following in exactly 2 sentences: The Internet of Things (IoT) refers to the network of physical devices, vehicles, appliances, and other objects embedded with sensors, software, and connectivity that enables them to collect and exchange data. IoT has applications in smart homes, healthcare, agriculture, manufacturing, and transportation. However, it also raises significant concerns about privacy, security, and data management. As the number of connected devices grows exponentially, the challenge of securing these devices becomes increasingly critical.' }
    ],
    expected_contains: 'IoT',
  },
  {
    name: 'instruction_following',
    category: 'Instruction Following',
    messages: [
      { role: 'user', content: 'List exactly 5 programming languages that start with the letter "P". Format: one per line, numbered 1-5. No additional text.' }
    ],
    expected_contains: 'Python',
  },
];

// ─── HTTP Client ─────────────────────────────────────────

function parseBaseUrl(model) {
  // Model format: "provider/model-name" or just "model-name"
  // Known providers map to different base URLs
  const providers = {
    'skyeye': 'https://api.skyeye.chat/v1',
    'skyeye2': 'https://api.skyeye.chat/v1',
    'skyeye-openai': 'https://api.skyeye.chat/v1',
    'ark': 'https://ark.cn-beijing.volces.com/api/v3',
  };

  const parts = model.split('/');
  if (parts.length >= 2) {
    const provider = parts[0];
    const modelName = parts.slice(1).join('/');
    return {
      baseUrl: providers[provider] || DEFAULT_BASE_URL,
      model: model, // Send full model string
    };
  }
  return { baseUrl: DEFAULT_BASE_URL, model };
}

function chatCompletion(baseUrl, model, messages, apiKey, maxTokens = DEFAULT_MAX_TOKENS, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/chat/completions`);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const body = JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: false,
    });

    const startTime = Date.now();

    const req = client.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const totalMs = Date.now() - startTime;
        try {
          const json = JSON.parse(data);
          if (json.error) {
            resolve({ error: json.error.message || JSON.stringify(json.error), totalMs });
            return;
          }
          const content = json.choices?.[0]?.message?.content || '';
          const usage = json.usage || {};
          resolve({
            content,
            totalMs,
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0,
            tokensPerSecond: usage.completion_tokens ? (usage.completion_tokens / (totalMs / 1000)).toFixed(1) : null,
          });
        } catch (e) {
          resolve({ error: `Parse error: ${e.message}`, totalMs, raw: data.slice(0, 200) });
        }
      });
    });

    req.on('error', (e) => resolve({ error: e.message, totalMs: Date.now() - startTime }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout', totalMs: timeoutMs }); });
    req.write(body);
    req.end();
  });
}

// ─── Quality Scoring ─────────────────────────────────────

function scoreResponse(prompt, response) {
  if (response.error) return 0;
  const content = response.content || '';
  if (!content.trim()) return 0;

  let score = 5; // Base score for getting a response

  // Check expected content
  if (prompt.expected_contains) {
    if (content.toLowerCase().includes(prompt.expected_contains.toLowerCase())) {
      score += 3;
    }
  }

  // Length reasonableness (not too short, not excessively long)
  const len = content.length;
  if (len > 20 && len < 3000) score += 1;

  // Coherence heuristic: has sentences/structure
  if (content.includes('.') || content.includes('。') || content.includes('\n')) score += 1;

  return Math.min(score, 10);
}

// ─── Benchmark Runner ────────────────────────────────────

async function benchmarkModel(model, opts = {}) {
  const { baseUrl, model: modelId } = parseBaseUrl(model);
  const apiKey = opts.apiKey || process.env.SKYEYE_API_KEY || process.env.OPENAI_API_KEY || '';
  const prompts = opts.prompts || DEFAULT_PROMPTS;
  const runs = opts.runs || 1; // Single run per prompt for speed
  const maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;

  if (!apiKey) {
    return { model, error: 'No API key found (set SKYEYE_API_KEY or OPENAI_API_KEY)' };
  }

  const results = [];
  for (const prompt of prompts) {
    const runResults = [];
    for (let r = 0; r < runs; r++) {
      const result = await chatCompletion(baseUrl, modelId, prompt.messages, apiKey, maxTokens);
      const quality = scoreResponse(prompt, result);
      runResults.push({ ...result, quality });
    }

    // Aggregate runs
    const successful = runResults.filter(r => !r.error);
    const avgLatency = successful.length > 0
      ? Math.round(successful.reduce((s, r) => s + r.totalMs, 0) / successful.length)
      : null;
    const avgTps = successful.length > 0
      ? (successful.reduce((s, r) => s + parseFloat(r.tokensPerSecond || 0), 0) / successful.length).toFixed(1)
      : null;
    const avgQuality = successful.length > 0
      ? (successful.reduce((s, r) => s + r.quality, 0) / successful.length).toFixed(1)
      : null;
    const errorRate = ((runResults.length - successful.length) / runResults.length * 100).toFixed(0);

    results.push({
      prompt: prompt.name,
      category: prompt.category,
      runs: runs,
      avgLatencyMs: avgLatency,
      avgTps: avgTps ? parseFloat(avgTps) : null,
      avgQuality: avgQuality ? parseFloat(avgQuality) : null,
      errorRate: `${errorRate}%`,
      errors: runResults.filter(r => r.error).map(r => r.error),
      sampleResponse: successful[0]?.content?.slice(0, 200) || null,
    });
  }

  // Overall aggregates
  const allSuccessful = results.filter(r => r.avgLatencyMs !== null);
  const overallLatency = allSuccessful.length > 0
    ? Math.round(allSuccessful.reduce((s, r) => s + r.avgLatencyMs, 0) / allSuccessful.length)
    : null;
  const overallTps = allSuccessful.length > 0
    ? (allSuccessful.reduce((s, r) => s + (r.avgTps || 0), 0) / allSuccessful.length).toFixed(1)
    : null;
  const overallQuality = allSuccessful.length > 0
    ? (allSuccessful.reduce((s, r) => s + (r.avgQuality || 0), 0) / allSuccessful.length).toFixed(1)
    : null;
  const overallErrors = results.reduce((s, r) => s + parseInt(r.errorRate), 0) / results.length;

  return {
    model,
    baseUrl,
    timestamp: new Date().toISOString(),
    summary: {
      avgLatencyMs: overallLatency,
      avgTps: overallTps ? parseFloat(overallTps) : null,
      avgQuality: overallQuality ? parseFloat(overallQuality) : null,
      errorRate: `${overallErrors.toFixed(0)}%`,
      promptsTested: results.length,
    },
    details: results,
  };
}

// ─── Comparison ──────────────────────────────────────────

async function compareModels(models, opts = {}) {
  const results = [];
  for (const model of models) {
    console.error(`Benchmarking: ${model}...`);
    const result = await benchmarkModel(model, opts);
    results.push(result);
  }
  return results;
}

function formatReport(results) {
  const lines = [];
  lines.push('╔══════════════════════════════════════════════════════════════════════╗');
  lines.push(`║  Model Benchmark Report — ${new Date().toISOString().slice(0, 16)}`.padEnd(71) + '║');
  lines.push('╠══════════════════════════════════════════════════════════════════════╣');
  lines.push('║  Model                      │ Latency │  TPS  │ Quality │ Errors   ║');
  lines.push('╟─────────────────────────────┼─────────┼───────┼─────────┼──────────╢');

  for (const r of results) {
    if (r.error) {
      const name = r.model.split('/').pop().slice(0, 27).padEnd(27);
      lines.push(`║  ${name} │  ERROR  │  N/A  │   N/A   │ ${r.error.slice(0, 8).padEnd(8)} ║`);
    } else {
      const name = r.model.split('/').pop().slice(0, 27).padEnd(27);
      const latency = r.summary.avgLatencyMs ? `${r.summary.avgLatencyMs}ms`.padStart(7) : '   N/A '.padStart(7);
      const tps = r.summary.avgTps ? `${r.summary.avgTps}`.padStart(5) : '  N/A'.padStart(5);
      const quality = r.summary.avgQuality ? `${r.summary.avgQuality}/10`.padStart(7) : '   N/A '.padStart(7);
      const errors = (r.summary.errorRate || '0%').padStart(8);
      lines.push(`║  ${name} │ ${latency} │ ${tps} │ ${quality} │ ${errors} ║`);
    }
  }

  lines.push('╚══════════════════════════════════════════════════════════════════════╝');
  return lines.join('\n');
}

// ─── Ping (Quick Latency Test) ───────────────────────────

async function pingModel(model, opts = {}) {
  const { baseUrl, model: modelId } = parseBaseUrl(model);
  const apiKey = opts.apiKey || process.env.SKYEYE_API_KEY || process.env.OPENAI_API_KEY || '';

  if (!apiKey) return { model, error: 'No API key' };

  const result = await chatCompletion(baseUrl, modelId,
    [{ role: 'user', content: 'Say "pong"' }],
    apiKey, 10, 15000
  );

  return {
    model,
    latencyMs: result.totalMs,
    ok: !result.error,
    error: result.error || null,
    response: result.content?.slice(0, 50) || null,
  };
}

// ─── CLI ─────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const jsonOutput = args.includes('--json');
  const models = args.filter(a => !a.startsWith('--') && a !== command);

  if (!command || command === 'help' || models.length === 0) {
    console.log(`Usage:
  node index.js bench <model>              Benchmark a single model
  node index.js compare <m1> <m2> [m3...]  Compare multiple models
  node index.js ping <model>               Quick latency test
  
Options:
  --json    Output raw JSON
  
Models: Use full provider/model format (e.g., skyeye-openai/glm-5)`);
    process.exit(0);
  }

  try {
    if (command === 'ping') {
      const result = await pingModel(models[0]);
      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.ok) {
          console.log(`✅ ${result.model}: ${result.latencyMs}ms — "${result.response}"`);
        } else {
          console.log(`❌ ${result.model}: ${result.error} (${result.latencyMs}ms)`);
        }
      }
    } else if (command === 'bench') {
      const result = await benchmarkModel(models[0]);
      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatReport([result]));
        console.log('\nDetails:');
        for (const d of result.details) {
          console.log(`  ${d.category}: ${d.avgLatencyMs}ms | ${d.avgTps} tps | quality ${d.avgQuality}/10 ${d.errors.length ? '⚠ ' + d.errors[0] : ''}`);
        }
      }
    } else if (command === 'compare') {
      const results = await compareModels(models);
      if (jsonOutput) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(formatReport(results));
      }
    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

// ─── Exports ─────────────────────────────────────────────

module.exports = {
  benchmarkModel,
  compareModels,
  pingModel,
  formatReport,
  DEFAULT_PROMPTS,
  main,
};

if (require.main === module) {
  main();
}
