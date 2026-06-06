"""
YouTube intelligence for stock-analysis methods, market narrative, and retail heat.

Priority:
1) Official YouTube Data API v3 when YOUTUBE_API_KEY / GOOGLE_API_KEY is configured.
2) yt-dlp flat YouTube search fallback when no API key is available.

YouTube is treated as method/narrative/retail-sentiment discovery only. It must
not replace Tushare/announcements/backtests for hard price, financial, valuation,
or capital-flow facts.
"""
import json
import os
import re
import shutil
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

try:
    from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    YouTubeTranscriptApi = None

from .fundamentals import get_company_info

HYPE_WORDS = [
    "暴涨", "翻倍", "妖股", "黄金坑", "必看", "起飞", "all in", "财富自由", "稳赚", "only strategy",
    "best", "ultimate", "secret", "million", "insanely", "beat 99", "viral", "神器",
]

METHOD_RULES = [
    {
        "theme": "Price Action / 市场结构",
        "keywords": ["price action", "k线", "k 線", "形态", "trendline", "support", "resistance", "breakout"],
        "core": "先判断结构而非指标：HH/HL、LH/LL、区间、收盘确认、假突破。",
        "checks": ["swing high/low", "HH/HL/LH/LL", "收盘突破而非盘中刺破", "回踩是否守住", "结构失效价"],
    },
    {
        "theme": "SMC/ICT/Wyckoff 流动性结构",
        "keywords": ["smc", "ict", "smart money", "wyckoff", "liquidity", "order block", "fvg", "spring", "utad"],
        "core": "把聪明钱术语还原为可验证量价：扫前高/前低、BOS/CHOCH、吸筹/派发、努力与结果。",
        "checks": ["liquidity sweep", "BOS/CHOCH", "放量不涨/缩量回踩", "VWAP/AVWAP承接", "大单/筹码/龙虎榜验证"],
    },
    {
        "theme": "VWAP / Anchored VWAP 成本线",
        "keywords": ["vwap", "anchored vwap", "avwap", "成交均价", "机构成本"],
        "core": "VWAP是执行成本，AVWAP是事件参与资金成本；跌破关键AVWAP代表叙事资金转亏。",
        "checks": ["当日VWAP偏离", "5/20日成交均价", "财报/跳空/涨停/阶段低点AVWAP", "回踩VWAP量能", "VWAP斜率"],
    },
    {
        "theme": "Volume Profile / 筹码价值区",
        "keywords": ["volume profile", "poc", "vah", "val", "筹码", "成交量", "量价", "volume"],
        "core": "关注价格接受区与拒绝区：POC/VAH/VAL/HVN/LVN；A股可用筹码分布代理。",
        "checks": ["POC/成本中枢", "价值区上沿/下沿", "winner_rate", "上方套牢盘", "放量突破是否进入新价值区"],
    },
    {
        "theme": "Risk/Reward / 交易计划",
        "keywords": ["risk reward", "risk management", "position sizing", "stop loss", "rr", "day trading", "swing trading"],
        "core": "先定义失效点和R倍数，再谈方向；没有≥2:1赔率的机会降级为观察。",
        "checks": ["入场触发", "结构止损", "第一/第二目标", "R multiple", "按单笔亏损反推仓位"],
    },
    {
        "theme": "AI量化/回测稳健性",
        "keywords": ["quant", "algorithmic", "machine learning", "python", "backtest", "walk forward", "overfitting", "claude", "ai trading"],
        "core": "AI是研究/工程放大器，不是Alpha；任何策略必须过样本外、walk-forward、成本、过拟合审计。",
        "checks": ["策略假设卡", "shift(1)/as-of date", "walk-forward", "参数稳定性", "交易成本/滑点/涨跌停", "随机基线/置换检验"],
    },
    {
        "theme": "中文价值/财报/周期",
        "keywords": ["财报", "价值投资", "潜力股", "核心3+1", "中国股市", "a股", "周期", "产业链", "价值陷阱", "成长陷阱", "段永平", "邱国鹭"],
        "core": "专业看门道=行业/公司/财务/市场预期四层拆解；好赛道+好公司+好价格+催化/预期差。",
        "checks": ["三表联读", "应收/存货/现金流红旗", "估值隐含预期", "产业链利润池", "A股周期位置", "视频/短视频一致看多禁追"],
    },
]


def _load_env_file(path: str = "/root/.env") -> None:
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _api_key() -> str:
    _load_env_file()
    return os.getenv("YOUTUBE_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""


def _clean(text: str, limit: int = 240) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text[:limit]


def _iso_after(days: int) -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=max(1, days))
    return dt.isoformat(timespec="seconds").replace("+00:00", "Z")


def build_youtube_queries(ts_code: str, name: str = "", industry: str = "") -> List[str]:
    code_plain = ts_code.replace(".SH", "").replace(".SZ", "")
    queries: List[str] = []
    if name:
        queries += [
            f"{name} 股票分析 最新",
            f"{name} {code_plain} 业绩 财报 估值",
            f"{name} {code_plain} 技术分析 VWAP 筹码",
        ]
    if industry:
        queries += [
            f"{industry} 股票 投资 逻辑 产业链",
            f"{industry} 价值投资 财报分析 周期",
        ]
    # Methodology baselines: keep these even when target-specific results are sparse.
    queries += [
        "专业股票投资人怎么看门道 潜力股 核心3+1",
        "A股 价值投资 财报分析 价值陷阱 成长陷阱",
        "中国股市 周期 规律 散户 融资 牛市",
        "price action stock trading risk reward VWAP volume profile",
        "SMC ICT Wyckoff stock trading liquidity order block",
        "algorithmic trading machine learning stocks backtesting overfitting walk forward",
    ]
    # Keep enough room for target/company queries plus the fixed methodology baselines.
    return list(dict.fromkeys([q for q in queries if q.strip()]))[:12]


def youtube_data_search(query: str, max_results: int = 8, order: str = "relevance", published_after_days: int = 365) -> List[dict]:
    key = _api_key()
    if not key:
        return []
    params = {
        "part": "snippet",
        "type": "video",
        "q": query,
        "maxResults": str(min(max_results, 50)),
        "order": order,
        "publishedAfter": _iso_after(published_after_days),
        "key": key,
    }
    url = "https://www.googleapis.com/youtube/v3/search?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    ids = [item.get("id", {}).get("videoId") for item in data.get("items", [])]
    ids = [x for x in ids if x]
    stats: Dict[str, dict] = {}
    if ids:
        vparams = {"part": "statistics,contentDetails,snippet", "id": ",".join(ids), "key": key}
        vurl = "https://www.googleapis.com/youtube/v3/videos?" + urllib.parse.urlencode(vparams)
        with urllib.request.urlopen(vurl, timeout=30) as r:
            vdata = json.loads(r.read().decode("utf-8"))
        for item in vdata.get("items", []):
            stats[item.get("id")] = item

    out = []
    for item in data.get("items", []):
        vid = item.get("id", {}).get("videoId")
        sn = item.get("snippet", {})
        st = (stats.get(vid) or {}).get("statistics", {})
        out.append({
            "id": vid,
            "url": f"https://www.youtube.com/watch?v={vid}" if vid else "",
            "title": _clean(sn.get("title", ""), 180),
            "channel": sn.get("channelTitle", ""),
            "published_at": sn.get("publishedAt", ""),
            "description": _clean(sn.get("description", ""), 300),
            "view_count": int(st.get("viewCount", 0) or 0),
            "like_count": int(st.get("likeCount", 0) or 0),
            "source": "YouTube Data API v3",
            "query": query,
        })
    return out


def ytdlp_search(query: str, max_results: int = 8) -> List[dict]:
    if not shutil.which("yt-dlp"):
        return []
    cmd = ["yt-dlp", "--dump-json", "--flat-playlist", "--no-warnings", f"ytsearch{max_results}:{query}"]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True, timeout=90)
    except Exception:
        return []
    rows = []
    for line in out.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            x = json.loads(line)
        except Exception:
            continue
        vid = x.get("id")
        rows.append({
            "id": vid,
            "url": x.get("webpage_url") or x.get("url") or (f"https://www.youtube.com/watch?v={vid}" if vid else ""),
            "title": _clean(x.get("title", ""), 180),
            "channel": x.get("channel") or x.get("uploader") or "",
            "published_at": x.get("upload_date") or "",
            "duration": x.get("duration"),
            "description": _clean(x.get("description", ""), 300),
            "view_count": int(x.get("view_count") or 0),
            "source": "yt-dlp YouTube search fallback",
            "query": query,
        })
    return rows


def _transcript_sample(video_id: str, languages: Optional[List[str]] = None, max_chars: int = 1200) -> dict:
    if not video_id or YouTubeTranscriptApi is None:
        return {"available": False, "reason": "youtube_transcript_api not available"}
    languages = languages or ["zh-Hans", "zh", "en"]
    try:
        api = YouTubeTranscriptApi()
        fetched = api.fetch(video_id, languages=languages)
        text = " ".join([getattr(s, "text", "") for s in list(fetched)[:120]])
        return {"available": True, "sample": _clean(text, max_chars)}
    except Exception as e:
        return {"available": False, "reason": f"{type(e).__name__}: {str(e)[:180]}"}


def classify_video(v: dict) -> dict:
    text = (v.get("title", "") + " " + v.get("description", "") + " " + v.get("query", "")).lower()
    matched = []
    for rule in METHOD_RULES:
        if any(k.lower() in text for k in rule["keywords"]):
            matched.append({"theme": rule["theme"], "core": rule["core"], "checks": rule["checks"]})
    if not matched:
        matched.append({"theme": "泛股票/行情叙事", "core": "只作为叙事热度样本，不能直接转成信号。", "checks": ["回到硬数据核验", "检查是否软广/标题党", "只记录情绪热度"]})
    title = (v.get("title") or "").lower()
    hype_hits = [w for w in HYPE_WORDS if w.lower() in title]
    views = int(v.get("view_count") or 0)
    heat = 0
    if views >= 1_000_000: heat += 3
    elif views >= 300_000: heat += 2
    elif views >= 100_000: heat += 1
    heat += min(len(hype_hits), 3)
    if any(k in text for k in ["股票分析 最新", "target", "price prediction", "暴涨", "翻倍"]):
        heat += 1
    return {
        "themes": matched[:3],
        "hype_words": hype_hits,
        "retail_heat_score": min(heat, 8),
        "heat_label": "高" if heat >= 5 else ("中" if heat >= 3 else "低"),
    }


def rank_videos(rows: List[dict]) -> List[dict]:
    seen = {}
    for r in rows:
        vid = r.get("id") or r.get("url")
        if not vid:
            continue
        old = seen.get(vid)
        if old is None or (r.get("view_count") or 0) > (old.get("view_count") or 0):
            seen[vid] = r
    ranked = list(seen.values())
    for r in ranked:
        r["classification"] = classify_video(r)
    ranked.sort(key=lambda r: (r.get("classification", {}).get("retail_heat_score", 0), r.get("view_count") or 0), reverse=True)
    return ranked


def infer_method_takeaways(videos: List[dict]) -> List[str]:
    themes = []
    for v in videos:
        for t in v.get("classification", {}).get("themes", []):
            if t["theme"] not in themes:
                themes.append(t["theme"])
    takeaways = []
    if "Price Action / 市场结构" in themes:
        takeaways.append("Price Action内核：先识别结构（HH/HL、LH/LL、区间、假突破），再解释指标；报告必须给结构失效价。")
    if "SMC/ICT/Wyckoff 流动性结构" in themes:
        takeaways.append("SMC/ICT/Wyckoff内核：流动性扫单和吸筹/派发只是候选解释，必须用VWAP、大单、筹码、换手、龙虎榜验证。")
    if "VWAP / Anchored VWAP 成本线" in themes:
        takeaways.append("VWAP内核：当日VWAP看执行强弱，AVWAP看事件资金成本；跌破关键AVWAP是叙事资金转亏信号。")
    if "Volume Profile / 筹码价值区" in themes:
        takeaways.append("Volume Profile内核：POC/VAH/VAL定义价格接受区；A股用筹码分布近似价值区，winner_rate高位放量滞涨要警惕派发。")
    if "Risk/Reward / 交易计划" in themes:
        takeaways.append("风险管理内核：没有入场触发、结构止损、目标价和R/R的分析，不应给买入建议；赔率<2:1默认降级。")
    if "AI量化/回测稳健性" in themes:
        takeaways.append("AI量化内核：LLM只能生成假设和代码；策略必须通过as-of/shift(1)、样本外、walk-forward、成本和过拟合审计。")
    if "中文价值/财报/周期" in themes:
        takeaways.append("中文价值/A股内核：行业-公司-财务-市场预期四层拆解；好赛道+好公司+好价格+催化，视频热度过高反而进入禁追区。")
    return takeaways[:8]


def build_method_mapping(videos: List[dict]) -> List[dict]:
    out = []
    seen = set()
    for v in videos:
        for t in v.get("classification", {}).get("themes", []):
            if t["theme"] in seen:
                continue
            seen.add(t["theme"])
            out.append({
                "theme": t["theme"],
                "youtube_core": t["core"],
                "convert_to_checks": t["checks"],
                "report_rule": "只作为方法论/情绪热度；必须回到Tushare硬数据、公告、回测和证伪条件。",
            })
    return out[:8]


def youtube_intelligence_snapshot(ts_code: str, name: str = "", industry: str = "", max_results: int = 10, with_transcript: bool = False) -> dict:
    if not name or not industry:
        try:
            info = get_company_info(ts_code)
            name = name or info.get("name", "")
            industry = industry or info.get("industry", "")
        except Exception:
            pass
    queries = build_youtube_queries(ts_code, name, industry)
    all_rows: List[dict] = []
    api_used = bool(_api_key())
    for q in queries:
        if api_used:
            try:
                all_rows.extend(youtube_data_search(q, max_results=max_results, order="relevance"))
                all_rows.extend(youtube_data_search(q, max_results=max_results, order="viewCount"))
            except Exception:
                all_rows.extend(ytdlp_search(q, max_results=max_results))
        else:
            all_rows.extend(ytdlp_search(q, max_results=max_results))
    ranked = rank_videos(all_rows)
    videos = ranked[:max_results]
    if with_transcript:
        for v in videos[:3]:
            v["transcript"] = _transcript_sample(v.get("id", ""))
    heat_scores = [v.get("classification", {}).get("retail_heat_score", 0) for v in videos]
    avg_heat = round(sum(heat_scores) / len(heat_scores), 2) if heat_scores else 0
    # Use the full discovered set for method coverage; display remains capped.
    method_source = ranked or videos
    return {
        "source": "YouTube Data API v3" if api_used else "yt-dlp fallback (no YOUTUBE_API_KEY/GOOGLE_API_KEY found)",
        "queries": queries,
        "target": f"{name or ts_code}（{ts_code}）" + (f" / {industry}" if industry else ""),
        "videos": videos,
        "retail_heat": {
            "avg_score": avg_heat,
            "label": "高" if avg_heat >= 5 else ("中" if avg_heat >= 3 else "低"),
            "warning": "若目标/题材热视频集中且标题情绪化，视为零售拥挤，进入禁追/减仓审查。",
        },
        "method_takeaways": infer_method_takeaways(method_source),
        "method_mapping": build_method_mapping(method_source),
        "discipline": "YouTube用于方法论/叙事/热度发现；视频观点必须回到Tushare硬数据、公告原文、回测和证伪条件核验。",
    }
