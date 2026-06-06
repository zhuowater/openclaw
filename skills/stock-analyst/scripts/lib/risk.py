"""
量化风险分析模块
HV多周期、Beta、Sharpe/Sortino、MDD、VaR、Kelly仓位、Amihud流动性
"""
import numpy as np
import pandas as pd
from .client import pro, date_range


def calc_risk_metrics(ts_code: str,
                      benchmark: str = "000300.SH") -> dict:
    """
    计算全套量化风险指标
    Args:
        ts_code:   股票代码
        benchmark: 基准指数（默认沪深300）
    Returns:
        dict: hv / beta / sharpe / sortino / mdd / var / amihud / kelly
    """
    d = date_range()

    # ── 获取股票日线 ────────────────────────────────────────────────────
    df = pro().daily(ts_code=ts_code, start_date=d["D3Y"], end_date=d["TODAY"])
    df = df.sort_values("trade_date").reset_index(drop=True)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["vol"]    = pd.to_numeric(df["vol"],    errors="coerce")

    ret = df["close"].pct_change().dropna()

    # ── HV多周期 ─────────────────────────────────────────────────────────
    hv = {}
    for w in [5, 20, 60]:
        hv[f"hv{w}"] = round(float(ret.tail(w).std() * np.sqrt(252) * 100), 1)
    hv["hv1y"] = round(float(ret.tail(252).std() * np.sqrt(252) * 100), 1)

    # ── Beta ─────────────────────────────────────────────────────────────
    try:
        bm = pro().index_daily(ts_code=benchmark, start_date=d["D1Y"], end_date=d["TODAY"])
        bm = bm.sort_values("trade_date").set_index("trade_date")
        bm_ret = bm["close"].pct_change().dropna()

        # 用 trade_date 对齐（避免 positional index 错位）
        stk_1y = df.tail(252).set_index("trade_date")
        ret_1y = stk_1y["close"].pct_change().dropna()
        common_dates = ret_1y.index.intersection(bm_ret.index)
        if len(common_dates) > 30:
            r = ret_1y.loc[common_dates].values
            b = bm_ret.loc[common_dates].values
            cov = np.cov(r, b)[0, 1]
            var_bm = np.var(b, ddof=1)
            beta = round(cov / var_bm, 2) if var_bm != 0 else 1.0
        else:
            beta = 1.0
    except Exception:
        beta = None

    # ── Sharpe / Sortino ─────────────────────────────────────────────────
    ret_1y = ret.tail(252)
    rf_daily = 0.02 / 252   # 年化2%无风险利率

    excess = ret_1y - rf_daily
    sharpe = round(float(excess.mean() / excess.std() * np.sqrt(252)), 2) \
             if excess.std() > 0 else 0.0

    downside = excess[excess < 0]
    sortino = round(float(excess.mean() / downside.std() * np.sqrt(252)), 2) \
              if len(downside) > 5 and downside.std() > 0 else 0.0

    # ── MDD ─────────────────────────────────────────────────────────────
    close = df["close"]
    cummax = close.cummax()
    drawdown = (close - cummax) / cummax
    mdd = round(float(drawdown.min() * 100), 2)

    # ── VaR (历史法, 95% 10日) ────────────────────────────────────────────
    var_1d = float(np.percentile(ret.tail(252), 5))
    var_10d = round(var_1d * np.sqrt(10) * 100, 2)

    # ── Amihud 非流动性指标 ───────────────────────────────────────────────
    try:
        df["ret_abs"]  = df["close"].pct_change().abs()
        df["amount_m"] = df["amount"] / 1e3   # 千元→百万元（amount原始单位：千元）
        df_valid = df.dropna(subset=["ret_abs", "amount_m"])
        df_valid = df_valid[df_valid["amount_m"] > 0].tail(60)
        amihud = round(float((df_valid["ret_abs"] / df_valid["amount_m"]).mean()) * 1e4, 4)
    except Exception:
        amihud = None

    # ── 胜率统计（用于Kelly） ─────────────────────────────────────────────
    wins  = ret[ret > 0]
    loses = ret[ret < 0]
    win_prob = round(len(wins) / len(ret), 4) if len(ret) > 0 else 0.5
    win_ret  = float(wins.mean())  if len(wins)  > 0 else 0.01
    loss_ret = float(loses.abs().mean()) if len(loses) > 0 else 0.01

    kelly_f, kelly_half = kelly(win_prob, win_ret, loss_ret)

    return {
        **hv,
        "beta":        beta,
        "sharpe":      sharpe,
        "sortino":     sortino,
        "mdd":         mdd,
        "var_10d_95":  var_10d,
        "amihud":      amihud,
        "win_prob":    round(win_prob * 100, 2),
        "win_ret":     round(win_ret  * 100, 2),
        "loss_ret":    round(loss_ret * 100, 2),
        "kelly_f":     round(kelly_f  * 100, 1),
        "kelly_half":  round(kelly_half * 100, 1),
        "kelly_signal": kelly_signal(kelly_f),
    }


def kelly(win_prob: float, win_ret: float, loss_ret: float) -> tuple:
    """
    Kelly 公式: k = (b*p - q) / b
    b = win_ret/loss_ret
    Returns: (full_kelly, half_kelly) 均为小数形式
    """
    if loss_ret == 0:
        return 0.0, 0.0
    b = win_ret / loss_ret
    q = 1 - win_prob
    k = (b * win_prob - q) / b
    k = max(k, 0.0)   # 负值截断为0，数学上代表"不参与"
    return k, k / 2


def kelly_signal(kelly_f: float) -> str:
    """将Kelly系数转化为可读信号"""
    if kelly_f <= 0:
        return "Kelly=0%：数学上不建议持有，期望收益为负"
    if kelly_f < 0.1:
        return f"Kelly={kelly_f*100:.1f}%：小仓试探，谨慎参与"
    if kelly_f < 0.25:
        return f"Kelly={kelly_f*100:.1f}%：中等仓位，推荐半Kelly仓位"
    return f"Kelly={kelly_f*100:.1f}%：高信心机会，仍建议使用半Kelly"


def stress_test(ts_code: str) -> dict:
    """
    历史情景压力测试
    模拟A股三次典型危机期间该股表现
    """
    d = date_range()
    scenarios = {
        "2015股灾(06-09)":  ("20150601", "20150930"),
        "2018贸易战(01-12)": ("20180101", "20181231"),
        "2020疫情(01-03)":  ("20200101", "20200331"),
    }
    result = {}
    try:
        df = pro().daily(ts_code=ts_code, start_date="20150101", end_date=d["TODAY"])
        df = df.sort_values("trade_date")

        for name, (start, end) in scenarios.items():
            sub = df[(df["trade_date"] >= start) & (df["trade_date"] <= end)]
            if len(sub) >= 5:
                ret = (float(sub.iloc[-1]["close"]) - float(sub.iloc[0]["close"])) / float(sub.iloc[0]["close"])
                result[name] = round(ret * 100, 2)
            else:
                result[name] = None
    except Exception as e:
        return {"error": str(e)}

    return result
