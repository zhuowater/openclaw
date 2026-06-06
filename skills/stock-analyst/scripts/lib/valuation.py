"""
估值分析模块
PE/PB/PS/换手率（daily_basic）+ 简单DCF + 行业中位数对比
"""
import pandas as pd
import numpy as np
from .client import pro, date_range


def get_daily_basic(ts_code: str) -> dict:
    """获取最新每日估值指标"""
    d = date_range()
    try:
        db = pro().daily_basic(
            ts_code=ts_code,
            start_date=d["D10"],
            end_date=d["TODAY"],
            fields="trade_date,pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,dv_ttm,"
                   "total_mv,circ_mv,turnover_rate,turnover_rate_f,free_share",
        )
        if db is None or len(db) == 0:
            return {"error": "无日度估值数据"}

        db = db.sort_values("trade_date")
        last = db.iloc[-1]

        def safe_float(val):
            try:
                v = float(val)
                return round(v, 2) if not np.isnan(v) else None
            except Exception:
                return None

        return {
            "trade_date":      str(last["trade_date"]),
            "pe_ttm":          safe_float(last.get("pe_ttm")),
            "pe":              safe_float(last.get("pe")),
            "pb":              safe_float(last.get("pb")),
            "ps_ttm":          safe_float(last.get("ps_ttm")),
            "dv_ttm":          safe_float(last.get("dv_ttm")),         # 股息率
            "total_mv_yi":     round(safe_float(last.get("total_mv")) / 1e4, 2) if last.get("total_mv") else None,
            "circ_mv_yi":      round(safe_float(last.get("circ_mv"))  / 1e4, 2) if last.get("circ_mv")  else None,
            "turnover_rate":   safe_float(last.get("turnover_rate")),
            "turnover_rate_f": safe_float(last.get("turnover_rate_f")), # 流通换手率
        }
    except Exception as e:
        return {"error": str(e)}


def get_valuation_history(ts_code: str) -> dict:
    """获取近3年估值历史分位"""
    d = date_range()
    try:
        db = pro().daily_basic(
            ts_code=ts_code,
            start_date=d["D3Y"],
            end_date=d["TODAY"],
            fields="trade_date,pe_ttm,pb,ps_ttm",
        )
        if db is None or len(db) < 30:
            return {"error": "历史估值数据不足"}

        db = db.sort_values("trade_date")
        result = {}
        for col in ["pe_ttm", "pb", "ps_ttm"]:
            series = pd.to_numeric(db[col], errors="coerce").dropna()
            if len(series) < 10:
                continue
            current = float(series.iloc[-1])
            percentile = float((series <= current).mean() * 100)
            result[col] = {
                "current":    round(current, 2),
                "min":        round(float(series.min()), 2),
                "max":        round(float(series.max()), 2),
                "median":     round(float(series.median()), 2),
                "percentile": round(percentile, 1),
                "label":      _val_label(percentile),
            }
        return result
    except Exception as e:
        return {"error": str(e)}


def _val_label(pct: float) -> str:
    if pct > 80: return "偏高估（历史高位）"
    if pct > 60: return "略偏高"
    if pct > 40: return "合理区间"
    if pct > 20: return "略偏低"
    return "偏低估（历史低位）"


def simple_dcf(revenue: float,
               growth_rates: list = None,
               terminal_growth: float = 0.03,
               wacc: float = 0.10,
               net_margin: float = 0.10,
               fcf_ratio: float = 0.80,
               shares: float = None,
               current_price: float = None) -> dict:
    """
    简化DCF估值（5年显式预测 + 永续增长）
    Args:
        revenue:        最新年度营收（元）
        growth_rates:   5年营收增速列表，默认[0.15,0.12,0.10,0.08,0.06]
        terminal_growth:永续增长率
        wacc:           加权平均资本成本
        net_margin:     净利率假设
        fcf_ratio:      FCF/净利润比率
        shares:         总股本（股），用于计算每股价值
        current_price:  当前股价，用于计算溢价/折价
    Returns:
        dict: fair_value / upside / scenario
    """
    if growth_rates is None:
        growth_rates = [0.15, 0.12, 0.10, 0.08, 0.06]

    results = {}
    scenarios = {
        "悲观": [g * 0.5 for g in growth_rates],
        "基准": growth_rates,
        "乐观": [min(g * 1.5, 0.40) for g in growth_rates],
    }

    for label, rates in scenarios.items():
        rev = revenue
        pv_fcf = 0
        for i, g in enumerate(rates):
            rev *= (1 + g)
            fcf = rev * net_margin * fcf_ratio
            pv_fcf += fcf / (1 + wacc) ** (i + 1)

        # 终值
        terminal_fcf = rev * net_margin * fcf_ratio * (1 + terminal_growth)
        terminal_val  = terminal_fcf / (wacc - terminal_growth)
        pv_terminal   = terminal_val / (1 + wacc) ** len(rates)
        enterprise_val = pv_fcf + pv_terminal

        if shares and shares > 0:
            per_share = enterprise_val / shares
            results[label] = {
                "enterprise_val_yi": round(enterprise_val / 1e8, 2),
                "per_share":         round(per_share, 2),
                "upside":            round((per_share / current_price - 1) * 100, 1) if current_price else None,
            }
        else:
            results[label] = {
                "enterprise_val_yi": round(enterprise_val / 1e8, 2),
            }

    return {
        "assumptions": {
            "wacc":           wacc,
            "terminal_growth": terminal_growth,
            "net_margin":     net_margin,
            "fcf_ratio":      fcf_ratio,
        },
        "scenarios": results,
    }


def get_peer_comparison(ts_code: str, peer_codes: list = None) -> list:
    """
    同行业估值对比
    自动从申万行业成分取同行，也可手动传入 peer_codes
    Returns: list of dicts {ts_code, name, pe_ttm, pb, ps_ttm, total_mv_yi}
    """
    d = date_range()
    codes_to_compare = list(peer_codes or [])

    # 自动查找同行：全量 stock_basic pandas 过滤同行业，取前12只
    if not codes_to_compare:
        try:
            info = pro().stock_basic(ts_code=ts_code, fields="ts_code,industry")
            if info is not None and len(info) > 0:
                industry = info.iloc[0]["industry"]
                all_stocks = pro().stock_basic(
                    list_status="L", fields="ts_code,name,industry",
                )
                if all_stocks is not None and len(all_stocks) > 0:
                    same = all_stocks[all_stocks["industry"] == industry]
                    codes_to_compare = [
                        c for c in same["ts_code"].tolist() if c != ts_code
                    ][:12]
        except Exception:
            pass

    if not codes_to_compare:
        return [{"error": "无同行数据"}]

    results = []
    for code in codes_to_compare:
        if code == ts_code:
            continue
        try:
            db = pro().daily_basic(ts_code=code, start_date=d["D3"], end_date=d["TODAY"],
                                   fields="ts_code,trade_date,pe_ttm,pb,ps_ttm,total_mv")
            info = pro().stock_basic(ts_code=code, fields="ts_code,name")
            if db is None or len(db) == 0:
                continue
            row  = db.sort_values("trade_date").iloc[-1]
            name = info["name"].iloc[0] if (info is not None and len(info) > 0) else code
            results.append({
                "ts_code":    code,
                "name":       name,
                "pe_ttm":     _safe(row.get("pe_ttm")),
                "pb":         _safe(row.get("pb")),
                "ps_ttm":     _safe(row.get("ps_ttm")),
                "total_mv_yi": round(float(row["total_mv"]) / 1e4, 1) if row.get("total_mv") else None,
            })
        except Exception:
            continue
    return results


def _safe(val):
    try:
        v = float(val)
        return round(v, 2) if not np.isnan(v) else None
    except Exception:
        return None


def valuation_snapshot(ts_code: str,
                       revenue: float = None,
                       shares: float = None,
                       current_price: float = None,
                       net_margin: float = 0.10) -> dict:
    """
    一键估值快照
    自动获取每日指标 + 历史分位，可选传入财务数据做DCF
    """
    snap = {
        "daily_basic":  get_daily_basic(ts_code),
        "history":      get_valuation_history(ts_code),
    }

    if revenue and shares and current_price:
        snap["dcf"] = simple_dcf(
            revenue=revenue,
            shares=shares,
            current_price=current_price,
            net_margin=net_margin,
        )

    return snap
