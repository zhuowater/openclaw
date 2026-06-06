"""
期权隐含波动率模块
Black-Scholes定价 + brentq求解IV + ATM IV + Put-Call Skew
支持个股期权（如50ETF期权）和科创50ETF期权作为代理
"""
import numpy as np
from scipy.stats import norm
from scipy.optimize import brentq
import pandas as pd
from .client import pro, date_range


# ── Black-Scholes 定价 ─────────────────────────────────────────────────────────

def bs_price(S: float, K: float, T: float, r: float, sigma: float,
             option_type: str = "C") -> float:
    """
    Black-Scholes 期权定价
    Args:
        S:           标的现价
        K:           行权价
        T:           到期时间（年）
        r:           无风险利率（小数）
        sigma:       波动率（小数）
        option_type: 'C'=看涨, 'P'=看跌
    Returns:
        float: 期权理论价格
    """
    if T <= 0 or sigma <= 0:
        return max(S - K, 0) if option_type == "C" else max(K - S, 0)
    d1 = (np.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    if option_type == "C":
        return S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
    else:
        return K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)


def implied_vol(market_price: float, S: float, K: float, T: float,
                r: float = 0.02, option_type: str = "C",
                tol: float = 1e-6) -> float:
    """
    用 brentq 数值求解隐含波动率
    Returns:
        float: IV（小数），失败返回 nan
    """
    def objective(sigma):
        return bs_price(S, K, T, r, sigma, option_type) - market_price

    intrinsic = max(S - K, 0) if option_type == "C" else max(K - S, 0)
    if market_price <= intrinsic + 1e-6:
        return float("nan")

    try:
        iv = brentq(objective, 1e-6, 10.0, xtol=tol, maxiter=500)
        return iv
    except Exception:
        return float("nan")


# ── 获取期权链并计算IV ──────────────────────────────────────────────────────────

def _get_etf_price(etf_code: str) -> float:
    """获取ETF最新收盘价"""
    d = date_range()
    try:
        df = pro().fund_daily(ts_code=etf_code, start_date=d["D3"], end_date=d["TODAY"])
        df = df.sort_values("trade_date")
        return float(df.iloc[-1]["close"])
    except Exception:
        return float("nan")


def get_iv_surface(option_ts_root: str,
                   etf_code: str,
                   exchange: str = "SSE",
                   r: float = 0.02) -> dict:
    """
    获取ATM IV和Put-Call Skew
    Args:
        option_ts_root: 期权标的代码 (如 '510050.SH' 或 '588000.SH')
        etf_code:       对应ETF价格代码
        exchange:       交易所 SSE/SZSE
        r:              无风险利率
    Returns:
        dict: atm_call_iv / atm_put_iv / put_call_skew / avg_iv
    """
    d = date_range()

    # 获取ETF现价
    S = _get_etf_price(etf_code)
    if np.isnan(S):
        return {"error": "ETF价格获取失败"}

    # 获取期权合约列表（近月）
    try:
        opt_list = pro().opt_basic(
            underlying_symbol=option_ts_root,
            exchange=exchange,
            fields="ts_code,name,exercise_price,call_put,maturity_date,list_date",
        )
        if opt_list is None or len(opt_list) == 0:
            return {"error": "未找到期权合约"}
    except Exception as e:
        return {"error": f"opt_basic失败: {e}"}

    # 筛选近月合约（到期日最近的）
    opt_list["maturity_date"] = pd.to_datetime(opt_list["maturity_date"])
    opt_list = opt_list[opt_list["maturity_date"] > pd.Timestamp.today()]
    opt_list = opt_list.sort_values("maturity_date")

    if len(opt_list) == 0:
        return {"error": "无有效期权合约"}

    near_maturity = opt_list.iloc[0]["maturity_date"]
    near_opts = opt_list[opt_list["maturity_date"] == near_maturity].copy()
    near_opts["exercise_price"] = pd.to_numeric(near_opts["exercise_price"], errors="coerce")

    # 到期时间（年）
    T = (near_maturity - pd.Timestamp.today()).days / 365.0
    if T <= 0:
        return {"error": "期权已到期"}

    # 获取近月期权最新日线价格（逐一查询，批量接口不稳定）
    try:
        codes = near_opts["ts_code"].tolist()
        rows = []
        for code in codes[:30]:   # 取ATM附近30个合约
            try:
                tmp = pro().opt_daily(
                    ts_code=code,
                    start_date=d["D3"],
                    end_date=d["TODAY"],
                    fields="ts_code,trade_date,close,settle",
                )
                if tmp is not None and len(tmp) > 0:
                    rows.append(tmp.sort_values("trade_date").iloc[-1])
            except Exception:
                continue
        if not rows:
            return {"error": "期权行情为空"}
        opt_daily = pd.DataFrame(rows)
    except Exception as e:
        return {"error": f"opt_daily失败: {e}"}

    # 合并
    merged = near_opts.merge(opt_daily[["ts_code","close"]], on="ts_code", how="inner")
    merged["close"] = pd.to_numeric(merged["close"], errors="coerce")
    merged = merged.dropna(subset=["close", "exercise_price"])

    if len(merged) == 0:
        return {"error": "无有效期权价格"}

    # ATM = 距离现价最近的行权价
    merged["dist"] = (merged["exercise_price"] - S).abs()
    atm_strike = merged.loc[merged["dist"].idxmin(), "exercise_price"]

    results = {}
    for cp_type, bs_type in [("C", "C"), ("P", "P")]:
        subset = merged[(merged["call_put"] == cp_type) & (merged["exercise_price"] == atm_strike)]
        if len(subset) == 0:
            continue
        price = float(subset.iloc[0]["close"])
        iv = implied_vol(price, S, atm_strike, T, r, bs_type)
        results[f"atm_{cp_type.lower()}_iv"] = round(iv * 100, 2) if not np.isnan(iv) else None

    # OTM看跌 vs OTM看涨 Skew
    otm_put_strike  = merged[merged["exercise_price"] < S * 0.95]["exercise_price"]
    otm_call_strike = merged[merged["exercise_price"] > S * 1.05]["exercise_price"]

    def get_otm_iv(strikes, cp_type, bs_type, nearest_to):
        if len(strikes) == 0:
            return None
        target = strikes.iloc[(strikes - nearest_to).abs().argsort().iloc[0]]
        sub = merged[(merged["call_put"] == cp_type) & (merged["exercise_price"] == target)]
        if len(sub) == 0:
            return None
        iv = implied_vol(float(sub.iloc[0]["close"]), S, target, T, r, bs_type)
        return round(iv * 100, 2) if not np.isnan(iv) else None

    otm_put_iv  = get_otm_iv(otm_put_strike,  "P", "P", S * 0.95)
    otm_call_iv = get_otm_iv(otm_call_strike, "C", "C", S * 1.05)

    # Skew = OTM Put IV - OTM Call IV（正值=市场担忧下行）
    skew = round(otm_put_iv - otm_call_iv, 2) \
           if otm_put_iv is not None and otm_call_iv is not None else None

    atm_c = results.get("atm_c_iv")
    atm_p = results.get("atm_p_iv")
    avg_iv = round((atm_c + atm_p) / 2, 2) if atm_c and atm_p else (atm_c or atm_p)

    return {
        "etf_price":      round(S, 3),
        "atm_strike":     atm_strike,
        "T_years":        round(T, 4),
        "maturity_date":  str(near_maturity.date()),
        "atm_call_iv":    atm_c,
        "atm_put_iv":     atm_p,
        "avg_iv":         avg_iv,
        "otm_put_iv":     otm_put_iv,
        "otm_call_iv":    otm_call_iv,
        "put_call_skew":  skew,
        "skew_signal":    _skew_signal(skew),
    }


def _skew_signal(skew) -> str:
    if skew is None:
        return "数据不足"
    if skew > 3:
        return f"Skew={skew:.1f}% 高，市场明显担忧下行风险"
    if skew > 1:
        return f"Skew={skew:.1f}% 正常，略偏下行保护"
    if skew < -1:
        return f"Skew={skew:.1f}% 负，市场乐观情绪偏高"
    return f"Skew={skew:.1f}% 中性"


# ── 科创板代理IV（用于688xxx股票）─────────────────────────────────────────────────

def get_star_proxy_iv() -> dict:
    """
    使用科创50ETF期权(588000.SH)作为科创板股票波动率代理
    """
    return get_iv_surface(
        option_ts_root="588000.SH",
        etf_code="588000.SH",
        exchange="SSE",
    )


def get_gem_proxy_iv() -> dict:
    """使用创业板ETF期权(159915.SZ)作为创业板波动率代理"""
    return get_iv_surface(
        option_ts_root="159915.SZ",
        etf_code="159915.SZ",
        exchange="SZSE",
    )
