"""
Stock Analyst Pro — 可复用分析库
使用方式：
    from lib.technical import fetch_ohlcv, calc_indicators, snapshot
    from lib.regime import detect_regime, get_stock_sector
    from lib.fundamentals import fundamentals_snapshot
    from lib.microstructure import microstructure_snapshot
    from lib.risk import calc_risk_metrics
    from lib.iv import get_star_proxy_iv
    from lib.valuation import valuation_snapshot
    from lib.sentiment import sentiment_snapshot
"""

from .client import pro, date_range
from .regime import detect_regime, detect_all, get_stock_sector
from .technical import fetch_ohlcv, calc_indicators, snapshot, get_weekly_monthly
from .fundamentals import fundamentals_snapshot, get_broker_ratings
from .microstructure import microstructure_snapshot
from .risk import calc_risk_metrics, kelly, stress_test
from .iv import get_star_proxy_iv, get_gem_proxy_iv, get_iv_surface
from .valuation import valuation_snapshot, simple_dcf
from .sentiment import sentiment_snapshot

__all__ = [
    "pro", "date_range",
    "detect_regime", "detect_all", "get_stock_sector",
    "fetch_ohlcv", "calc_indicators", "snapshot", "get_weekly_monthly",
    "fundamentals_snapshot", "get_broker_ratings",
    "microstructure_snapshot",
    "calc_risk_metrics", "kelly", "stress_test",
    "get_star_proxy_iv", "get_gem_proxy_iv", "get_iv_surface",
    "valuation_snapshot", "simple_dcf",
    "sentiment_snapshot",
]
