"""
奇安信（688561.SH）Tushare 数据查询
使用前请设置 TUSHARE_TOKEN 环境变量或修改下方 TOKEN 变量
"""
import tushare as ts
import pandas as pd
from datetime import datetime, timedelta

# ============================================================
# 配置 Token（从 https://tushare.pro 获取）
# ============================================================
TOKEN = ""  # 在此填入你的 Token，或通过环境变量 TUSHARE_TOKEN 传入

import os
token = TOKEN or os.environ.get("TUSHARE_TOKEN", "")
if not token:
    raise ValueError("请设置 TUSHARE_TOKEN 环境变量或在脚本中填入 TOKEN")

ts.set_token(token)
pro = ts.pro_api()

STOCK_CODE = "688561.SH"
TODAY = datetime.today().strftime("%Y%m%d")
START_90D = (datetime.today() - timedelta(days=90)).strftime("%Y%m%d")
START_1Y = (datetime.today() - timedelta(days=365)).strftime("%Y%m%d")

pd.set_option("display.max_columns", None)
pd.set_option("display.width", 200)

print("=" * 60)
print(f"奇安信（{STOCK_CODE}）数据查询 - {TODAY}")
print("=" * 60)

# ----------------------------------------------------------
# 1. 基本信息
# ----------------------------------------------------------
print("\n【1. 股票基本信息】")
basic = pro.stock_basic(ts_code=STOCK_CODE, fields="ts_code,name,area,industry,market,list_date,total_share,float_share")
print(basic.to_string(index=False))

# ----------------------------------------------------------
# 2. 最新日线行情（近20个交易日）
# ----------------------------------------------------------
print("\n【2. 近20交易日行情】")
daily = pro.daily(ts_code=STOCK_CODE, start_date=START_90D, end_date=TODAY)
daily = daily.sort_values("trade_date").tail(20)
print(daily[["trade_date", "open", "high", "low", "close", "vol", "amount", "pct_chg"]].to_string(index=False))

# ----------------------------------------------------------
# 3. 实时行情（最新）
# ----------------------------------------------------------
print("\n【3. 最新行情快照（实时）】")
try:
    realtime = ts.get_realtime_quotes("688561")
    if realtime is not None and not realtime.empty:
        cols = ["name", "open", "pre_close", "price", "high", "low", "volume", "amount", "date", "time"]
        print(realtime[cols].to_string(index=False))
    else:
        print("实时数据暂不可用（非交易时段或权限不足）")
except Exception as e:
    print(f"实时行情获取失败: {e}")

# ----------------------------------------------------------
# 4. 技术指标（均线）
# ----------------------------------------------------------
print("\n【4. 技术指标（近期均线参考）】")
daily_full = pro.daily(ts_code=STOCK_CODE, start_date=START_1Y, end_date=TODAY)
daily_full = daily_full.sort_values("trade_date")
close = daily_full["close"]

daily_full["MA5"]  = close.rolling(5).mean()
daily_full["MA10"] = close.rolling(10).mean()
daily_full["MA20"] = close.rolling(20).mean()
daily_full["MA60"] = close.rolling(60).mean()

# MACD
exp12 = close.ewm(span=12, adjust=False).mean()
exp26 = close.ewm(span=26, adjust=False).mean()
daily_full["DIF"]  = exp12 - exp26
daily_full["DEA"]  = daily_full["DIF"].ewm(span=9, adjust=False).mean()
daily_full["MACD"] = 2 * (daily_full["DIF"] - daily_full["DEA"])

# RSI
delta = close.diff()
gain = delta.clip(lower=0).rolling(14).mean()
loss = (-delta.clip(upper=0)).rolling(14).mean()
daily_full["RSI14"] = 100 - (100 / (1 + gain / loss))

latest = daily_full.tail(1)[["trade_date","close","MA5","MA10","MA20","MA60","DIF","DEA","MACD","RSI14"]]
print(latest.to_string(index=False))

# ----------------------------------------------------------
# 5. 财务基本面（最新三期）
# ----------------------------------------------------------
print("\n【5. 核心财务指标（最新3期）】")
try:
    income = pro.income(ts_code=STOCK_CODE, fields="end_date,total_revenue,n_income_attr_p,basic_eps", limit=3)
    print("利润表：")
    print(income.to_string(index=False))

    balance = pro.balancesheet(ts_code=STOCK_CODE, fields="end_date,total_assets,total_liab,total_hldr_eqy_exc_min_int", limit=3)
    print("\n资产负债表：")
    print(balance.to_string(index=False))

    cashflow = pro.cashflow(ts_code=STOCK_CODE, fields="end_date,n_cashflow_act,free_cashflow", limit=3)
    print("\n现金流：")
    print(cashflow.to_string(index=False))
except Exception as e:
    print(f"财务数据获取失败（可能需要更高权限）: {e}")

# ----------------------------------------------------------
# 6. 估值指标
# ----------------------------------------------------------
print("\n【6. 最新估值指标】")
try:
    daily_basic = pro.daily_basic(ts_code=STOCK_CODE, trade_date=TODAY,
                                  fields="ts_code,trade_date,close,pe_ttm,pb,ps_ttm,total_mv,circ_mv,turnover_rate,volume_ratio")
    if daily_basic.empty:
        # 尝试前一交易日
        yesterday = (datetime.today() - timedelta(days=3)).strftime("%Y%m%d")
        daily_basic = pro.daily_basic(ts_code=STOCK_CODE, start_date=yesterday, end_date=TODAY,
                                      fields="ts_code,trade_date,close,pe_ttm,pb,ps_ttm,total_mv,circ_mv,turnover_rate,volume_ratio")
        daily_basic = daily_basic.head(1)
    print(daily_basic.to_string(index=False))
except Exception as e:
    print(f"估值数据获取失败: {e}")

# ----------------------------------------------------------
# 7. 资金流向
# ----------------------------------------------------------
print("\n【7. 近10日主力资金流向】")
try:
    money_flow = pro.moneyflow(ts_code=STOCK_CODE, start_date=START_90D, end_date=TODAY,
                               fields="trade_date,buy_lg_amount,sell_lg_amount,net_mf_amount,net_mf_vol")
    money_flow = money_flow.sort_values("trade_date").tail(10)
    print(money_flow.to_string(index=False))
except Exception as e:
    print(f"资金流向数据获取失败（可能需要更高权限）: {e}")

# ----------------------------------------------------------
# 8. 机构持仓（龙虎榜）
# ----------------------------------------------------------
print("\n【8. 近期龙虎榜数据】")
try:
    top_list = pro.top_list(ts_code=STOCK_CODE, start_date=START_90D, end_date=TODAY)
    if not top_list.empty:
        print(top_list[["trade_date","close","pct_change","turnover_rate","buy_turnover","sell_turnover","net_amount"]].to_string(index=False))
    else:
        print("近期无龙虎榜记录")
except Exception as e:
    print(f"龙虎榜数据获取失败: {e}")

print("\n" + "=" * 60)
print("查询完成")
print("=" * 60)
