# YouTube 技术分享/叙事情报模块

## API结论

YouTube 有官方 **YouTube Data API v3**，适合做“视频发现、元数据、热度、频道、评论”等；字幕/逐字稿不是 Data API 的公开通用能力，通常需要 `youtube-transcript-api`、`yt-dlp --write-auto-subs`、公开视频字幕或人工提供字幕，且云主机 IP 常被 YouTube 限制。

### 官方接口常用法

1. Google Cloud 创建/选择 Project → Enable **YouTube Data API v3**。
2. 创建 API key，放入 `/root/.env`：`YOUTUBE_API_KEY=***` 或 `GOOGLE_API_KEY=***`。
3. 搜索视频：

```bash
curl 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=stock%20analysis%20technical%20analysis&order=viewCount&maxResults=10&publishedAfter=2025-01-01T00:00:00Z&key='$YOUTUBE_API_KEY
```

4. 拉取统计：

```bash
curl 'https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=VIDEO_ID1,VIDEO_ID2&key='$YOUTUBE_API_KEY
```

### 配额与限制

- 配额以官方控制台/文档为准；当前文档页面显示 `search.list` 会消耗 Search Queries quota bucket（页面示例为约100 calls/day量级），`videos.list` quota cost 为 1 unit/call。策略是：少量 `search.list` 发现视频，再用 `videos.list` 批量补统计。
- `search.list` 关键参数：`q`、`type=video`、`order=relevance|date|viewCount`、`publishedAfter`、`videoCaption`、`maxResults<=50`、`pageToken`。
- `videos.list` 关键 part：`snippet,statistics,contentDetails`。
- 评论用 `commentThreads.list`，但投资分析里默认不把评论当硬事实，只作情绪样本。
- 字幕/transcript：官方 Data API 不直接提供任意公开视频字幕文本；需要 fallback，并明确“云IP/字幕关闭/需登录”失败原因。

## 本skill实现

脚本：`scripts/lib/youtube_intelligence.py`

- 有 `YOUTUBE_API_KEY` / `GOOGLE_API_KEY`：优先 YouTube Data API v3。
- 无 key：用 `yt-dlp --flat-playlist ytsearchN:<query>` 兜底抓搜索结果和 view_count。
- 可选 transcript：`with_transcript=True` 会尝试 `youtube_transcript_api`，但常因云 IP 被 YouTube block，失败时必须标注，不可编造字幕内容。
- `analyze.py --modules ytintel --no-save` 可单独运行。

## 输出纪律

YouTube 只回答三类问题：

1. **方法论趋势**：最新高热视频在讲什么技术框架（AI量化、SMC/ICT、Wyckoff、top-down、risk-first）。
2. **叙事热度**：某公司/行业是否被财经YouTuber集中讨论，是否进入零售过热区。
3. **可迁移核查点**：把视频里的交易概念转成可验证指标，例如 VWAP、资金流、筹码、换手、52周高点、止损/赔率。

不得用 YouTube 视频替代：Tushare价格/财务/资金流、公告原文、交易所问询、券商正式研报、回测统计。

## 研究样本：2026年前后高热股票分析/交易技术视频的内核

本次用 `yt-dlp` 在无 YouTube API key 环境检索了：

- `stock technical analysis 2026 trading strategy`
- `AI stock analysis trading strategy 2026`
- `quantitative trading stock analysis machine learning 2026`
- `SMC ICT trading strategy 2026 stocks`
- `股票分析 技术分析 量化 2026`
- `A股 股票分析 技术面 量化 2026`

代表样本（搜索返回 view_count，可能随时间变化）：

| 视频 | 频道 | 观察到热度 | 可迁移内核 |
|---|---|---:|---|
| 最干货的一期｜专业股票投资人怎么看门道？ | 小Lin说 | 300万+ | 专业投资先拆行业/公司/估值/市场预期，强调“看门道”而不是听故事。 |
| 我花了100小时深挖中国股市过去20年的数据... | 老周横眉 | 90万+ | A股周期/散户结构/牛市财富转移，提示体制识别和零售情绪顶部。 |
| Algorithmic Trading – Machine Learning & Quant Strategies Course with Python | freeCodeCamp | 140万+ | 因子化、回测、训练/验证分离、交易成本，AI只能辅助生成/筛选假设。 |
| Perplexity Finance AI + GPT-5: The Future of Stock Trading? | Financially Free | 40万+ | AI工具链用于资料聚合、财报问答和假设生成；最后仍需硬数据校验。 |
| I Re-Created A Quant Trading Strategy With Claude Code | Lewis Jackson | 20万+ | 用代码快速复现策略；关键不是“让AI写策略”，而是把策略变成可测系统。 |
| 2026 Quant Roadmap | Algebraic Continuation | 17万+ | Quant路线强调Python/Pandas、统计、市场微观结构、项目化验证。 |
| Smart Money Concepts Trading Course | The Trading Geek | 100万+ | SMC/ICT核心是流动性、结构、订单块；落地A股必须用VWAP/大单/筹码验证。 |
| How SMC/ICT Secretly Copied the Wyckoff Trading Method | The Secret Mindset | 20万+ | 把SMC回归Wyckoff吸筹/派发模型，避免术语崇拜。 |

综合内核：

- **AI不是信号源，是研究放大器**：用于搜集、摘要、写代码、生成待检验假设；买卖结论必须来自硬数据、回测、风险预算。
- **技术分析要结构化，不要图形崇拜**：趋势/结构/流动性/成交量/VWAP/筹码/52周高点应互相确认。
- **短线交易的核心不是胜率，是赔率和失效点**：每个结论要有止损位、目标位、仓位和“错了怎么办”。
- **A股需特别加入周期/散户/政策/杠杆**：牛熊震荡体制、融资余额、热搜/主播一致看多、龙虎榜/大单流向比单纯K线更重要。
- **所有视频观点都要落成证伪条件**：例如“突破有效”必须绑定放量、收盘位置、VWAP承接、回踩不破、融资不过热。

## 最佳实践：怎么把YouTube研究用于报告

报告中新增或强化这些检查：

- `YouTube方法论/叙事情报`：列出3-10个热视频，标注来源、热度、主题分类、是否方法论/个股叙事/软广告。
- `视频观点 → 可验证指标`：把“smart money accumulation”翻译为：VWAP上方承接、大单净流入、筹码集中度、缩量回踩、龙虎榜机构席位。
- `AI量化警戒线`：凡使用AI/量化视频观点，必须写明是否有样本外、交易成本、回撤、过拟合检查；没有则只作为想法，不作为信号。详见 `references/quant-validation-checklist.md`。
- `零售过热预警`：如果某标的/题材被多位高热视频同时强推，加入隐形风险解剖台：视频热度/主播一致看多=潜在反向指标。

## 2026补充调研：YouTube股票分析技术内核 → stock-analyst落地

### 1. 代表样本与主题簇

本轮进一步按三组独立方向检索 YouTube：

- 技术/交易：Price Action、SMC/ICT、Wyckoff、Volume Profile、VWAP、Multi-timeframe、Risk/Reward。
- 量化/AI：algorithmic trading、ML for stocks、backtesting pitfalls、walk-forward、overfitting、factor research、Claude Code trading strategy。
- 中文/A股/价值：专业股票投资人怎么看门道、A股价值投资、财报分析、中国股市周期、潜力股、产业链、价值陷阱、段永平/邱国鹭。

代表高热样本包括：

| 主题 | 代表视频/频道 | 观察热度 | 可迁移内核 |
|---|---|---:|---|
| Price Action | TradingLab / Tradeciety / The Trading Geek | 60万-220万+ | 先结构后指标：HH/HL、LH/LL、收盘突破、假突破、结构失效价。 |
| SMC/ICT | The Trading Geek / Mind Math Money / Casper SMC | 49万-110万+ | 流动性池、扫止损、BOS/CHOCH、Order Block/FVG；必须用量价验证。 |
| Wyckoff | Fractal Flow / Wyckoff Trading Method | 30万-100万+ | 吸筹/拉升/派发/下跌；Effort vs Result：放量不涨、缩量回踩、Spring/UTAD。 |
| Volume Profile | Tom Crown / Trading Notes | 20万-65万+ | POC/VAH/VAL/HVN/LVN；A股用筹码分布近似价格接受区。 |
| VWAP/AVWAP | Tom Crown / Wysetrade / Humbled Trader | 39万-41万+ | VWAP=机构执行成本；AVWAP=事件资金成本；跌破关键AVWAP意味着叙事资金转亏。 |
| Risk/Reward | TradingLab / Humbled Trader | 18万-190万+ | 每笔交易先定义入场、止损、目标、R倍数、仓位；没有赔率就不交易。 |
| AI量化 | freeCodeCamp / neurotrader / Ernest Chan / Claude Code trading channels | 2万-300万+ | AI是研究工程放大器；核心是回测、样本外、walk-forward、成本、过拟合。 |
| 中文价值/A股 | 小Lin说 / 老周横眉 / Spark Liang / 段永平相关频道 | 3万-300万+ | 行业-公司-财务-市场预期四层拆解；好赛道+好公司+好价格+催化；视频热度可反向。 |

> 字幕口径：本机云IP多次触发 YouTube “Sign in to confirm you’re not a bot”，所以本研究不伪造逐字稿；只基于可获得的搜索元数据、标题、频道、热度与可验证的公开方法论归纳。

### 2. 七类视频方法 → 硬检查映射

| YouTube方法 | 不可直接相信的说法 | 转成stock-analyst硬检查 |
|---|---|---|
| Price Action | “突破了，趋势来了” | 是否收盘突破；是否放量；是否回踩不破；是否出现HH/HL；结构失效价在哪。 |
| SMC/ICT | “聪明钱进场/订单块有效” | 是否扫前高/前低后收回；是否BOS/CHOCH；VWAP/AVWAP是否承接；大单/筹码/龙虎榜是否验证。 |
| Wyckoff | “主力吸筹/派发” | Effort vs Result：放量不涨、缩量回踩、Spring/UTAD；winner_rate与换手是否过热。 |
| Volume Profile | “这里支撑强” | A股用 `cyq_chips/cyq_perf` 近似 POC/价值区；当前价相对成本密集区、上方套牢、下方承接。 |
| VWAP/AVWAP | “机构成本线守住” | 当日VWAP偏离、5/20日成交均价、财报/跳空/涨停/阶段低点AVWAP，跌破则叙事降级。 |
| Multi-timeframe | “5分钟图转强” | 月/周/日/60分钟分层：高周期定方向，低周期只做触发；逆高周期只能按反弹。 |
| Risk/Reward | “胜率很高” | 入场触发、结构止损、目标位、R/R、单笔风险、A股T+1/跌停无法卖出风险。 |
| AI量化 | “AI发现策略” | 策略假设卡、as-of/shift(1)、样本外、walk-forward、成本、随机基线、过拟合审计。 |
| 中文价值/A股 | “潜力股/黄金坑” | 好赛道+好公司+好价格+催化；三表联读；产业链利润池；视频/短视频一致看多=禁追变量。 |

### 3. 对现有skill的差距结论

原 skill 已有 Tushare硬数据、技术指标、VWAP、筹码、融资、X/雪球/百度/YouTube情报、Kelly 与证伪框架；差距主要在：

1. **YouTube模块过去偏“列视频/API”，不够“方法论映射”**：已改为输出分类、零售热度、方法内核、硬检查项。
2. **技术分析过去偏指标，不够结构化**：应强制加入 Price Action 的结构状态、假突破、结构失效价。
3. **SMC/Wyckoff过去易玄学化**：必须改成“候选标签 + 量价/资金/筹码验证”，禁止直接说聪明钱。
4. **VWAP过去偏日内，缺AVWAP**：报告层必须考虑财报/跳空/涨停/阶段低点事件成本线。
5. **量化/AI过去缺验证纪律**：新增 `quant-validation-checklist.md`，AI生成策略无样本外/成本/过拟合审计时只能当想法。
6. **中文价值/A股视频方法未充分吸收**：新增“专业看门道、核心3+1、三表联读、产业链利润池、周期/情绪禁追”检查。
7. **用户偏好的交易区间需更硬**：YouTube洞见必须最后落成直接买区/低吸区/禁追区/止损位/R倍数，而非泛泛看多看空。

### 4. 报告强制输出小节

以后完整报告的市场情绪/技术分析附近必须包含：

```text
YouTube方法论与散户热度：
- 代表视频：标题/频道/链接/热度/主题分类
- 可借鉴：本次能迁移的技术或财报框架
- 需警惕：是否标题党、软广、个股强推、热视频一致看多
- 硬检查：每个视频观点对应 Tushare/公告/回测/证伪指标
- 交易区间影响：直接买区/低吸区/禁追区/止损位是否需要调整
```
