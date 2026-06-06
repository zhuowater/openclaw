#!/usr/bin/env python3
"""
Stock Analyst Pro — 主分析入口
用法：
    python analyze.py 688561.SH
    python analyze.py 000001.SZ --modules tech,fund,risk
    python analyze.py 000300.SH --regime-only
"""
import argparse
import contextlib
import io
import json
import re
import sys
import os
from datetime import datetime

# 确保可以找到 lib 包
sys.path.insert(0, os.path.dirname(__file__))

from lib.client import pro, date_range
from lib.regime import detect_regime, get_stock_sector, SECTOR_INDEX
from lib.technical import fetch_ohlcv, calc_indicators, snapshot, get_weekly_monthly
from lib.fundamentals import (fundamentals_snapshot, get_broker_ratings, get_company_info,
                              get_annual_trend, accrual_ratio, fund_crowding)
from lib.microstructure import microstructure_snapshot
from lib.risk import calc_risk_metrics, stress_test
from lib.iv import get_star_proxy_iv, get_gem_proxy_iv
from lib.valuation import valuation_snapshot, get_peer_comparison
from lib.sentiment import sentiment_snapshot
from lib.x_intelligence import x_intelligence_snapshot
from lib.cn_intelligence import cn_intelligence_snapshot
from lib.youtube_intelligence import youtube_intelligence_snapshot
from lib.report import save_report


# ── 辅助打印 ───────────────────────────────────────────────────────────────────

def section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)


def kv(key: str, val, indent: int = 2):
    prefix = " " * indent
    if val is None:
        print(f"{prefix}{key}: N/A")
    elif isinstance(val, dict) and "error" in val:
        print(f"{prefix}{key}: ❌ {val['error']}")
    else:
        print(f"{prefix}{key}: {val}")


# ── 各模块打印函数 ──────────────────────────────────────────────────────────────

def print_company_info(ts_code: str):
    section("🏢 公司基本信息")
    info = get_company_info(ts_code)
    if "error" in info:
        print(f"  ❌ {info['error']}")
        return
    kv("名称",     info.get("name"))
    kv("行业",     info.get("industry"))
    kv("市场",     info.get("market"))
    kv("上市日期", info.get("list_date"))
    kv("地区",     info.get("area"))
    kv("董事长",   info.get("chairman"))
    kv("总经理",   info.get("manager"))
    mb = info.get("main_business", "")
    if mb:
        print(f"  主营: {mb}")


def print_annual_trend(ts_code: str):
    section("📅 历史财务趋势（年报/半年报）")
    rows = get_annual_trend(ts_code)
    if not rows or (len(rows) == 1 and "error" in rows[0]):
        print(f"  ❌ {rows[0].get('error', '无数据')}")
        return
    print(f"  {'期间':<12} {'营收(亿)':<10} {'净利润(亿)':<12} {'毛利率%':<10} {'ROE%':<8} {'净利同比%'}")
    print(f"  {'-'*68}")
    for r in rows:
        rev  = float(r["revenue"]) / 1e8       if r.get("revenue")             else float("nan")
        net  = float(r["n_income_attr_p"]) / 1e8 if r.get("n_income_attr_p")   else float("nan")
        gm   = float(r["grossprofit_margin"])  if r.get("grossprofit_margin")   else float("nan")
        roe  = float(r["roe"])                 if r.get("roe")                  else float("nan")
        nyoy = float(r["netprofit_yoy"])       if r.get("netprofit_yoy")        else float("nan")
        def fmt(v, d=2): return f"{v:.{d}f}" if v == v else "N/A"
        print(f"  {r['end_date']:<12} {fmt(rev):<10} {fmt(net):<12} {fmt(gm):<10} {fmt(roe):<8} {fmt(nyoy)}")


def print_peers(ts_code: str, peer_codes: list = None):
    section("🔀 同行业估值对比")
    peers = get_peer_comparison(ts_code, peer_codes)
    if not peers or (len(peers) == 1 and "error" in peers[0]):
        print(f"  ❌ {peers[0].get('error', '无数据')}")
        return
    print(f"  {'代码':<12} {'名称':<12} {'PE(TTM)':<10} {'PB':<8} {'PS':<8} {'市值(亿)'}")
    print(f"  {'-'*62}")
    for p in peers[:8]:
        pe  = p.get("pe_ttm")  or "N/A"
        pb  = p.get("pb")      or "N/A"
        ps  = p.get("ps_ttm")  or "N/A"
        mv  = p.get("total_mv_yi") or "N/A"
        print(f"  {p['ts_code']:<12} {str(p['name'])[:10]:<12} {str(pe):<10} {str(pb):<8} {str(ps):<8} {mv}")


def print_regime(ts_code: str):
    section("📊 市场体制识别")
    sector = get_stock_sector(ts_code)
    index_code = SECTOR_INDEX.get(sector, "000300.SH")
    r = detect_regime(index_code)
    print(f"  标的板块: {sector} → 参考指数: {index_code}")
    kv("市场体制", r.get("label"))
    kv("指数价格", r.get("price"))
    kv("MA60",    r.get("ma60"))
    kv("MA120",   r.get("ma120"))
    kv("MA60斜率", r.get("slope"))
    rules = r.get("rules", {})
    print("  体制解读规则:")
    for k, v in rules.items():
        print(f"    · {k}: {v}")
    return r.get("regime", "RANGE")


def print_technical(ts_code: str):
    section("📈 技术面分析")
    df = fetch_ohlcv(ts_code)
    df = calc_indicators(df)
    snap = snapshot(df)

    kv("交易日期",   snap["trade_date"])
    kv("收盘价",     snap["close"])
    kv("日涨跌幅",   f"{snap['pct_chg']}%")
    kv("成交量(万)", snap["vol_wan"])
    print()
    kv("MA5/10/20", f"{snap['ma5']} / {snap['ma10']} / {snap['ma20']}")
    kv("MA60/120",  f"{snap['ma60']} / {snap['ma120']}")
    kv("MA排列",    snap["ma_trend"])
    print()
    kv("DIF/DEA",   f"{snap['dif']} / {snap['dea']}")
    kv("MACD柱",    snap["macd_bar"])
    kv("MACD信号",  snap["macd_signal"])
    print()
    kv("RSI14",     snap["rsi14"])
    kv("RSI信号",   snap["rsi_signal"])
    print()
    kv("KDJ K/D/J", f"{snap['kdj_k']} / {snap['kdj_d']} / {snap['kdj_j']}")
    kv("KDJ信号",   snap["kdj_signal"])
    print()
    kv("布林上/中/下", f"{snap['bb_up']} / {snap['bb_mid']} / {snap['bb_dn']}")
    kv("布林位置",   f"{snap['bb_pct']}%")
    kv("布林带宽",   f"{snap['bb_width']}%")
    kv("布林信号",   snap["bb_signal"])
    print()
    kv("ATR14",     snap["atr14"])
    kv("ATR%",      f"{snap['atr_pct']}%")
    kv("支撑(20d)", snap["support_20d"])
    kv("阻力(20d)", snap["resist_20d"])
    kv("支撑(60d)", snap["support_60d"])
    kv("阻力(60d)", snap["resist_60d"])
    print()
    kv("52周高/低", f"{snap['high_52w']} / {snap['low_52w']}")
    kv("距52周高点", snap["dist_52w_signal"])

    wm = get_weekly_monthly(ts_code)
    print()
    for freq, data in wm.items():
        if isinstance(data, dict) and "error" not in data:
            kv(f"{freq} 收盘/MA20/趋势",
               f"{data['close']} / {data['ma20']} / {data['trend']}")

    return df, snap


def print_fundamentals(ts_code: str):
    section("💹 基本面快照")
    fs = fundamentals_snapshot(ts_code)

    kv("报告期",         fs.get("period"))
    kv("营收",           _fmt_yi(fs.get("revenue")))
    kv("归母净利润",     _fmt_yi(fs.get("net_income")))
    kv("EPS",            fs.get("eps"))
    kv("ROE",            _fmt_pct(fs.get("roe")))
    kv("毛利率",         _fmt_pct(fs.get("gross_margin")))
    kv("净利率",         _fmt_pct(fs.get("net_margin")))
    kv("资产负债率",     _fmt_pct(fs.get("debt_ratio")))
    kv("营收同比",       _fmt_pct(fs.get("revenue_yoy")))
    kv("净利同比",       _fmt_pct(fs.get("netprofit_yoy")))
    kv("经营现金流",     _fmt_yi(fs.get("op_cashflow")))
    kv("自由现金流",     _fmt_yi(fs.get("free_cashflow")))
    kv("应收账款",       _fmt_yi(fs.get("accounts_receiv")))

    if fs.get("ar_warning"):
        print(f"  {fs['ar_warning']}")

    ex = fs.get("express")
    if ex:
        print()
        kv("业绩快报期间", ex.get("period"))
        kv("快报营收",     _fmt_yi(ex.get("revenue")))
        kv("快报净利润",   _fmt_yi(ex.get("n_income")))

    fc = fs.get("forecast")
    if fc:
        print()
        kv("业绩预告类型",   fc.get("type"))
        kv("预告净利润区间", f"{fc.get('net_profit_min')} ~ {fc.get('net_profit_max')} 万元")

    bc = fs.get("broker_consensus")
    if bc and "error" not in bc:
        print()
        kv("券商共识评级", bc.get("label"))
        kv("目标价均值",   bc.get("tp_mean"))
        kv("评级数量",     bc.get("count"))

    # ── Sloan应计比率（盈利质量） ──────────────────────────────────────────
    print()
    ar = accrual_ratio(ts_code)
    if "error" in ar:
        kv("应计比率(Sloan)", f"❌ {ar['error']}")
    else:
        kv("应计比率(Sloan)", f"{ar['accrual_ratio']}%")
        kv("  应计信号",      ar["signal"])

    # ── 机构持仓拥挤度 ─────────────────────────────────────────────────────
    fc_data = fund_crowding(ts_code)
    if "error" in fc_data:
        kv("机构持仓拥挤度", f"❌ {fc_data['error']}")
    else:
        kv("机构持仓占比", f"{fc_data['inst_pct']}%（{fc_data['inst_count']}家机构，前十大流通股东）")
        kv("  拥挤度信号", fc_data["signal"])

    return fs


def print_microstructure(ts_code: str):
    section("🔍 市场微观结构")
    ms = microstructure_snapshot(ts_code)

    v = ms.get("vwap", {})
    if "error" not in v:
        kv("估算VWAP",   v.get("vwap"))
        kv("VWAP偏离",   f"{v.get('deviation')}%")
        kv("VWAP信号",   v.get("signal"))

    mf = ms.get("moneyflow", {})
    if "error" not in mf:
        print()
        kv("今日大单净流入(万)", mf.get("net_all_today"))
        kv("10日大单净(万)",    mf.get("net_all_10d"))
        kv("资金信号",           mf.get("signal"))

    cp = ms.get("chips", {})
    if "error" not in cp:
        print()
        kv("胜率%",           cp.get("winner_rate"))
        kv("筹码中位成本",    cp.get("cost_50pct"))
        kv("筹码信号",        cp.get("signal"))

    hn = ms.get("holders", {}).get("holder_number", {})
    if "error" not in hn:
        print()
        kv("股东人数",     hn.get("count"))
        kv("人数变化%",    f"{hn.get('chg_pct')}%")
        kv("集中度信号",   hn.get("signal"))

    it = ms.get("insider", {})
    if "error" not in it:
        print()
        kv("内部人净量(股)", it.get("net_vol"))
        kv("内部人信号",     it.get("signal"))

    mg = ms.get("margin", {})
    if "error" not in mg:
        print()
        kv("融资余额(万)", mg.get("rzye_wan"))
        kv("融资信号",     mg.get("signal"))
        if mg.get("margin_risk"):
            kv("融资/流通市值", mg.get("margin_risk"))

    bt = ms.get("block_trades", {})
    if "error" not in bt and bt.get("count", 0) > 0:
        print()
        kv("大宗交易次数(6M)", bt.get("count"))
        kv("平均折溢价%",      bt.get("avg_premium"))
        kv("大宗信号",         bt.get("signal"))

    sf = ms.get("share_float", {})
    if sf.get("warning"):
        print()
        print(f"  {sf['warning']}")


def print_risk(ts_code: str):
    section("⚖️ 量化风险指标")
    rm = calc_risk_metrics(ts_code)

    kv("HV5 / HV20 / HV60 / HV1Y",
       f"{rm.get('hv5')}% / {rm.get('hv20')}% / {rm.get('hv60')}% / {rm.get('hv1y')}%")
    kv("Beta(vs沪深300)", rm.get("beta"))
    kv("Sharpe(1Y)",      rm.get("sharpe"))
    kv("Sortino(1Y)",     rm.get("sortino"))
    kv("最大回撤(MDD)",   f"{rm.get('mdd')}%")
    kv("VaR(10日,95%)",   f"{rm.get('var_10d_95')}%")
    kv("Amihud非流动性",  rm.get("amihud"))
    print()
    kv("历史胜率",         f"{rm.get('win_prob')}%")
    kv("平均盈(亏)",       f"+{rm.get('win_ret')}% / -{rm.get('loss_ret')}%")
    kv("Kelly全仓",        f"{rm.get('kelly_f')}%")
    kv("Kelly半仓",        f"{rm.get('kelly_half')}%")
    kv("Kelly信号",        rm.get("kelly_signal"))

    st = stress_test(ts_code)
    if "error" not in st:
        print()
        print("  [压力测试]")
        for event, ret in st.items():
            if ret is not None:
                kv(event, f"{ret}%")


def print_iv(ts_code: str):
    section("📉 隐含波动率（期权IV）")
    sector = get_stock_sector(ts_code)
    if sector == "STAR":
        iv_data = get_star_proxy_iv()
        print("  代理：科创50ETF期权(588000.SH)")
    elif sector == "GEM":
        iv_data = get_gem_proxy_iv()
        print("  代理：创业板ETF期权(159915.SZ)")
    else:
        iv_data = get_star_proxy_iv()   # fallback
        print("  代理：50ETF期权(近似)")

    if "error" in iv_data:
        print(f"  ❌ {iv_data['error']}")
        return

    kv("到期日",        iv_data.get("maturity_date"))
    kv("ATM行权价",     iv_data.get("atm_strike"))
    kv("ATM Call IV",   f"{iv_data.get('atm_call_iv')}%")
    kv("ATM Put IV",    f"{iv_data.get('atm_put_iv')}%")
    kv("综合IV",        f"{iv_data.get('avg_iv')}%")
    kv("Put-Call Skew", f"{iv_data.get('put_call_skew')}%")
    kv("Skew信号",      iv_data.get("skew_signal"))


def print_valuation(ts_code: str, revenue: float = None,
                    shares: float = None, price: float = None,
                    net_margin: float = 0.10):
    section("💰 估值分析")
    vs = valuation_snapshot(ts_code, revenue, shares, price, net_margin)

    db = vs.get("daily_basic", {})
    kv("PE(TTM)", db.get("pe_ttm"))
    kv("PB",      db.get("pb"))
    kv("PS(TTM)", db.get("ps_ttm"))
    kv("股息率",  db.get("dv_ttm"))
    kv("总市值(亿)", db.get("total_mv_yi"))
    kv("换手率%", db.get("turnover_rate"))

    hist = vs.get("history", {})
    if isinstance(hist, dict) and "error" not in hist:
        print()
        for metric, data in hist.items():
            kv(f"{metric}历史分位",
               f"当前{data['current']} | 分位{data['percentile']}% | {data['label']}")

    dcf = vs.get("dcf")
    if dcf:
        print()
        print("  [DCF估值]")
        for label, vals in dcf["scenarios"].items():
            per = vals.get("per_share")
            up  = vals.get("upside")
            kv(label, f"¥{per} (空间: {up}%)" if per and up else str(vals))


def print_sentiment(ts_code: str):
    section("💬 市场情绪")
    ss = sentiment_snapshot(ts_code)

    nb = ss.get("northbound", {})
    if "error" not in nb:
        kv("北向今日(亿)", nb.get("north_today"))
        kv("北向10日(亿)", nb.get("north_10d"))
        kv("北向信号",     nb.get("signal"))
        if nb.get("extreme_signal"):
            print(f"  {nb['extreme_signal']}")

    nt = ss.get("nine_turn", {})
    if "error" not in nt:
        print()
        kv("神奇九转买入Setup", nt.get("buy_setup"))
        kv("神奇九转卖出Setup", nt.get("sell_setup"))
        for sig in nt.get("signals", []):
            print(f"  ⚡ {sig}")

    dt = ss.get("dragon_tiger", {})
    if "error" not in dt:
        print()
        kv("龙虎榜",  dt.get("signal"))

    hk = ss.get("hk_hold", {})
    if "error" not in hk:
        print()
        kv("港股通持仓比%",  hk.get("ratio"))
        kv("持仓10日变化%",  hk.get("ratio_change_10d"))
        kv("外资信号",       hk.get("signal"))


def print_x_intelligence(ts_code: str):
    section("𝕏 X/Twitter 实时情报")
    xi = x_intelligence_snapshot(ts_code)
    if "error" in xi:
        print(f"  ❌ {xi['error']}")
        return
    kv("数据源", xi.get("source"))
    kv("模型", xi.get("model"))
    kv("搜索词", " | ".join(xi.get("queries", [])))
    print()
    for line in xi.get("summary", "").splitlines():
        if line.strip():
            print(f"  {line}")
    cites = xi.get("citations") or []
    if cites:
        print("\n  搜索原始引用/候选链接（需按摘要判断相关性）:")
        for url in cites[:6]:
            print(f"  - {url}")


def print_cn_intelligence(ts_code: str):
    section("🇨🇳 国内舆情：百度 + 雪球")
    ci = cn_intelligence_snapshot(ts_code)
    kv("标的", ci.get("target"))
    warnings = ci.get("warnings") or []
    for w in warnings:
        print(f"  ⚠️ {w}")

    print("\n  [百度：新闻/公告/政策/风险]")
    bn = ci.get("baidu_news", {})
    kv("来源", bn.get("source"))
    if bn.get("summary"):
        for line in bn["summary"].splitlines()[:12]:
            if line.strip():
                print(f"  {line}")
    else:
        for line in ci.get("summary_lines", {}).get("baidu_news", []):
            print(f"  {line}")

    print("\n  [百度：股吧/雪球/投资者讨论发现]")
    bf = ci.get("baidu_forum", {})
    kv("来源", bf.get("source"))
    if bf.get("summary"):
        for line in bf["summary"].splitlines()[:12]:
            if line.strip():
                print(f"  {line}")
    else:
        for line in ci.get("summary_lines", {}).get("baidu_forum", []):
            print(f"  {line}")

    print("\n  [雪球讨论]")
    xq = ci.get("xueqiu", {})
    kv("来源", xq.get("source"))
    if xq.get("summary"):
        for line in xq["summary"].splitlines()[:12]:
            if line.strip():
                print(f"  {line}")
    else:
        for line in ci.get("summary_lines", {}).get("xueqiu", []):
            print(f"  {line}")
    print("\n  纪律: 百度/雪球用于情报发现和情绪热度，不替代公告、Tushare价格/财务/资金流硬数据；搜索摘要需二次核验。")


def print_youtube_intelligence(ts_code: str):
    section("▶️ YouTube 技术分享/叙事情报")
    yi = youtube_intelligence_snapshot(ts_code, max_results=12, with_transcript=False)
    kv("数据源", yi.get("source"))
    kv("标的", yi.get("target"))
    kv("搜索词", " | ".join(yi.get("queries", [])))
    heat = yi.get("retail_heat", {})
    if heat:
        kv("零售视频热度", f"{heat.get('label')}（avg_score={heat.get('avg_score')}）")
        if heat.get("warning"):
            print(f"  ⚠️ {heat.get('warning')}")
    print("\n  [高热视频/技术分享候选]")
    for i, v in enumerate(yi.get("videos", [])[:10], 1):
        vc = v.get("view_count") or 0
        cls = v.get("classification", {})
        themes = ", ".join([t.get("theme", "") for t in cls.get("themes", [])[:2]])
        print(f"  {i}. {v.get('title')} — {v.get('channel')} / views={vc:,} / 热度={cls.get('heat_label')}({cls.get('retail_heat_score')})")
        print(f"     主题: {themes or 'N/A'}")
        print(f"     {v.get('url')}")
        desc = v.get("description")
        if desc:
            print(f"     摘要: {desc[:160]}")
    takeaways = yi.get("method_takeaways") or []
    if takeaways:
        print("\n  [可迁移方法内核]")
        for t in takeaways:
            print(f"  - {t}")
    mappings = yi.get("method_mapping") or []
    if mappings:
        print("\n  [视频观点 → stock-analyst硬检查]")
        for m in mappings[:6]:
            checks = "；".join(m.get("convert_to_checks", [])[:5])
            print(f"  - {m.get('theme')}: {checks}")
    print(f"\n  纪律: {yi.get('discipline')}")


# ── 辅助格式化 ──────────────────────────────────────────────────────────────────

def _fmt_yi(val) -> str:
    if val is None:
        return "N/A"
    try:
        v = float(val)
        return f"{v/1e8:.2f} 亿元"
    except Exception:
        return str(val)


def _fmt_pct(val) -> str:
    if val is None:
        return "N/A"
    try:
        return f"{float(val):.2f}%"
    except Exception:
        return str(val)


# ── 主程序 ─────────────────────────────────────────────────────────────────────

class _Tee:
    """同时写入两个输出流（屏幕 + 缓冲区）"""
    def __init__(self, *streams):
        self._streams = streams

    def write(self, data):
        for s in self._streams:
            s.write(data)

    def flush(self):
        for s in self._streams:
            s.flush()


def _plain_to_markdown(text: str, ts_code: str, name: str = "") -> str:
    """将 analyze.py 的 plain-text 输出转换为 Markdown 格式"""
    title = f"{name}（{ts_code}）投资分析报告" if name else f"{ts_code} 投资分析报告"
    date_str = datetime.today().strftime("%Y-%m-%d")
    lines = text.split("\n")
    md = [f"# {title}", f"\n> 生成日期：{date_str}\n"]

    SEP = "=" * 60
    i = 0
    while i < len(lines):
        line = lines[i]
        # 顶部 ###... 标题行
        if line.startswith("###") and "Stock Analyst Pro" in line:
            i += 1
            continue
        if line.strip() == SEP or line.strip().startswith("###"):
            i += 1
            continue
        # 节标题模式：空行 + === + "  TITLE" + ===
        if line.strip() == "" and i + 3 < len(lines):
            nxt = lines[i + 1]
            ttl = lines[i + 2]
            nxt2 = lines[i + 3]
            if nxt.strip() == SEP and nxt2.strip() == SEP:
                section_title = ttl.strip()
                md.append(f"\n## {section_title}\n")
                i += 4
                continue
        # kv 行：两空格缩进
        if line.startswith("  ") and ": " in line and not line.startswith("   "):
            key, _, val = line.strip().partition(": ")
            md.append(f"- **{key}**: {val}")
            i += 1
            continue
        # 表格行（已是格式化文本，原样保留）
        if line.startswith("  ") and ("-" * 10 in line or line.strip().startswith("|")):
            md.append(f"\n```\n{line}\n```\n") if "---" in line else md.append(line)
            i += 1
            continue
        # 分析完成行
        if "分析完成" in line:
            i += 1
            continue
        md.append(line)
        i += 1

    return "\n".join(md)


def main():
    parser = argparse.ArgumentParser(description="Stock Analyst Pro")
    parser.add_argument("ts_code", help="股票代码，如 688561.SH")
    parser.add_argument("--modules", default="all",
                        help="分析模块: all / regime,tech,fund,micro,risk,iv,val,sent,xintel,cnintel,ytintel")
    parser.add_argument("--regime-only", action="store_true", help="只输出体制识别")
    parser.add_argument("--json", action="store_true", help="以JSON格式输出（实验性）")
    parser.add_argument("--output-dir", default=".", help="报告输出目录（默认当前目录）")
    parser.add_argument("--no-save", action="store_true", help="不保存报告文件")
    args = parser.parse_args()

    ts_code = args.ts_code.upper()
    output_dir = os.path.abspath(args.output_dir)

    # 获取公司名（用于文件名）
    name = ""
    try:
        info = get_company_info(ts_code)
        name = info.get("name", "")
    except Exception:
        pass

    # 确定运行模块
    if args.regime_only:
        modules = {"regime"}
    elif args.modules == "all":
        modules = {"info", "regime", "tech", "trend", "fund", "micro", "risk", "iv", "val", "peers", "sent", "xintel", "cnintel", "ytintel"}
    else:
        modules = set(args.modules.split(","))

    # ── 捕获输出用于保存报告 ──────────────────────────────────────────────────
    buf = io.StringIO()
    tee = _Tee(sys.stdout, buf)   # 同时写屏幕和缓冲区

    with contextlib.redirect_stdout(tee):
        print(f"\n{'#'*60}")
        print(f"#  Stock Analyst Pro — {ts_code}")
        print(f"{'#'*60}")

        regime = None
        df = None
        snap = None
        fs = None

        if "info" in modules:
            print_company_info(ts_code)

        if "regime" in modules:
            regime = print_regime(ts_code)

        if "tech" in modules:
            df, snap = print_technical(ts_code)

        if "fund" in modules:
            fs = print_fundamentals(ts_code)

        if "trend" in modules:
            print_annual_trend(ts_code)

        if "peers" in modules:
            print_peers(ts_code)

        if "micro" in modules:
            print_microstructure(ts_code)

        if "risk" in modules:
            print_risk(ts_code)

        if "iv" in modules:
            print_iv(ts_code)

        if "val" in modules:
            revenue = None
            shares  = None
            price   = None
            if snap:
                price = snap.get("close")
            try:
                if "fund" in modules:
                    revenue = fs.get("revenue")
                    db_info = pro().daily_basic(ts_code=ts_code, start_date=date_range()["D3"],
                                                end_date=date_range()["TODAY"],
                                                fields="trade_date,total_mv,total_share")
                    if db_info is not None and len(db_info) > 0:
                        shares = float(db_info.iloc[0].get("total_share", 0)) * 1e4
            except Exception:
                pass
            print_valuation(ts_code, revenue=revenue, shares=shares, price=price)

        if "sent" in modules:
            print_sentiment(ts_code)

        if "cnintel" in modules:
            print_cn_intelligence(ts_code)

        if "xintel" in modules:
            print_x_intelligence(ts_code)

        if "ytintel" in modules:
            print_youtube_intelligence(ts_code)

        print(f"\n{'='*60}")
        print("  分析完成")
        print(f"{'='*60}\n")

    # ── 保存报告 ──────────────────────────────────────────────────────────────
    if not args.no_save:
        plain_output = buf.getvalue()
        md_content = _plain_to_markdown(plain_output, ts_code, name)
        result = save_report(md_content, ts_code, name=name, output_dir=output_dir)
        print(f"\n📄 报告已保存：{result['md']}")
        if result.get("pdf"):
            print(f"📑 PDF已生成：{result['pdf']}")
        elif result.get("pdf_error"):
            print(f"⚠️  PDF生成失败：{result['pdf_error']}")


if __name__ == "__main__":
    main()
