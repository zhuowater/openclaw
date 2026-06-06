"""
市场微观结构分析模块
VWAP、资金流向、筹码分布、龙虎榜、融资融券、大宗交易、限售解禁
"""
import pandas as pd
import numpy as np
from .client import pro, date_range


# ── VWAP ──────────────────────────────────────────────────────────────────────

def get_vwap_from_daily(ts_code: str, n_days: int = 20) -> dict:
    """
    基于日线 amount/vol 估算 VWAP（近 n 日）
    真实日内 VWAP 需要分钟数据权限
    """
    d = date_range()
    try:
        df = pro().daily(
            ts_code=ts_code,
            start_date=d["D60"],
            end_date=d["TODAY"],
        )
        df = df.sort_values("trade_date").tail(n_days)
        df["vol_f"]    = pd.to_numeric(df["vol"], errors="coerce")
        df["amount_f"] = pd.to_numeric(df["amount"], errors="coerce")
        # amount单位：千元；vol单位：手(100股)
        # VWAP = (amount*1000元) / (vol*100股) = amount*10 / vol  元/股
        vwap = (df["amount_f"] * 10).sum() / df["vol_f"].sum()
        last_close = float(df.iloc[-1]["close"])
        return {
            "vwap":       round(vwap, 2),
            "last_close": last_close,
            "deviation":  round((last_close - vwap) / vwap * 100, 2),
            "signal":     "价格高于VWAP，机构均价上方" if last_close > vwap else "价格低于VWAP，机构均价下方",
        }
    except Exception as e:
        return {"error": str(e)}


# ── 个股资金流向 ────────────────────────────────────────────────────────────────

def get_moneyflow(ts_code: str) -> dict:
    """获取近10日个股资金流向（大单/超大单净流入）"""
    d = date_range()
    try:
        mf = pro().moneyflow(
            ts_code=ts_code,
            start_date=d["D20"],
            end_date=d["TODAY"],
        )
        if mf is None or len(mf) == 0:
            return {"error": "无数据"}

        mf = mf.sort_values("trade_date")
        for col in ["buy_elg_amount", "sell_elg_amount", "buy_lg_amount", "sell_lg_amount",
                    "buy_md_amount", "sell_md_amount", "buy_sm_amount", "sell_sm_amount"]:
            mf[col] = pd.to_numeric(mf.get(col, 0), errors="coerce").fillna(0)

        mf["net_xlg"] = mf["buy_elg_amount"] - mf["sell_elg_amount"]
        mf["net_lg"]  = mf["buy_lg_amount"]  - mf["sell_lg_amount"]
        mf["net_all"] = mf["net_xlg"] + mf["net_lg"]

        last  = mf.iloc[-1]
        total = mf["net_all"].sum()

        return {
            "trade_date":       str(last["trade_date"]),
            "net_xlg_today":    round(float(last["net_xlg"]) / 1e4, 2),   # 万元
            "net_lg_today":     round(float(last["net_lg"])  / 1e4, 2),
            "net_all_today":    round(float(last["net_all"]) / 1e4, 2),
            "net_all_10d":      round(float(total) / 1e4, 2),
            "days_inflow":      int((mf["net_all"] > 0).sum()),
            "signal":           "主力净流入" if total > 0 else "主力净流出",
        }
    except Exception as e:
        return {"error": str(e)}


# ── 筹码分布 ───────────────────────────────────────────────────────────────────

def get_chips(ts_code: str) -> dict:
    """获取筹码分布与胜率（cyq_perf）"""
    d = date_range()
    try:
        cp = pro().cyq_perf(
            ts_code=ts_code,
            start_date=d["D10"],
            end_date=d["TODAY"],
        )
        if cp is None or len(cp) == 0:
            return {"error": "无筹码数据"}

        cp = cp.sort_values("trade_date")
        last = cp.iloc[-1]

        cost_5pct  = float(last.get("cost_5pct",  0))
        cost_15pct = float(last.get("cost_15pct", 0))
        cost_50pct = float(last.get("cost_50pct", 0))  # 中位成本
        cost_85pct = float(last.get("cost_85pct", 0))
        cost_95pct = float(last.get("cost_95pct", 0))
        winner_rate = float(last.get("winner_rate", 0))

        close_price = float(last.get("close", 0))
        chip_signal = "价格高于多数筹码成本（解套轻松）" if close_price > cost_50pct \
                      else "套牢筹码较多（解套压力大）"

        return {
            "trade_date":   str(last["trade_date"]),
            "cost_5pct":    round(cost_5pct,  2),
            "cost_15pct":   round(cost_15pct, 2),
            "cost_50pct":   round(cost_50pct, 2),   # 中位成本
            "cost_85pct":   round(cost_85pct, 2),
            "cost_95pct":   round(cost_95pct, 2),
            "winner_rate":  round(winner_rate, 2),   # 胜率%
            "signal":       chip_signal,
        }
    except Exception as e:
        return {"error": str(e)}


# ── 股东人数与持仓 ──────────────────────────────────────────────────────────────

def get_holder_info(ts_code: str) -> dict:
    """获取股东人数变化与前十大股东"""
    d = date_range()
    result = {}

    # 股东人数
    try:
        hn = pro().stk_holdernumber(ts_code=ts_code, start_date=d["D1Y"], end_date=d["TODAY"])
        if hn is not None and len(hn) >= 2:
            hn = hn.sort_values("ann_date")
            latest = hn.iloc[-1]
            prev   = hn.iloc[-2]
            holder_cnt  = int(latest.get("holder_num", 0))
            holder_prev = int(prev.get("holder_num", 0))
            chg_pct = (holder_cnt - holder_prev) / holder_prev * 100 if holder_prev else 0
            result["holder_number"] = {
                "count":    holder_cnt,
                "prev":     holder_prev,
                "chg_pct":  round(chg_pct, 2),
                "signal":   "股东人数减少(筹码集中)" if chg_pct < 0 else "股东人数增加(筹码分散)",
            }
    except Exception as e:
        result["holder_number"] = {"error": str(e)}

    # 前十大股东
    try:
        top10 = pro().top10_holders(ts_code=ts_code, start_date=d["D6M"], end_date=d["TODAY"])
        if top10 is not None and len(top10) > 0:
            top10 = top10.sort_values("end_date").tail(20)
            result["top10_holders"] = top10[["end_date","holder_name","hold_ratio","holder_type"]].to_dict("records")
    except Exception as e:
        result["top10_holders"] = {"error": str(e)}

    return result


# ── 股东增减持 ─────────────────────────────────────────────────────────────────

def get_insider_trading(ts_code: str) -> dict:
    """获取大股东/高管增减持记录"""
    d = date_range()
    try:
        ht = pro().stk_holdertrade(
            ts_code=ts_code,
            start_date=d["D1Y"],
            end_date=d["TODAY"],
        )
        if ht is None or len(ht) == 0:
            return {"records": [], "summary": "近1年无增减持记录"}

        ht = ht.sort_values("ann_date")
        ht["change_vol"] = pd.to_numeric(ht.get("change_vol", 0), errors="coerce").fillna(0)

        buy_vol  = ht[ht["in_de"] == "IN"]["change_vol"].sum()
        sell_vol = ht[ht["in_de"] == "DE"]["change_vol"].sum()

        signal = "内部人净买入（看涨信号）" if buy_vol > sell_vol else \
                 "内部人净卖出（看跌信号）" if sell_vol > 0 else "无明显增减持"

        return {
            "records":    ht.tail(10).to_dict("records"),
            "buy_vol":    int(buy_vol),
            "sell_vol":   int(sell_vol),
            "net_vol":    int(buy_vol - sell_vol),
            "signal":     signal,
        }
    except Exception as e:
        return {"error": str(e)}


# ── 融资融券 ───────────────────────────────────────────────────────────────────

def get_margin(ts_code: str) -> dict:
    """获取融资融券余额及死亡三角检测"""
    d = date_range()
    try:
        mg = pro().margin_detail(
            ts_code=ts_code,
            start_date=d["D20"],
            end_date=d["TODAY"],
        )
        if mg is None or len(mg) == 0:
            return {"error": "无融资数据"}

        mg = mg.sort_values("trade_date")
        last = mg.iloc[-1]

        rzye  = float(last.get("rzye",  0))   # 融资余额（元）
        rqye  = float(last.get("rqye",  0))   # 融券余额（元）
        rzmre = float(last.get("rzmre", 0))   # 融资买入额（元）

        # 近10日趋势
        mg["rzye_f"] = pd.to_numeric(mg["rzye"], errors="coerce")
        trend = "上升" if mg["rzye_f"].iloc[-1] > mg["rzye_f"].iloc[0] else "下降"

        # 融资余额/流通市值比率（非线性风险分档）
        margin_ratio = None
        margin_risk  = None
        try:
            db = pro().daily_basic(ts_code=ts_code, start_date=d["D3"], end_date=d["TODAY"],
                                   fields="trade_date,circ_mv")
            if db is not None and len(db) > 0:
                circ_mv_wan = float(db.sort_values("trade_date").iloc[-1].get("circ_mv", 0) or 0)
                # rzye 单位：元；circ_mv 单位：万元 → 需统一
                if circ_mv_wan > 0:
                    margin_ratio = round(rzye / (circ_mv_wan * 1e4) * 100, 3)
                    if margin_ratio >= 2.5:
                        margin_risk = f"⚠️ 极度危险（{margin_ratio:.2f}%≥2.5%）：强制平仓风险，历史先兆（2015年股灾）"
                    elif margin_ratio >= 1.0:
                        margin_risk = f"高风险（{margin_ratio:.2f}%，1-2.5%区间）：追加保证金压力上升"
                    elif margin_ratio >= 0.5:
                        margin_risk = f"偏高（{margin_ratio:.2f}%，0.5-1%区间）：杠杆偏重，波动放大"
                    else:
                        margin_risk = f"正常（{margin_ratio:.2f}%<0.5%）：融资比例健康"
        except Exception:
            pass

        result = {
            "trade_date":   str(last["trade_date"]),
            "rzye_wan":     round(rzye / 1e4, 2),
            "rqye_wan":     round(rqye / 1e4, 2),
            "rzmre_wan":    round(rzmre / 1e4, 2),
            "10d_trend":    trend,
            "signal":       f"融资余额{trend}，杠杆{'加重' if trend == '上升' else '减轻'}",
        }
        if margin_ratio is not None:
            result["margin_to_float"] = margin_ratio
            result["margin_risk"]     = margin_risk
        return result
    except Exception as e:
        return {"error": str(e)}


# ── 大宗交易 ───────────────────────────────────────────────────────────────────

def get_block_trades(ts_code: str) -> dict:
    """获取近期大宗交易折溢价情况"""
    d = date_range()
    try:
        bt = pro().block_trade(
            ts_code=ts_code,
            start_date=d["D6M"],
            end_date=d["TODAY"],
        )
        if bt is None or len(bt) == 0:
            return {"records": [], "summary": "近6个月无大宗交易"}

        bt = bt.sort_values("trade_date")
        bt["premium"] = pd.to_numeric(bt.get("premium", 0), errors="coerce").fillna(0)

        avg_premium = float(bt["premium"].mean())
        total_amount = pd.to_numeric(bt.get("amount", 0), errors="coerce").sum()

        # 四档折溢价信号（Gemmill 2001 分销渠道研究）
        if avg_premium <= -7:
            bt_signal = f"⚠️ 强力出货信号：平均折价{avg_premium:.1f}%>7%，机构主动分发→6月预期收益负"
        elif avg_premium <= -3:
            bt_signal = f"注意：机构减持信号，平均折价{avg_premium:.1f}%（3-7%区间）"
        elif avg_premium < 0:
            bt_signal = f"正常折价{avg_premium:.1f}%（0-3%），信号不明确"
        else:
            bt_signal = f"大宗溢价{avg_premium:.1f}%（机构主动接盘，看涨信号）"

        return {
            "count":         len(bt),
            "avg_premium":   round(avg_premium, 2),
            "total_amount":  round(float(total_amount) / 1e4, 2),
            "records":       bt.tail(5).to_dict("records"),
            "signal":        bt_signal,
        }
    except Exception as e:
        return {"error": str(e)}


# ── 限售解禁 ───────────────────────────────────────────────────────────────────

def get_share_float(ts_code: str) -> dict:
    """获取未来解禁计划"""
    d = date_range()
    try:
        sf = pro().share_float(
            ts_code=ts_code,
            start_date=d["TODAY"],
            end_date=d["D1Y"],
        )
        if sf is None or len(sf) == 0:
            return {"records": [], "summary": "未来1年无重大解禁"}

        sf = sf.sort_values("float_date")
        sf["float_ratio"] = pd.to_numeric(sf.get("float_ratio", 0), errors="coerce")
        max_ratio = sf["float_ratio"].max()

        return {
            "count":      len(sf),
            "max_ratio":  round(float(max_ratio), 2),
            "records":    sf.head(5).to_dict("records"),
            "warning":    f"⚠️ 最大解禁比例{max_ratio:.1f}%，注意供给压力" if max_ratio > 5 else None,
        }
    except Exception as e:
        return {"error": str(e)}


# ── 一键微观快照 ─────────────────────────────────────────────────────────────────

def microstructure_snapshot(ts_code: str) -> dict:
    """聚合所有微观结构指标，返回单一结构化 dict"""
    return {
        "vwap":          get_vwap_from_daily(ts_code),
        "moneyflow":     get_moneyflow(ts_code),
        "chips":         get_chips(ts_code),
        "holders":       get_holder_info(ts_code),
        "insider":       get_insider_trading(ts_code),
        "margin":        get_margin(ts_code),
        "block_trades":  get_block_trades(ts_code),
        "share_float":   get_share_float(ts_code),
    }
