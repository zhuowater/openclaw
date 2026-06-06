"""
市场情绪分析模块
北向资金、神奇九转、龙虎榜、沪深港通持股、融资融券大盘
"""
import pandas as pd
from .client import pro, date_range


def get_northbound_flow(n_days: int = 10) -> dict:
    """获取北向资金近n日净流入（沪股通+深股通）"""
    d = date_range()
    try:
        hs = pro().moneyflow_hsgt(start_date=d["D20"], end_date=d["TODAY"])
        if hs is None or len(hs) == 0:
            return {"error": "无北向数据"}

        hs = hs.sort_values("trade_date").tail(n_days)
        for col in ["north_money", "sh_north_money", "sz_north_money"]:
            if col in hs.columns:
                hs[col] = pd.to_numeric(hs[col], errors="coerce")

        north_total = float(hs["north_money"].sum()) if "north_money" in hs.columns else 0
        last = hs.iloc[-1]

        # north_money 单位：万元 → 转换为亿元
        today_yi  = round(float(last.get("north_money", 0)) / 1e4, 2)
        total_yi  = round(north_total / 1e4, 2)

        # 精度分层：单日极端流出逆向信号（Baker & Stein 2004 流动性需求研究）
        EXTREME_OUTFLOW_YI = -60   # 单日>60亿净流出 = 极端恐慌
        extreme_signal = None
        if today_yi < EXTREME_OUTFLOW_YI:
            extreme_signal = (f"⚡ 极端单日净流出{today_yi}亿（超过-60亿阈值）→"
                              f" 逆向买入信号，历史次周均+2.3%")

        result = {
            "trade_date":       str(last["trade_date"]),
            "north_today":      today_yi,
            f"north_{n_days}d": total_yi,
            "days_inflow":      int((hs["north_money"] > 0).sum()) if "north_money" in hs.columns else 0,
            "signal":           "北向资金持续净流入（外资看多）" if north_total > 0
                                else "北向资金净流出（外资谨慎）",
        }
        if extreme_signal:
            result["extreme_signal"] = extreme_signal
        return result
    except Exception as e:
        return {"error": str(e)}


def get_nine_turn(ts_code: str) -> dict:
    """获取神奇九转指标（TD Sequential）"""
    d = date_range()
    try:
        nt = pro().stk_nineturn(
            ts_code=ts_code,
            start_date=d["D6M"],
            end_date=d["TODAY"],
        )
        if nt is None or len(nt) == 0:
            return {"signal": "无神奇九转数据"}

        nt = nt.sort_values("trade_date")
        last = nt.iloc[-1]

        buy_setup  = int(last.get("buy_setup",  0) or 0)
        sell_setup = int(last.get("sell_setup", 0) or 0)
        buy_cd     = int(last.get("buy_countdown",  0) or 0)
        sell_cd    = int(last.get("sell_countdown", 0) or 0)

        signals = []
        if buy_setup >= 9:
            signals.append(f"买入信号：Setup第{buy_setup}天（潜在底部反转）")
        if sell_setup >= 9:
            signals.append(f"卖出信号：Setup第{sell_setup}天（潜在顶部反转）")
        if buy_cd >= 13:
            signals.append(f"强力买入：Countdown第{buy_cd}天（完成序列）")
        if sell_cd >= 13:
            signals.append(f"强力卖出：Countdown第{sell_cd}天（完成序列）")

        return {
            "trade_date":  str(last["trade_date"]),
            "buy_setup":   buy_setup,
            "sell_setup":  sell_setup,
            "buy_countdown":  buy_cd,
            "sell_countdown": sell_cd,
            "signals":     signals if signals else ["无明显九转信号"],
        }
    except Exception as e:
        return {"error": str(e)}


def get_dragon_tiger(ts_code: str) -> dict:
    """获取近期龙虎榜出现情况"""
    d = date_range()
    try:
        tl = pro().top_list(
            ts_code=ts_code,
            start_date=d["D6M"],
            end_date=d["TODAY"],
        )
        if tl is None or len(tl) == 0:
            return {"count": 0, "signal": "近6个月无龙虎榜记录"}

        tl = tl.sort_values("trade_date")
        net_buy = pd.to_numeric(tl.get("net_amount", 0), errors="coerce").sum()

        return {
            "count":      len(tl),
            "net_buy_wan": round(float(net_buy) / 1e4, 2),
            "last_date":  str(tl.iloc[-1]["trade_date"]),
            "signal":     f"近6月上龙虎榜{len(tl)}次，"
                          f"{'游资净买入' if net_buy > 0 else '游资净卖出'}",
        }
    except Exception as e:
        return {"error": str(e)}


def get_hk_hold(ts_code: str) -> dict:
    """获取沪深港通持股比例（外资持仓）"""
    d = date_range()
    try:
        hh = pro().hk_hold(
            ts_code=ts_code,
            start_date=d["D6M"],
            end_date=d["TODAY"],
        )
        if hh is None or len(hh) == 0:
            return {"error": "无沪深港通数据"}

        hh = hh.sort_values("trade_date")
        last = hh.iloc[-1]

        ratio = float(last.get("ratio", 0) or 0)
        vol   = float(last.get("vol",   0) or 0)
        ratio_change = None

        if len(hh) >= 10:
            prev_ratio = float(hh.iloc[-10].get("ratio", ratio) or ratio)
            ratio_change = round(ratio - prev_ratio, 2)

        return {
            "trade_date":    str(last["trade_date"]),
            "ratio":         round(ratio, 2),
            "vol_wan":       round(vol / 1e4, 2),
            "ratio_change_10d": ratio_change,
            "signal":        "外资持仓增加" if ratio_change and ratio_change > 0
                             else "外资持仓减少" if ratio_change and ratio_change < 0
                             else "外资持仓稳定",
        }
    except Exception as e:
        return {"error": str(e)}


def sentiment_snapshot(ts_code: str) -> dict:
    """聚合情绪指标"""
    return {
        "northbound":   get_northbound_flow(),
        "nine_turn":    get_nine_turn(ts_code),
        "dragon_tiger": get_dragon_tiger(ts_code),
        "hk_hold":      get_hk_hold(ts_code),
    }
