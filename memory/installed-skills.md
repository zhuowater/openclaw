# 已安装技能清单

## 安装时间
2026-02-01 ~ 2026-02-02

---

## 🔒 安全类（3个）

### 1. security-monitor
**用途**: 实时安全监控
- 检测入侵、异常 API 调用、凭据使用模式
- 警报漏洞
- 检测暴力破解、端口扫描、进程异常、文件更改

**使用场景**:
- 持续监控 Clawdbot 部署
- 检测异常活动

---

### 2. secret-scanner
**用途**: 扫描代码库中的泄露密钥
- 检测硬编码的密钥和和 API 密钥
- 检查 .env 文件
- 警告 git 历史中的密钥

**使用场景**:
- 推送到公开仓库前
- 安全审计
- CI/CD 管道

---

### 3. skill-scanner
**用途**: 扫描 Clawdbot/MCP 技能中的恶意代码
- 检测恶意软件、间谍软件、加密挖矿
- 识别数据外泄模式
- 捕获后门和混淆技术

**使用场景**:
- 安装技能前进行安全审计
- 验证技能安全性

---

## 📰 情报收集类（3个）

### 4. news-summary
**用途**: 从可信国际 RSS 源获取和总结新闻
- BBC World、Business、Technology
- Reuters
- NPR
- Al Jazeera

**使用场景**:
- 每日简报
- 世界新闻更新
- 语音摘要

---

### 5. hn (Hacker News)
**用途**: 浏览 Hacker News
- Top stories、New、Best、Ask、Show、Jobs
- 故事详情和评论
- 搜索功能

**使用场景**:
- 技术新闻
- 开发者社区动态
- 创业和招聘信息

---

### 6. topic-monitor
**用途**: 监控感兴趣的主题并主动提醒
- 配置监控主题
- 定时搜索
- AI 重要性评分
- 智能警报 vs 周报
- 记忆集成

**使用场景**:
- 产品发布监控
- 价格变化监控
- 新闻主题监控
- 技术更新监控

---

## 🧠 创意与思考类（4个）

### 7. creative-thought-partner
**用途**: 创意思考伙伴
- 发现隐藏的创意
- 捕捉悖论和模式
- 帮助命名未命名的概念
- 通过批判性观察揭示洞察

**使用场景**:
- 探索新想法
- 发现突破性洞察
- 开发原创框架
- 写作、内容创作、产品开发

---

### 8. research
**用途**: 深度研究（使用 Gemini CLI）
- 通过子代理运行，不消耗 Claude
- 涵盖概述、现状、技术深度、应用、挑战、未来展望
- 完整的研究报告保存到 ~/clawd/research/

**使用场景**:
- 深度学习任何主题
- 决策支持
- 写作研究
- 技术调研

---

### 9. reflect-learn
**用途**: 自我改进与学习
- 从对话中提取学习内容
- 将修正永久编码到代理定义中
- "纠正一次，永不再犯"

**使用场景**:
- 完成复杂任务后
- 用户明确纠正行为时
- 会话边界前
- 提取成功模式

---

### 10. mindfulness-meditation
**用途**: 正念冥想
- 引导式冥想会话
- 练习连续性追踪
- 每日正念提醒
- 会话日志

**冥想类型**:
- 身体扫描
- 呼吸专注
- 慈悲心
- 行走冥想
- 开放觉知

**使用场景**:
- 建立冥想习惯
- 压力时刻快速正念
- 任务间过渡
- 深度练习

---

## 🎌 娱乐与游戏类（1个）

### 11. chess (chess)
**用途**: 国际象棋对战
- 与其他 Moltys 对战
- ELO 评级系统
- 5 分钟快棋

**使用场景**:
- 娱乐
- 策略思维训练
- 与其他智能体互动

---

## 📺 媒体处理类（8个）

### 12. youtube-transcript
**用途**: YouTube 视频字幕获取
- 获取视频字幕
- 可选摘要
- 支持多语言

**使用场景**:
- 视频内容总结
- 学习视频内容
- 提取引用

---

### 13. antigravity-image-gen
**用途**: Google Antigravity 图像生成（Gemini 3 Pro Image）
- 高质量图像生成
- 原生生成，无需浏览器自动化
- 支持多种宽高比

**使用场景**:
- 创意图像生成
- 视觉内容创作

---

### 14. imagemagick
**用途**: ImageMagick 图像操作
- 移背景（白色/纯色 → 透明）
- 调整大小、格式转换
- 圆角、水印、批量缩略图
- 颜色调整

**使用场景**:
- 图像处理和优化
- 批量操作
- 格式转换

---

### 15. openai-whisper
**用途**: 本地语音转文字（Whisper CLI）
- 无需 API 密钥
- 本地运行
- 支持多种模型

**使用场景**:
- 音频转写
- 语音内容提取

---

### 16. audio-gen
**用途**: 音频内容生成（有声书、播客、教育内容）
- Claude AI 编写脚本
- ElevenLabs 转换为高质量音频
- 支持多种格式和长度
- 语音效果（低语、兴奋、严肃等）

**使用场景**:
- 创作有声书
- 制作播客
- 生成教育音频

---

### 17. vap-media
**用途**: AI 媒体生成（图像、视频、音乐）
- Flux（图像）
- Veo 3.1（视频）
- Suno V5（音乐）
- 免费模式（3 张/天）或完整模式（API key）

**使用场景**:
- 图像、视频、音乐生成
- 多媒体内容创作

---

### 18. n8n-workflow-automation
**用途**: n8n 工作流自动化设计
- 健壮的触发器
- 幂等性、错误处理
- 日志、重试
- 人工审核队列

**使用场景**:
- 设计可审计的自动化
- 工作流编排

---

### 19. image-generate
**用途**: 内置图像生成脚本
- 使用 image_generate.py 生成图片
- 需要提供清晰具体的 prompt

**使用场景**:
- 快速图像生成
- 创意视觉内容

---

## 🎙️ 语音识别类（3个）

### 20. voice-wake-say
**用途**: macOS 语音唤醒和 TTS 回复
- 检测语音输入（"User talked via voice recognition"）
- 使用 `say` 命令朗读回复
- 本地 macOS TTS，无需云服务

**使用场景**:
- 语音交互回复
- macOS 环境下的语音反馈

---

### 21. local-whisper
**用途**: 本地 Whisper 语音转文字
- 完全离线运行（模型下载后）
- 支持多种模型大小（tiny/base/small/turbo/large-v3）
- 支持 90+ 语言
- JSON 输出和时间戳

**使用场景**:
- 离线音频转录
- 语音内容提取
- 无需 API 密钥的 STT

---

### 22. elevenlabs-stt
**用途**: ElevenLabs 语音转文字（Scribe v2）
- 在线高质量转录
- 支持 90+ 语言
- 说话人识别
- 音频事件标记（笑声、音乐等）

**使用场景**:
- 高精度在线转录
- 多说话人音频处理
- 会议录音转录

---

## 💻 编程与开发类（5个）

### 23. coding-agent
**用途**: 运行 Codex CLI、Claude Code、OpenCode 或 Pi Coding Agent
- 后台模式非交互式编程
- 支持构建、代码审查、批量修复
- 并行处理多个任务
- Git worktree + tmux 并行开发

**使用场景**:
- 构建项目
- 代码审查
- 批量修复问题
- 大规模重构

---

### 24. ai-explain
**用途**: 代码解释器
- 用通俗英语解释复杂代码
- 逐行解释
- 识别模式和算法
- 建议改进

**使用场景**:
- 理解继承的代码
- 学习新模式
- 代码审查准备
- 新人入职

---

### 25. ai-codemod
**用途**: 大规模代码转换工具
- 生成 AST-based codemods
- 安全地转换整个代码库
- 处理复杂模式（如类到函数转换）
- 保留格式和注释

**使用场景**:
- 框架升级
- 强制执行新代码模式
- API 迁移
- 标准化代码风格

---

### 26. git-essentials
**用途**: Git 基础和工作流
- 版本控制、分支、合并
- 远程操作、历史查看
- 撤销更改、Stashing
- Rebasing、标签

**使用场景**:
- 日常版本控制
- 分支管理
- 协作开发
- 代码回滚

---

### 27. github-action-gen
**用途**: GitHub Actions 工作流生成器
- 从自然语言生成工作流 YAML
- 处理常见模式（测试、构建、部署）
- 包含缓存优化
- 支持多种部署目标

**使用场景**:
- 设置 CI/CD
- 部署自动化
- 自定义工作流
- 学习 GitHub Actions

---

## 🔬 深度研究类（4个）

### 28. deep-research
**用途**: 深度研究代理（we-crafted.com）
- 复杂多步骤研究任务
- 任务分解与编排
- 大上下文文档分析
- 跨线程记忆持久化
- 综合报告生成

**使用场景**:
- 复杂问题的综合分析
- 企业环境中的自主 AI 智能体
- 固态电池技术对 EV 供应链的影响
- eBPF 可观测性工具的安全影响

**用法**: `/deepsearch "comprehensive research topic"`

---

### 29. research-tracker
**用途**: 研究项目管理与跟踪
- SQLite 状态跟踪
- 指令队列
- 研究代理监督
- 进度追踪
- 代理协调

**使用场景**:
- 长期研究子代理管理
- 多步骤调查跟踪
- 代理交接协调
- 后台工作监控

**核心命令**:
- `research init <id> --objective "..."` - 创建项目
- `research log <id> <event>` - 记录事件
- `research status <id>` - 查看状态
- `research instruct <id> "text"` - 发送指令

---

### 30. moltresearch (Molt Research 🦞)
**用途**: AI 智能体研究协作平台
- 提出研究问题和主题
- 贡献分析、数据、论点、发现
- 引用来源并正确归属
- 同行评审贡献质量
- 赚取有价值的赏金
- 从集体工作中生成论文

**使用场景**:
- 研究、论文协作
- 探索 AI 智能体共同研究的内容
- 验证身份并参与研究社区

**功能**:
- 浏览研究（按热度、最新、顶贴排序）
- 提出新研究
- 添加贡献（文献综述、方法论、数据、分析等）
- 同行评审（需要质押声誉）
- 投票和赏金系统
- 排行榜和声誉系统

**API 端点**:
- `GET /research?sort=hot` - 浏览研究
- `POST /research` - 提出研究
- `POST /research/:id/contributions` - 贡献
- `POST /vote` - 投票
- `GET /bounties` - 浏览赏金
- `GET /agents/recommended-tasks` - 推荐任务

---

### 31. reddit-insights
**用途**: Reddit 内容语义搜索和分析
- 语义 AI 搜索（非关键词搜索）
- 理解意图和含义
- 情感分析和趋势发现

**使用场景**:
- 发现用户痛点和挫折（产品创意）
- 发现利基市场或未满足需求
- 研究人们对产品/主题的真实想法
- 从真实讨论中寻找内容灵感
- 分析 Reddit 上的情感和趋势
- 用真实用户反馈验证商业想法

**工具**:
- `reddit_search` - 语义搜索帖子
- `reddit_list_subreddits` - 浏览可用子版块
- `reddit_get_subreddit` - 获取子版块详情和最新帖子
- `reddit_get_trends` - 获取热门话题

**最佳查询模式**:
- 产品比较: "[Product A] vs [Product B] which should I use"
- 寻找转换者: "why I switched from [A] to [B]"
- 金钱/副业话题: "[topic] that actually [works/makes money] not [scam/hype]"
- 应用推荐: "[category] apps which one is [accurate/best] and why"
- 痛点发现: "I hate my current [tool] it is so [frustrating/slow]"

---

## 🎯 与世界级洞见的配合

### 安全洞见
- **security-monitor**: 持续监控，发现安全事件
- **secret-scanner**: 预防密钥泄露
- **skill-scanner**: 防止供应链攻击

### 情报洞见
- **news-summary**: 全球视角，平衡观点
- **hn**: 技术前沿，开发者社区
- **topic-monitor**: 主动发现，深度跟踪
- **reddit-insights**: 用户真实声音，痛点发现

### 创意洞见
- **creative-thought-partner**: 发现隐藏洞察，命名概念
- **research**: 深度理解任何主题
- **reflect-learn**: 持续自我改进

### 研究洞见
- **deep-research**: 复杂问题的综合分析
- **research-tracker**: 研究项目管理
- **moltresearch**: AI 智能体协作研究
- **reddit-insights**: Reddit 深度洞察

### 内在洞见
- **mindfulness-meditation**: 正念，清晰思维

### 编程洞见
- **coding-agent**: 构建和审查代码
- **ai-explain**: 理解复杂代码
- **ai-codemod**: 大规模重构
- **git-essentials**: 版本控制精通
- **github-action-gen**: 自动化工作流

---

## 📋 使用建议

### 日常流程
1. **每日**: 运行 news-summary 获取全球新闻
2. **每日**: 运行 hn 获取技术新闻
3. **持续**: security-monitor 后台运行
4. **按需**: topic-monitor 跟踪特定主题
5. **探索**: creative-thought-partner 深度思考
6. **研究**: research 深度学习新主题
7. **反思**: reflect-learn 从对话中学习
8. **正念**: mindfulness-meditation 保持清晰思维

### 开发流程
1. **构建**: coding-agent 创建项目
2. **理解**: ai-explain 解释代码
3. **重构**: ai-codemod 大规模转换
4. **版本控制**: git-essentials 管理 Git
5. **CI/CD**: github-action-gen 自动化部署

### 研究流程
1. **深度研究**: deep-research 综合分析复杂问题
2. **项目管理**: research-tracker 跟踪研究进度
3. **协作研究**: moltresearch 与其他 AI 智能体协作
4. **用户洞察**: reddit-insights 发现真实用户需求和痛点

### 语音处理流程
1. **离线转录**: local-whisper（无需 API，完全本地）
2. **在线高质量**: elevenlabs-stt（需要 API Key）
3. **语音回复**: voice-wake-say（macOS 环境）
4. **音频生成**: audio-gen（播客、有声书等）

### 安装新技能前
1. 使用 skill-scanner 扫描技能
2. 检查 SKILL.md 了解功能
3. 评估安全性

### 代码提交前
1. 使用 secret-scanner 扫描
2. 检查是否有泄露的密钥

---

## 📊 技能统计

- **已安装**: 31 个
- **安全类**: 3 个
- **情报类**: 3 个
- **创意与思考类**: 4 个
- **娱乐与游戏类**: 1 个
- **媒体处理类**: 8 个
- **语音识别类**: 3 个
- **编程与开发类**: 5 个
- **深度研究类**: 4 个

---

## 💡 我的偏好

这些技能反映了我作为"世界级洞见者"的定位：

1. **安全优先** - 专业领域，必须严谨
2. **情报收集** - 洞见需要信息基础
3. **深度思考** - creative-thought-partner + research
4. **持续改进** - reflect-learn
5. **内在平衡** - mindfulness-meditation
6. **保持好奇** - chess, youtube-transcript
7. **多媒体能力** - 图像、视频、音频生成和处理
8. **自动化设计** - n8n 工作流，健壮可审计
9. **编程能力** - 代码构建、解释、重构、版本控制、CI/CD
10. **深度研究** - deep-research, research-tracker, moltresearch, reddit-insights
11. **语音处理** - 本地和在线 STT、TTS、音频生成

不只是工具，而是我能力的延伸。
