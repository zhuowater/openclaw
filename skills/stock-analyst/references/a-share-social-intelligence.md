# A股开放情报模块：X + 百度 + 雪球

## 适用场景
国内股票/行业分析时，Tushare 覆盖硬数据，但不能覆盖开放舆情、投资者分歧、题材叙事和突发传闻。A股分析应增加国内舆情层，并保留 X/Twitter 作为海外叙事补充。

## 推荐分层
1. **Tushare 硬数据**：价格、成交量、VWAP、资金流、财务、估值。不得被搜索摘要替代。
2. **国内舆情**：百度新闻/公告源、雪球、股吧/淘股吧/新浪股吧等，用于发现催化剂、风险、散户热度与分歧。
3. **海外/开放社媒**：X/Twitter/Grok，用于外资叙事、海外产业链、科技/AI/港美股相关热点。

## 已验证实现
- `scripts/lib/x_intelligence.py`：通过 xAI/Skyeye Responses API server-side `x_search` 搜索 X/Twitter。
- `scripts/lib/cn_intelligence.py`：国内舆情模块，优先百度 AI/mcporter 与雪球 API；不可用时降级到百度/搜索引擎发现。
- `scripts/analyze.py --modules xintel`：单独运行 X 情报。
- `scripts/analyze.py --modules cnintel`：单独运行国内舆情。
- `--modules all` 应包含 `sent,cnintel,xintel`。

## 关键纪律
- 百度/雪球/X 都是“情报发现”和“情绪热度”来源，不是公告事实源。
- 搜索摘要里的财务、定增、项目、股东户数、政策内容，必须回到公告/交易所/公司原文或 Tushare 核验。
- X 对很多 A 股样本稀疏；低热度本身是信号，但不能据此推断基本面弱。
- 雪球直连需要 `XUEQIU_COOKIE`；没有 cookie 时可用 `site:xueqiu.com 公司名 代码` 做发现，并显式标注“非API直连”。
- 百度 HTML 可能反爬或返回不可解析页面；合理 fallback 是 DuckDuckGo/权威中文站点发现，而不是判定“无结果”。

## 输出格式建议
国内股票最终情报结论按三层写：

```text
硬数据：Tushare 量价/资金/财务/估值
国内舆情：百度/公告源/雪球/股吧，区分确认与传闻
海外社媒：X/Twitter，标注样本量、热度、是否过热
```

短线选股时，国内舆情优先回答：
- 有没有新公告/政策/项目/定增/问询等催化或风险？
- 雪球/股吧是刚发酵、分歧、还是一致过热？
- 题材叙事是否和日内量价/VWAP承接匹配？
