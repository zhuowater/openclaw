"""
X/Twitter intelligence via xAI/Skyeye Responses API server-side x_search.

This module intentionally does not print or persist API keys. It is best-effort:
when credentials or network/API access are unavailable it returns an explicit
error so the investment memo can mark the data gap instead of hallucinating
social sentiment.
"""
import json
import os
import urllib.request
from pathlib import Path
from typing import Dict, List

from .fundamentals import get_company_info


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


def _api_config() -> Dict[str, str]:
    _load_env_file()
    key = os.getenv("GROK_API_KEY") or os.getenv("SKYEYE_API_KEY") or os.getenv("XAI_API_KEY")
    base = os.getenv("GROK_API_BASE") or os.getenv("XAI_API_BASE") or "https://api.skyeye.net/v1"
    model = os.getenv("GROK_X_SEARCH_MODEL") or "grok-4-1-fast-reasoning"
    return {"key": key or "", "base": base.rstrip("/"), "model": model}


def _extract_text(resp: dict) -> str:
    chunks: List[str] = []
    for item in resp.get("output", []) or []:
        if item.get("type") == "message":
            for c in item.get("content", []) or []:
                if isinstance(c, dict) and c.get("type") in ("output_text", "text"):
                    chunks.append(c.get("text", ""))
        elif item.get("type") == "output_text":
            chunks.append(item.get("text", ""))
    if not chunks and resp.get("output_text"):
        chunks.append(str(resp.get("output_text")))
    return "\n".join([c for c in chunks if c]).strip()


def _extract_citations(resp: dict) -> List[str]:
    urls = []
    for item in resp.get("output", []) or []:
        for c in item.get("content", []) or []:
            for ann in c.get("annotations", []) or []:
                url = ann.get("url")
                if url and url not in urls:
                    urls.append(url)
    return urls[:10]


def build_queries(ts_code: str, name: str = "", industry: str = "") -> List[str]:
    code_plain = ts_code.replace(".SH", "").replace(".SZ", "")
    parts = [p for p in [name, ts_code, code_plain, industry] if p]
    q1 = " OR ".join(parts[:3]) if parts else ts_code
    q2 = " ".join([p for p in [name, code_plain, "股票", "涨停", "异动"] if p])
    q3 = " ".join([p for p in [industry, name, "政策", "产业链", "催化剂"] if p])
    return list(dict.fromkeys([q1, q2, q3]))[:3]


def x_intelligence_snapshot(ts_code: str, name: str = "", industry: str = "", count: int = 10) -> dict:
    """Search X/Twitter and summarize trading-relevant intelligence."""
    cfg = _api_config()
    if not cfg["key"]:
        return {"error": "未配置 GROK_API_KEY / SKYEYE_API_KEY / XAI_API_KEY，跳过X情报"}

    if not name or not industry:
        try:
            info = get_company_info(ts_code)
            name = name or info.get("name", "")
            industry = industry or info.get("industry", "")
        except Exception:
            pass

    queries = build_queries(ts_code, name, industry)
    prompt = f"""
你是股票交易情报分析员。请使用X搜索最近讨论，分析标的：{name or ts_code}（{ts_code}），行业：{industry or '未知'}。
搜索关键词候选：{queries}
请输出中文，必须区分 rumor/confirmed，避免把旧帖当新催化剂。
返回：
1) 3-5条最重要X情报要点，每条注明是否有交易意义；
2) 当前X情绪：偏多/偏空/分歧/样本不足；
3) 热度：低/中/高，以及是否过热；
4) 空方论点或风险；
5) 若有URL引用，保留引用。
""".strip()
    payload = {
        "model": cfg["model"],
        "input": prompt,
        "tools": [{"type": "x_search"}],
        "max_output_tokens": 1600,
    }
    url = f"{cfg['base']}/responses"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + cfg["key"], "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            resp = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        return {"error": f"X搜索失败：{type(e).__name__}: {e}"}

    text = _extract_text(resp)
    if not text:
        return {"error": "X搜索无可用文本输出", "queries": queries}
    return {
        "source": "xAI/Skyeye Responses API x_search",
        "model": cfg["model"],
        "queries": queries,
        "summary": text,
        "citations": _extract_citations(resp),
    }
