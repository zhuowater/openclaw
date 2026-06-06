"""
基本面数据模块
获取财务报表、财务指标、业绩预告/快报、券商评级预测
"""
import pandas as pd
from .client import pro, date_range


def get_company_info(ts_code: str) -> dict:
    """获取公司基本信息：主营业务、行业、上市日期、管理层"""
    try:
        basic = pro().stock_basic(ts_code=ts_code,
                                  fields="ts_code,name,industry,market,list_date,area")
        company = pro().stock_company(ts_code=ts_code,
                                      fields="ts_code,chairman,manager,main_business,introduction")
        result = {}
        if basic is not None and len(basic) > 0:
            r = basic.iloc[0]
            result.update({
                "name":       r.get("name"),
                "industry":   r.get("industry"),
                "market":     r.get("market"),
                "list_date":  r.get("list_date"),
                "area":       r.get("area"),
            })
        if company is not None and len(company) > 0:
            c = company.iloc[0]
            result.update({
                "chairman":     c.get("chairman"),
                "manager":      c.get("manager"),
                "main_business": str(c.get("main_business", ""))[:200],
            })
        return result
    except Exception as e:
        return {"error": str(e)}


def get_annual_trend(ts_code: str) -> list:
    """
    获取近5年年报+半年报利润/毛利率/ROE趋势
    Returns: list of dicts sorted by end_date
    """
    d = date_range()
    try:
        inc = pro().income(
            ts_code=ts_code, start_date=d["D5Y"], end_date=d["TODAY"],
            fields="end_date,revenue,n_income_attr_p,basic_eps",
        )
        fi = pro().fina_indicator(
            ts_code=ts_code, start_date=d["D5Y"], end_date=d["TODAY"],
            fields="end_date,roe,grossprofit_margin,netprofit_margin,debt_to_assets,revenue_yoy,netprofit_yoy",
        )
        inc = inc.sort_values("end_date").drop_duplicates("end_date", keep="last")
        fi  = fi.sort_values("end_date").drop_duplicates("end_date", keep="last")

        # 只保留年报(1231)和半年报(0630)
        inc = inc[inc["end_date"].str.endswith(("1231", "0630"))]
        fi  = fi[fi["end_date"].str.endswith(("1231", "0630"))]

        merged = inc.merge(fi, on="end_date", how="outer").sort_values("end_date")
        return merged.tail(10).to_dict("records")
    except Exception as e:
        return [{"error": str(e)}]


def get_financials(ts_code: str) -> dict:
    """
    获取核心财务数据
    Returns:
        dict: income / balance / cashflow / indicators (最近4季)
    """
    d = date_range()
    result = {}

    # ── 利润表 ────────────────────────────────────────────────────────
    try:
        inc = pro().income(
            ts_code=ts_code,
            start_date=d["D3Y"],
            end_date=d["TODAY"],
            fields="end_date,total_revenue,revenue,operate_profit,n_income,n_income_attr_p,"
                   "ebit,ebitda,basic_eps,diluted_eps",
        )
        inc = inc.sort_values("end_date").drop_duplicates("end_date", keep="last")
        result["income"] = inc.tail(8).to_dict("records")
    except Exception as e:
        result["income"] = {"error": str(e)}

    # ── 资产负债表 ─────────────────────────────────────────────────────
    try:
        bal = pro().balancesheet(
            ts_code=ts_code,
            start_date=d["D3Y"],
            end_date=d["TODAY"],
            fields="end_date,total_assets,total_liab,total_hldr_eqy_exc_min_int,"
                   "accounts_receiv,inventories,money_cap,lt_borr,st_borr",
        )
        bal = bal.sort_values("end_date").drop_duplicates("end_date", keep="last")
        result["balance"] = bal.tail(8).to_dict("records")
    except Exception as e:
        result["balance"] = {"error": str(e)}

    # ── 现金流量表 ─────────────────────────────────────────────────────
    try:
        cf = pro().cashflow(
            ts_code=ts_code,
            start_date=d["D3Y"],
            end_date=d["TODAY"],
            fields="end_date,n_cashflow_act,n_cashflow_inv_act,n_cash_flows_fnc_act,"
                   "free_cashflow,c_pay_acq_const_fiolta,stot_cash_in_oper",
        )
        cf = cf.sort_values("end_date").drop_duplicates("end_date", keep="last")
        result["cashflow"] = cf.tail(8).to_dict("records")
    except Exception as e:
        result["cashflow"] = {"error": str(e)}

    # ── 财务指标 ────────────────────────────────────────────────────────
    try:
        fi = pro().fina_indicator(
            ts_code=ts_code,
            start_date=d["D3Y"],
            end_date=d["TODAY"],
            fields="end_date,roe,roe_waa,roa,grossprofit_margin,netprofit_margin,"
                   "debt_to_assets,current_ratio,quick_ratio,inv_turn,ar_turn,"
                   "revenue_yoy,netprofit_yoy,fcff,fcfe",
        )
        fi = fi.sort_values("end_date").drop_duplicates("end_date", keep="last")
        result["indicators"] = fi.tail(8).to_dict("records")
    except Exception as e:
        result["indicators"] = {"error": str(e)}

    return result


def get_forecast_express(ts_code: str) -> dict:
    """获取最新业绩预告和业绩快报"""
    d = date_range()
    result = {}

    # ── 业绩预告 ────────────────────────────────────────────────────────
    try:
        fc = pro().forecast(
            ts_code=ts_code,
            start_date=d["D1Y"],
            end_date=d["TODAY"],
        )
        if fc is not None and len(fc) > 0:
            fc = fc.sort_values("ann_date").iloc[-1]
            result["forecast"] = {
                "period":     fc.get("end_date", ""),
                "type":       fc.get("type", ""),
                "p_change_min": fc.get("p_change_min", None),
                "p_change_max": fc.get("p_change_max", None),
                "net_profit_min": fc.get("net_profit_min", None),
                "net_profit_max": fc.get("net_profit_max", None),
                "summary":    fc.get("summary", ""),
            }
        else:
            result["forecast"] = None
    except Exception as e:
        result["forecast"] = {"error": str(e)}

    # ── 业绩快报 ────────────────────────────────────────────────────────
    try:
        ex = pro().express(
            ts_code=ts_code,
            start_date=d["D1Y"],
            end_date=d["TODAY"],
        )
        if ex is not None and len(ex) > 0:
            ex = ex.sort_values("ann_date").iloc[-1]
            result["express"] = {
                "period":      ex.get("end_date", ""),
                "revenue":     ex.get("revenue", None),
                "operate_profit": ex.get("operate_profit", None),
                "total_profit":   ex.get("total_profit", None),
                "n_income":    ex.get("n_income", None),
                "total_assets": ex.get("total_assets", None),
                "revenue_yoy": ex.get("yoy_sales", None),
                "profit_yoy":  ex.get("yoy_profit", None),
            }
        else:
            result["express"] = None
    except Exception as e:
        result["express"] = {"error": str(e)}

    return result


def get_broker_ratings(ts_code: str) -> dict:
    """获取最近3个月券商盈利预测评级"""
    d = date_range()
    try:
        rc = pro().report_rc(
            ts_code=ts_code,
            start_date=d["D6M"],
            end_date=d["TODAY"],
            fields="report_date,analyst_name,org_name,rating,eps1,eps2,tp,last_tp",
        )
        if rc is None or len(rc) == 0:
            return {"ratings": [], "consensus": None}

        rc = rc.sort_values("report_date")

        # 评级分布统计
        rating_map = {"买入": 5, "增持": 4, "中性": 3, "减持": 2, "卖出": 1}
        rc["rating_score"] = rc["rating"].map(rating_map)
        consensus_score = rc["rating_score"].mean()

        # 目标价（过滤无效负值和零值）
        tp_vals = pd.to_numeric(rc["tp"], errors="coerce")
        tp_vals = tp_vals[tp_vals > 0].dropna()

        consensus = {
            "avg_score":  round(float(consensus_score), 2),
            "count":      len(rc),
            "tp_mean":    round(float(tp_vals.mean()), 2) if len(tp_vals) > 0 else None,
            "tp_std":     round(float(tp_vals.std()), 2)  if len(tp_vals) > 1 else None,
            "label":      _score_to_label(consensus_score),
        }

        return {
            "ratings":   rc.tail(10).to_dict("records"),
            "consensus": consensus,
        }
    except Exception as e:
        return {"error": str(e)}


def _score_to_label(score: float) -> str:
    if score >= 4.5: return "强烈买入"
    if score >= 3.5: return "买入/增持"
    if score >= 2.5: return "中性"
    if score >= 1.5: return "减持"
    return "卖出"


def accrual_ratio(ts_code: str) -> dict:
    """
    Sloan应计比率 = (归母净利润 - 经营现金流) / 平均总资产
    来源：Sloan (1996)；>10%预测未来12个月跑输8-10%
    只取年报数据（12月31日）
    """
    d = date_range()
    try:
        inc = pro().income(
            ts_code=ts_code, start_date=d["D5Y"], end_date=d["TODAY"],
            fields="end_date,n_income_attr_p",
        )
        cf = pro().cashflow(
            ts_code=ts_code, start_date=d["D5Y"], end_date=d["TODAY"],
            fields="end_date,n_cashflow_act",
        )
        bal = pro().balancesheet(
            ts_code=ts_code, start_date=d["D5Y"], end_date=d["TODAY"],
            fields="end_date,total_assets",
        )

        # 只保留年报
        for df_ in [inc, cf, bal]:
            if df_ is None or len(df_) == 0:
                return {"error": "财务数据缺失"}

        inc = inc[inc["end_date"].str.endswith("1231")].sort_values("end_date").drop_duplicates("end_date", keep="last")
        cf  = cf[cf["end_date"].str.endswith("1231")].sort_values("end_date").drop_duplicates("end_date", keep="last")
        bal = bal[bal["end_date"].str.endswith("1231")].sort_values("end_date").drop_duplicates("end_date", keep="last")

        if len(inc) < 1 or len(cf) < 1 or len(bal) < 2:
            return {"error": "年报数据不足（至少需要2年）"}

        period = inc.iloc[-1]["end_date"]
        cf_row = cf[cf["end_date"] == period]
        bal_curr = bal[bal["end_date"] == period]
        bal_prev = bal[bal["end_date"] < period]

        if len(cf_row) == 0 or len(bal_curr) == 0 or len(bal_prev) == 0:
            return {"error": "期间数据不匹配"}

        net_income  = float(inc.iloc[-1].get("n_income_attr_p", 0) or 0)
        op_cashflow = float(cf_row.iloc[0].get("n_cashflow_act",  0) or 0)
        ta_curr = float(bal_curr.iloc[0].get("total_assets", 0) or 0)
        ta_prev = float(bal_prev.iloc[-1].get("total_assets", 0) or 0)
        avg_ta  = (ta_curr + ta_prev) / 2

        if avg_ta <= 0:
            return {"error": "总资产数据无效"}

        ratio = (net_income - op_cashflow) / avg_ta * 100  # 百分比

        if ratio > 10:
            signal = "⚠️ 危险（>10%）：盈利质量差，Sloan因子负向→预测跑输市场8-10%"
        elif ratio > 5:
            signal = "注意（5-10%）：净利润显著高于现金流，盈利质量偏低"
        elif ratio > 0:
            signal = "正常（0-5%）：盈利质量可接受"
        else:
            signal = "优秀（<0%）：现金流超过净利润，高质量盈利"

        return {
            "period":        period,
            "net_income_yi": round(net_income / 1e8, 2),
            "op_cf_yi":      round(op_cashflow / 1e8, 2),
            "avg_assets_yi": round(avg_ta / 1e8, 2),
            "accrual_ratio": round(ratio, 2),
            "signal":        signal,
        }
    except Exception as e:
        return {"error": str(e)}


def fund_crowding(ts_code: str) -> dict:
    """
    机构持仓拥挤度（基于前十大流通股东）
    识别基金/社保/保险等机构持仓合计占比
    >30%: 机构拥挤→历史上未来6个月超额收益转负
    """
    d = date_range()
    try:
        top10 = pro().top10_floatholders(
            ts_code=ts_code,
            start_date=d["D6M"],
            end_date=d["TODAY"],
        )
        if top10 is None or len(top10) == 0:
            return {"error": "无前十大流通股东数据"}

        top10 = top10.sort_values("end_date")
        last_period = top10["end_date"].iloc[-1]
        latest = top10[top10["end_date"] == last_period].copy()

        # 识别机构类股东（公募基金/社保/QFII/保险等）
        fund_kw = ["基金", "社保", "QFII", "养老", "保险", "证券", "汇丰", "摩根",
                   "富达", "贝莱德", "先锋", "瑞银", "高盛"]
        is_inst = latest["holder_name"].str.contains("|".join(fund_kw), na=False)
        inst_holders = latest[is_inst]

        top10_total = pd.to_numeric(latest["hold_ratio"], errors="coerce").fillna(0).sum()
        inst_ratio  = pd.to_numeric(inst_holders["hold_ratio"], errors="coerce").fillna(0).sum()

        if inst_ratio > 30:
            signal = f"⚠️ 机构高度拥挤（{inst_ratio:.1f}%>30%阈值）→ 踩踏风险，6月超额收益历史转负"
        elif inst_ratio > 20:
            signal = f"注意：机构集中持有（{inst_ratio:.1f}%），存在估值支撑但流动性风险上升"
        elif inst_ratio > 0:
            signal = f"机构持仓适中（{inst_ratio:.1f}%），正常水平"
        else:
            signal = "前十大流通股东无明显机构特征，散户主导或机构尚未进驻"

        return {
            "period":           last_period,
            "top10_total_pct":  round(float(top10_total), 2),
            "inst_pct":         round(float(inst_ratio), 2),
            "inst_count":       int(is_inst.sum()),
            "signal":           signal,
            "note":             "仅前十大流通股东估算，实际机构持仓通常更高",
        }
    except Exception as e:
        return {"error": str(e)}


def fundamentals_snapshot(ts_code: str) -> dict:
    """
    一键获取基本面快照，返回结构化摘要
    包含：最新营收/净利/ROE/负债率/毛利率/应收增速/自由现金流
    """
    fin  = get_financials(ts_code)
    fe   = get_forecast_express(ts_code)
    br   = get_broker_ratings(ts_code)

    snap = {}

    # ── 最新财务指标 ────────────────────────────────────────────────────
    inds = fin.get("indicators", [])
    if isinstance(inds, list) and inds:
        latest = inds[-1]
        snap["roe"]               = latest.get("roe")
        snap["roa"]               = latest.get("roa")
        snap["gross_margin"]      = latest.get("grossprofit_margin")
        snap["net_margin"]        = latest.get("netprofit_margin")
        snap["debt_ratio"]        = latest.get("debt_to_assets")
        snap["current_ratio"]     = latest.get("current_ratio")
        snap["revenue_yoy"]       = latest.get("revenue_yoy")
        snap["netprofit_yoy"]     = latest.get("netprofit_yoy")
        snap["ar_turn"]           = latest.get("ar_turn")
        snap["period"]            = latest.get("end_date")

    # ── 最新利润表 ──────────────────────────────────────────────────────
    incomes = fin.get("income", [])
    if isinstance(incomes, list) and incomes:
        li = incomes[-1]
        snap["revenue"]           = li.get("revenue")
        snap["net_income"]        = li.get("n_income_attr_p")
        snap["eps"]               = li.get("basic_eps")

    # ── 现金流 ──────────────────────────────────────────────────────────
    cfs = fin.get("cashflow", [])
    if isinstance(cfs, list) and cfs:
        lc = cfs[-1]
        snap["op_cashflow"]       = lc.get("n_cashflow_act")
        snap["free_cashflow"]     = lc.get("free_cashflow")

    # ── 资产负债 ────────────────────────────────────────────────────────
    bals = fin.get("balance", [])
    if isinstance(bals, list) and bals:
        lb = bals[-1]
        snap["total_assets"]      = lb.get("total_assets")
        snap["accounts_receiv"]   = lb.get("accounts_receiv")
        snap["equity"]            = lb.get("total_hldr_eqy_exc_min_int")

    # ── 业绩预告/快报 ────────────────────────────────────────────────────
    snap["forecast"]              = fe.get("forecast")
    snap["express"]               = fe.get("express")

    # ── 券商共识 ────────────────────────────────────────────────────────
    snap["broker_consensus"]      = br.get("consensus")

    # ── 应收账款异常检测 ─────────────────────────────────────────────────
    if snap.get("accounts_receiv") and snap.get("revenue") and snap["revenue"]:
        try:
            ar_ratio = float(snap["accounts_receiv"]) / abs(float(snap["revenue"]))
            snap["ar_revenue_ratio"] = round(ar_ratio, 2)
            if ar_ratio > 1.0:
                snap["ar_warning"] = f"⚠️ 应收账款{ar_ratio:.1%}超过年收入，财务质量存疑"
            elif ar_ratio > 0.5:
                snap["ar_warning"] = f"注意：应收账款占年收入{ar_ratio:.1%}"
        except Exception:
            pass

    return snap
