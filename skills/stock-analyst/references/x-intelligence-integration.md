# X/Twitter Intelligence Integration for Stock Analyst

Use this reference when extending or troubleshooting `stock-analyst` open-social intelligence.

## Durable pattern

- Keep hard market data in Tushare: price, volume, VWAP, funds flow, financials, valuation, risk metrics.
- Use X/Twitter only for open social intelligence: KOL discussion, overseas narrative, rumor velocity, catalyst discovery, crowding/overheat checks, and bear-case discovery.
- Always label X output as `confirmed`, `rumor`, `irrelevant`, or `sample insufficient`; never let X replace quantitative data.

## Working implementation shape

- Main module: `scripts/lib/x_intelligence.py`
- Main entrypoint hook: `scripts/analyze.py --modules xintel`
- Default all-module runs should include `xintel` when credentials are present.
- Credential lookup should be best-effort from `/root/.env` and environment variables:
  - `GROK_API_KEY`
  - `SKYEYE_API_KEY`
  - `XAI_API_KEY`
- API shape: xAI/Skyeye Responses API with server-side tool `x_search`, usually model `grok-4-1-fast-reasoning`.

## Output requirements

The report section should include:

1. Search source/model and generated queries.
2. 3-5 trading-relevant X intelligence bullets.
3. Sentiment: bullish / bearish / divided / sample insufficient.
4. Heat: low / medium / high and whether it is over-crowded.
5. Bear case or risk signals.
6. Candidate URLs, clearly labeled as raw candidates when the summary says the hits are unrelated.

## Query construction

For A-share stocks combine:

- Company name
- `ts_code` such as `001258.SZ`
- Plain numeric code such as `001258`
- Industry
- Chinese event words: `股票`, `涨停`, `异动`, `政策`, `产业链`, `催化剂`

## Pitfalls

- X search can return posts whose username or unrelated text merely contains the stock code. Treat these as irrelevant and say `样本不足`.
- Do not present citation URLs as validated evidence when the model summary says no relevant posts were found. Label them `搜索原始引用/候选链接`.
- Old posts can look like fresh catalysts; force the prompt to distinguish old content from recent catalysts.
- If credentials/network fail, return an explicit error in the section and continue the rest of the stock analysis; do not hallucinate social sentiment.

## Verification commands

```bash
python3 -m py_compile /root/.hermes/skills/finance/stock-analyst/scripts/analyze.py \
  /root/.hermes/skills/finance/stock-analyst/scripts/lib/x_intelligence.py

python3 /root/.hermes/skills/finance/stock-analyst/scripts/analyze.py 001258.SZ --modules xintel --no-save
python3 /root/.hermes/skills/finance/stock-analyst/scripts/analyze.py 001258.SZ --modules all --no-save
```
