---
name: model-bench
description: Benchmark LLM models for latency, throughput, and quality. Use when evaluating new models (e.g., GLM-5, Kimi, Grok), comparing endpoints, or measuring API performance. Triggers on "benchmark model", "compare models", "model eval", "test model speed", "评估模型", "模型对比", "模型测试".
---

# Model Bench

Benchmark and compare LLM models across key metrics.

## Usage

```bash
SKILL=/root/openclaw/skills/model-bench/index.js

# Benchmark a single model
node $SKILL bench "skyeye-openai/glm-5"

# Compare multiple models
node $SKILL compare "skyeye-openai/glm-5" "skyeye-openai/grok-3" "skyeye/claude-sonnet-4-5-20250929"

# Run with custom prompts file
node $SKILL bench "skyeye-openai/glm-5" --prompts /path/to/prompts.json

# JSON output for programmatic use
node $SKILL compare "skyeye-openai/glm-5" "skyeye-openai/grok-3" --json

# Quick latency-only test (single ping)
node $SKILL ping "skyeye-openai/glm-5"
```

## What It Measures

| Metric | Description |
|--------|-------------|
| **Latency** | Time to first token (TTFT) and total response time |
| **Throughput** | Tokens per second (output) |
| **Quality** | Instruction following, reasoning, Chinese proficiency |
| **Cost** | Estimated cost per 1K tokens (if pricing available) |
| **Reliability** | Error rate across runs |

## Benchmark Suite

Default prompts test 5 dimensions:
1. **Reasoning** — Multi-step logic problem
2. **Coding** — Generate a working function
3. **Chinese** — 中文理解与生成质量
4. **Summarization** — Compress long text accurately
5. **Instruction Following** — Precise format compliance

## Output Example

```
╔══════════════════════════════════════════════════════════╗
║  Model Benchmark Report — 2026-03-26 14:00              ║
╠══════════════════════════════════════════════════════════╣
║  Model          │ TTFT   │ TPS   │ Quality │ Errors    ║
║  glm-5          │ 420ms  │ 45.2  │ 7.8/10  │ 0%        ║
║  grok-3         │ 380ms  │ 52.1  │ 8.2/10  │ 0%        ║
║  claude-sonnet  │ 310ms  │ 61.3  │ 9.1/10  │ 0%        ║
╚══════════════════════════════════════════════════════════╝
```

## Environment

Requires `SKYEYE_API_KEY` or `OPENAI_API_KEY` in environment.
Uses OpenAI-compatible `/v1/chat/completions` endpoints.
