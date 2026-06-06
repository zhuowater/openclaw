"""
Domestic China intelligence: Baidu web results + Xueqiu discussion discovery.

For A-shares, X/Twitter is often sparse. This module adds Chinese-market
open-source signals. It is best-effort and explicitly labels search/scrape
limits instead of treating snippets as confirmed facts.
"""
import os
import re
import shutil
import subprocess
from html import unescape
from pathlib import Path
from typing import Dict, List
from urllib.parse import quote_plus, urlparse, parse_qs, unquote

import requests
from bs4 import BeautifulSoup

from .fundamentals import get_company_info

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"


def _load_env_file(path: str = "/root/.env") -> None:
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _clean(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s or "")
    s = unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _baidu_redirect_url(href: str) -> str:
    # Baidu often uses /link?url=...; keep it if resolving is slow/unavailable.
    if not href:
        return ""
    if href.startswith("http"):
        return href
    return "https://www.baidu.com" + href


def _ddg_url(href: str) -> str:
    if not href:
        return ""
    if href.startswith("//"):
        href = "https:" + href
    try:
        qs = parse_qs(urlparse(href).query)
        if "uddg" in qs:
            return unquote(qs["uddg"][0])
    except Exception:
        pass
    return href


def ddg_web_search(query: str, limit: int = 8) -> List[dict]:
    """Secondary fallback for Chinese results when Baidu returns anti-bot/timeout HTML."""
    url = "https://duckduckgo.com/html/?q=" + quote_plus(query)
    r = requests.get(url, headers={"User-Agent": UA}, timeout=25)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for c in soup.select(".result"):
        a = c.select_one(".result__a")
        if not a:
            continue
        title = _clean(a.get_text(" "))
        sn = c.select_one(".result__snippet")
        snippet = _clean(sn.get_text(" ") if sn else c.get_text(" "))
        if title:
            out.append({"title": title, "snippet": snippet[:260], "url": _ddg_url(a.get("href", ""))})
        if len(out) >= limit:
            break
    return out


def baidu_web_search(query: str, limit: int = 8) -> List[dict]:
    """Scrape Baidu result snippets as a fallback when mcporter is unavailable."""
    url = "https://www.baidu.com/s?wd=" + quote_plus(query)
    r = requests.get(url, headers={"User-Agent": UA}, timeout=25)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for c in soup.select("div.result, div.c-container"):
        a = c.select_one("h3 a") or c.select_one("a")
        if not a:
            continue
        title = _clean(a.get_text(" "))
        href = _baidu_redirect_url(a.get("href", ""))
        # Result abstracts vary across Baidu templates. Collect nearby visible text.
        text = _clean(c.get_text(" "))
        text = text.replace(title, "", 1).strip()
        if title:
            out.append({"title": title, "snippet": text[:260], "url": href})
        if len(out) >= limit:
            break
    return out


def baidu_ai_search(query: str, instruction: str = "", limit: int = 8) -> dict:
    """Prefer configured Baidu AppBuilder via mcporter; fallback to Baidu web HTML."""
    if shutil.which("mcporter"):
        cmd = ["mcporter"]
        # OpenClaw backup carries the configured Baidu MCP server; prefer explicit
        # config so the module works from Hermes' cwd without copying secrets.
        cfg = os.getenv("MCPORTER_CONFIG") or "/root/backup/openclaw/config/mcporter.json"
        if Path(cfg).exists():
            cmd += ["--config", cfg]
        cmd += ["call", "baidu-search.AIsearch", f"query={query}"]
        if instruction:
            cmd.append(f"instruction={instruction}")
        try:
            p = subprocess.run(cmd, text=True, capture_output=True, timeout=90)
            if p.returncode == 0 and p.stdout.strip():
                return {"source": "mcporter baidu-search.AIsearch", "summary": p.stdout.strip(), "results": []}
            err = (p.stderr or p.stdout or "").strip()[:300]
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
    else:
        err = "mcporter not found; used Baidu HTML fallback"
    try:
        results = baidu_web_search(query, limit=limit)
        if results:
            return {"source": "baidu.com HTML fallback", "warning": err, "results": results}
        ddg = ddg_web_search(query, limit=limit)
        return {"source": "DuckDuckGo HTML fallback after empty Baidu HTML", "warning": err + "; Baidu returned no parseable organic results", "results": ddg}
    except Exception as e:
        try:
            ddg = ddg_web_search(query, limit=limit)
            return {"source": "DuckDuckGo HTML fallback after Baidu failure", "warning": err + f"; Baidu搜索失败：{type(e).__name__}: {e}", "results": ddg}
        except Exception as e2:
            return {"source": "baidu.com HTML fallback", "error": f"Baidu/DDG搜索失败：{type(e).__name__}: {e}; {type(e2).__name__}: {e2}", "warning": err, "results": []}


def _snowball_symbol(ts_code: str) -> str:
    if ts_code.endswith(".SZ"):
        return "SZ" + ts_code[:6]
    if ts_code.endswith(".SH"):
        return "SH" + ts_code[:6]
    return ts_code.replace(".", "")


def xueqiu_api_search(ts_code: str, name: str, limit: int = 8) -> dict:
    """Try Xueqiu API when user provides XUEQIU_COOKIE; otherwise return error."""
    _load_env_file()
    cookie = os.getenv("XUEQIU_COOKIE", "")
    if not cookie:
        return {"error": "未配置 XUEQIU_COOKIE，跳过雪球API直连，改用搜索引擎发现雪球内容"}
    sym = _snowball_symbol(ts_code)
    q = name or ts_code
    url = "https://xueqiu.com/statuses/search.json"
    params = {"count": str(limit), "comment": "0", "symbol": sym, "hl": "0", "source": "all", "sort": "time", "page": "1", "q": q, "type": "11"}
    try:
        r = requests.get(url, params=params, headers={"User-Agent": UA, "Cookie": cookie, "Referer": f"https://xueqiu.com/S/{sym}"}, timeout=25)
        if r.status_code != 200:
            return {"error": f"雪球API HTTP {r.status_code}: {r.text[:120]}"}
        data = r.json()
        rows = data.get("list") or data.get("statuses") or []
        items = []
        for it in rows[:limit]:
            text = _clean(it.get("text") or it.get("description") or "")
            uid = it.get("user", {}).get("screen_name") if isinstance(it.get("user"), dict) else ""
            sid = it.get("id") or it.get("status_id")
            items.append({"user": uid, "text": text[:260], "url": f"https://xueqiu.com/{it.get('user_id','')}/{sid}" if sid else ""})
        return {"source": "xueqiu.com API", "results": items}
    except Exception as e:
        return {"error": f"雪球API失败：{type(e).__name__}: {e}"}


def xueqiu_search_fallback(ts_code: str, name: str, industry: str, limit: int = 8) -> dict:
    sym = _snowball_symbol(ts_code)
    q = f"site:xueqiu.com {name or ts_code} {ts_code[:6]} {sym} 股票 最新 讨论"
    res = baidu_ai_search(q, instruction="只返回雪球相关、最近的股票讨论结果，保留标题、摘要、链接", limit=limit)
    res["query"] = q
    res["source"] = "Baidu discovery for Xueqiu + " + res.get("source", "")
    return res


def _summarize_results(results: List[dict]) -> List[str]:
    lines = []
    for i, r in enumerate(results[:8], 1):
        title = r.get("title") or r.get("user") or f"结果{i}"
        snippet = r.get("snippet") or r.get("text") or ""
        url = r.get("url") or ""
        lines.append(f"{i}. {title} — {snippet[:180]}" + (f" ({url})" if url else ""))
    return lines


def cn_intelligence_snapshot(ts_code: str, name: str = "", industry: str = "") -> dict:
    if not name or not industry:
        try:
            info = get_company_info(ts_code)
            name = name or info.get("name", "")
            industry = industry or info.get("industry", "")
        except Exception:
            pass
    code = ts_code[:6]
    queries = {
        "baidu_news": f"{name or ts_code} {code} 股票 最新消息 公告 政策 催化剂 风险",
        "baidu_forum": f"{name or ts_code} {code} 股吧 雪球 投资者讨论 异动 涨停",
    }
    baidu_news = baidu_ai_search(queries["baidu_news"], instruction="按交易价值总结：已确认消息、传闻、风险、来源链接；不要把搜索摘要当公告事实。")
    baidu_forum = baidu_ai_search(queries["baidu_forum"], instruction="聚焦投资者讨论热度、分歧、风险和来源链接。")

    xq_api = xueqiu_api_search(ts_code, name)
    if "error" in xq_api:
        xq = xueqiu_search_fallback(ts_code, name, industry)
        xq["api_error"] = xq_api["error"]
    else:
        xq = xq_api

    warnings = []
    for block in [baidu_news, baidu_forum, xq]:
        if block.get("warning"):
            warnings.append(block["warning"])
        if block.get("error"):
            warnings.append(block["error"])
        if block.get("api_error"):
            warnings.append(block["api_error"])

    return {
        "target": f"{name or ''} {ts_code}".strip(),
        "queries": queries,
        "baidu_news": baidu_news,
        "baidu_forum": baidu_forum,
        "xueqiu": xq,
        "warnings": list(dict.fromkeys(warnings)),
        "summary_lines": {
            "baidu_news": _summarize_results(baidu_news.get("results", [])),
            "baidu_forum": _summarize_results(baidu_forum.get("results", [])),
            "xueqiu": _summarize_results(xq.get("results", [])),
        },
    }
