"""
Tushare 连接客户端
统一管理 token、pro 实例、常用日期常量
"""
import os
from pathlib import Path
from datetime import datetime, timedelta
import tushare as ts


def _load_env_file(path: str = "/root/.env"):
    """Load local env values without printing or persisting secrets."""
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


# ── Token ──────────────────────────────────────────────────────────────
def get_pro():
    _load_env_file()
    token = os.environ.get("TUSHARE_TOKEN") or ts.get_token()
    if not token:
        raise ValueError("未找到 TUSHARE_TOKEN，请设置环境变量或运行 ts.set_token()")
    ts.set_token(token)
    return ts.pro_api()

# ── 日期常量生成 ────────────────────────────────────────────────────────
def date_range():
    today = datetime.today()
    fmt = "%Y%m%d"
    return {
        "TODAY":  today.strftime(fmt),
        "D3":    (today - timedelta(days=3)).strftime(fmt),
        "D10":   (today - timedelta(days=14)).strftime(fmt),   # 含周末
        "D20":   (today - timedelta(days=30)).strftime(fmt),
        "D60":   (today - timedelta(days=90)).strftime(fmt),
        "D6M":   (today - timedelta(days=183)).strftime(fmt),
        "D1Y":   (today - timedelta(days=366)).strftime(fmt),
        "D3Y":   (today - timedelta(days=1096)).strftime(fmt),
        "D5Y":   (today - timedelta(days=1827)).strftime(fmt),
    }

# 单例
_pro = None

def pro():
    global _pro
    if _pro is None:
        _pro = get_pro()
    return _pro
