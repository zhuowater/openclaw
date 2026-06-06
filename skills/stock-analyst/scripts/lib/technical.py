"""
量化技术指标计算模块
输入：OHLCV DataFrame（来自 Tushare daily）
输出：附加全套技术指标的 DataFrame + 最新快照 dict
"""
import numpy as np
import pandas as pd
from .client import pro, date_range


def fetch_ohlcv(ts_code: str, start_date: str = None, end_date: str = None,
                adj: str = "qfq") -> pd.DataFrame:
    """获取日线数据（使用 daily 接口，稳定可靠），默认取3年"""
    d = date_range()
    df = pro().daily(
        ts_code=ts_code,
        start_date=start_date or d["D3Y"],
        end_date=end_date or d["TODAY"],
    )
    return df.sort_values("trade_date").reset_index(drop=True)


def calc_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """计算全套技术指标，原地修改并返回"""
    c = df["close"]

    # ── 移动平均 ────────────────────────────────────────────────────────
    for w in [5, 10, 20, 60, 120, 250]:
        df[f"ma{w}"] = c.rolling(w).mean()

    # ── MACD (EMA12/26，信号线9) ─────────────────────────────────────
    ema12 = c.ewm(span=12, adjust=False).mean()
    ema26 = c.ewm(span=26, adjust=False).mean()
    df["dif"]  = ema12 - ema26
    df["dea"]  = df["dif"].ewm(span=9, adjust=False).mean()
    df["macd_bar"] = 2 * (df["dif"] - df["dea"])

    # ── RSI (14) ─────────────────────────────────────────────────────
    delta = c.diff()
    gain  = delta.clip(lower=0)
    loss  = (-delta).clip(lower=0)
    df["rsi14"] = 100 - 100 / (1 + gain.rolling(14).mean() / loss.rolling(14).mean())

    # ── Bollinger Bands (20, 2σ) ────────────────────────────────────
    df["bb_mid"] = c.rolling(20).mean()
    df["bb_std"] = c.rolling(20).std()
    df["bb_up"]  = df["bb_mid"] + 2 * df["bb_std"]
    df["bb_dn"]  = df["bb_mid"] - 2 * df["bb_std"]
    df["bb_pct"] = (c - df["bb_dn"]) / (df["bb_up"] - df["bb_dn"])  # 0=下轨 1=上轨
    df["bb_width"] = (df["bb_up"] - df["bb_dn"]) / df["bb_mid"]     # 带宽%

    # ── KDJ (9, 3, 3) ────────────────────────────────────────────────
    lo9 = df["low"].rolling(9).min()
    hi9 = df["high"].rolling(9).max()
    df["kdj_rsv"] = (c - lo9) / (hi9 - lo9) * 100
    df["kdj_k"]   = df["kdj_rsv"].ewm(alpha=1/3, adjust=False).mean()
    df["kdj_d"]   = df["kdj_k"].ewm(alpha=1/3, adjust=False).mean()
    df["kdj_j"]   = 3 * df["kdj_k"] - 2 * df["kdj_d"]

    # ── ATR (14) ─────────────────────────────────────────────────────
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - c.shift()).abs(),
        (df["low"]  - c.shift()).abs(),
    ], axis=1).max(axis=1)
    df["atr14"] = tr.rolling(14).mean()
    df["atr_pct"] = df["atr14"] / c * 100   # ATR占价格百分比

    return df


def snapshot(df: pd.DataFrame) -> dict:
    """提取最新一行的技术指标快照，返回 dict"""
    last = df.iloc[-1]
    prev = df.iloc[-2]
    c    = float(last["close"])
    p    = float(prev["close"])

    # MA排列判断
    ma_vals = {w: float(last.get(f"ma{w}", float("nan"))) for w in [5, 10, 20, 60, 120]}
    sorted_ma = sorted(ma_vals.values())
    ma_bull = all(ma_vals[a] >= ma_vals[b] for a, b in [(5,10),(10,20),(20,60),(60,120)])
    ma_bear = all(ma_vals[a] <= ma_vals[b] for a, b in [(5,10),(10,20),(20,60),(60,120)])
    ma_trend = "多头排列" if ma_bull else "空头排列" if ma_bear else "混合排列"

    # MACD信号
    bar_prev = float(df.iloc[-2]["macd_bar"]) if "macd_bar" in df.columns else 0
    bar_curr = float(last["macd_bar"])
    macd_signal = "柱转正(动能改善)" if bar_prev < 0 < bar_curr else \
                  "柱转负(动能恶化)" if bar_prev > 0 > bar_curr else \
                  "红柱扩大" if bar_curr > bar_prev > 0 else \
                  "绿柱扩大" if bar_curr < bar_prev < 0 else "持续"

    rsi = float(last["rsi14"])
    rsi_signal = "超买" if rsi > 70 else "超卖" if rsi < 30 else "中性"

    j = float(last["kdj_j"])
    kdj_signal = "超买" if j > 80 else "超卖" if j < 20 else "中性"

    bb_pct = float(last["bb_pct"])
    bb_signal = "触及上轨(阻力)" if bb_pct > 0.95 else \
                "触及下轨(支撑)" if bb_pct < 0.05 else \
                f"布林{bb_pct*100:.0f}%位置"

    # 52周高低点与George-Hwang效应
    n_252 = min(252, len(df))
    high_52w = round(float(df["high"].iloc[-n_252:].max()), 2)
    low_52w  = round(float(df["low"].iloc[-n_252:].min()),  2)
    dist_52w = round((c - high_52w) / high_52w * 100, 2)   # 负值=低于高点
    if dist_52w > -3:
        dist_52w_signal = f"距52周高点{dist_52w}%（<3%=突破候选，George-Hwang效应：正向预期收益）"
    elif dist_52w > -10:
        dist_52w_signal = f"距52周高点{dist_52w}%（10%以内，中性）"
    else:
        dist_52w_signal = f"距52周高点{dist_52w}%（深度调整，关注企稳信号）"

    return {
        "trade_date":  str(last["trade_date"]),
        "close":       round(c, 2),
        "pct_chg":     round((c - p) / p * 100, 2),
        "vol_wan":     round(float(last["vol"]) / 1e4, 1),
        # MA
        **{f"ma{w}": round(float(last.get(f"ma{w}", float("nan"))), 2) for w in [5,10,20,60,120]},
        "ma_trend":    ma_trend,
        # MACD
        "dif":         round(float(last["dif"]), 3),
        "dea":         round(float(last["dea"]), 3),
        "macd_bar":    round(float(last["macd_bar"]), 3),
        "macd_signal": macd_signal,
        # RSI
        "rsi14":       round(rsi, 1),
        "rsi_signal":  rsi_signal,
        # Bollinger
        "bb_up":       round(float(last["bb_up"]), 2),
        "bb_mid":      round(float(last["bb_mid"]), 2),
        "bb_dn":       round(float(last["bb_dn"]), 2),
        "bb_pct":      round(bb_pct * 100, 0),
        "bb_width":    round(float(last["bb_width"]) * 100, 2),
        "bb_signal":   bb_signal,
        # KDJ
        "kdj_k":       round(float(last["kdj_k"]), 1),
        "kdj_d":       round(float(last["kdj_d"]), 1),
        "kdj_j":       round(j, 1),
        "kdj_signal":  kdj_signal,
        # ATR
        "atr14":       round(float(last["atr14"]), 2),
        "atr_pct":     round(float(last["atr_pct"]), 2),
        # 支撑阻力
        "support_60d": round(float(df["low"].iloc[-60:].min()), 2),
        "resist_60d":  round(float(df["high"].iloc[-60:].max()), 2),
        "support_20d": round(float(df["low"].iloc[-20:].min()), 2),
        "resist_20d":  round(float(df["high"].iloc[-20:].max()), 2),
        # 52周高低点
        "high_52w":        high_52w,
        "low_52w":         low_52w,
        "dist_52w_high":   dist_52w,
        "dist_52w_signal": dist_52w_signal,
    }


def get_weekly_monthly(ts_code: str) -> dict:
    """获取周线和月线趋势"""
    d = date_range()
    results = {}
    for freq, key in [("W", "weekly"), ("M", "monthly")]:
        try:
            df = pro().pro_bar(ts_code=ts_code, freq=freq, adj="qfq",
                               start_date=d["D1Y"], end_date=d["TODAY"])
            df = df.sort_values("trade_date")
            df["ma20"] = df["close"].rolling(20).mean()
            last = df.iloc[-1]
            results[key] = {
                "close": round(float(last["close"]), 2),
                "ma20":  round(float(last["ma20"]), 2),
                "trend": "多头" if float(last["close"]) > float(last["ma20"]) else "空头",
                "pct_chg": round(float(last.get("pct_chg", 0)), 2),
            }
        except Exception as e:
            results[key] = {"error": str(e)}
    return results
