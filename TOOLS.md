# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases  
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras
- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH
- home-server → 192.168.1.100, user: admin

### TTS
- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## 🔧 Custom Tools

### Feishu File Send
**Location:** `/root/openclaw/skills/feishu-file-send/send-file.js`

**用途:** 绕过 Clawdbot 飞书插件的文件上传 bug,直接调用飞书 API 发送文件

**使用:**
```bash
node /root/openclaw/skills/feishu-file-send/send-file.js \
  --file <文件路径> \
  --target <用户 open_id>
```

**何时使用:**
- 需要发送 `.md`, `.txt`, `.json` 等文件时
- `message` tool 报 400 错误时
- 需要确保文件发送成功时

**限制:**
- 文件大小: 最大 30MB
- 目标: 仅支持用户 open_id (ou_xxx),不支持群组

### Polymarket
- **凭据**: 用 gateway env 里的原始凭据，**不要自行创建/替换 key**
- **持仓查询**: 用 Data API `https://data-api.polymarket.com/positions?user=<funder>` (无需认证)
- **交易/余额**: 用 CLOB API (`clob.polymarket.com`) + 原始 HMAC 凭据
- **API 区分** ⚠️: `/positions` **从来不在 CLOB API 上**，它属于 Data API (`data-api.polymarket.com`)。CLOB API 只处理交易/订单/余额。之前报 404 是调错了域名，不是端点被移除。
- **教训 (2026-02-28)**:
  1. 端点 404 ≠ key 过期，先用 balance 验证 key 再判断
  2. 搞清楚端点属于哪个 API（CLOB vs Data vs Gamma），不要盲猜域名
  3. 用户给的凭据不要自作主张替换/重建
- **Polymarket API 三件套**:
  - CLOB API (`clob.polymarket.com`): 交易/订单/余额，需 HMAC 认证
  - Data API (`data-api.polymarket.com`): 持仓/市场数据/历史，无需认证
  - Gamma API (`gamma-api.polymarket.com`): 市场元数据/事件信息，无需认证
- Proxy: 所有请求走 `socks5h://127.0.0.1:7880`
- **交易纪律** ⚠️ (2026-02-28 血的教训):
  1. 单一主题仓位上限 15%（伊朗踩了 31% 全亏）
  2. 同方向不重复建仓——一个论点只下一注
  3. 不买价格 >$0.85 的 NO（赔率 1:6+ 太差）
  4. **读完整市场描述**，不只看标题（"US or Israel" 不只是 "US"）
  5. 设止损：单仓亏损 >30% 减仓
  6. 地缘政治高波动 → 只用彩票策略（小注大赔率）
  7. **先查 order book 再下单** — 显示 46% 不代表能 46% 买到，spread 1%-99% 的市场等于没流动性
  8. **X 搜索验证交易假设** — 实时情报比模型推理靠谱
- **交易技术教训** (2026-02-28):
  - HMAC 签名: path 不含 query string（`path.split('?')[0]`）
  - Order owner: API key 字符串（uuid），不是钱包地址（0x...）
  - EIP-712 签名: 用 Python `py_order_utils`，Node ethers 不兼容
  - 合约地址: Regular `0x4bFb41d5...`，negRisk `0xC5d563A3...`，不要搞反
  - negRisk 市场无独立 order book，需要 adapter 交易
  - 最小订单量: 5 shares

### Evolver / EvoMap
- **Heartbeat daemon**: 不能对 timer 调用 `unref()`，否则 Node 进程直接退出
- **Cron 调度**: 关键任务用 cron 表达式，不用 `everyMs`（gateway 重启后 anchor 漂移）
- **当前配置**: heartbeat 每 5 分钟, evolution 每天 02/08/14/20 点

---

Add whatever helps you do your job. This is your cheat sheet.
