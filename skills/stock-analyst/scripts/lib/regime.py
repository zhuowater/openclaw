"""
市场体制识别
基于大盘指数的 MA 斜率与价格位置，判断 BULL / BEAR / RANGE
体制决定所有技术指标的解读方向
"""
import pandas as pd
from .client import pro, date_range

# 指数映射：板块 → 参考指数
SECTOR_INDEX = {
    "STAR":   "000688.SH",   # 科创50（科创板标的）
    "GEM":    "399006.SZ",   # 创业板指
    "CSI300": "000300.SH",   # 沪深300（主板）
    "CSI500": "000905.SH",   # 中证500（中小盘）
    "ALL":    "000001.SH",   # 上证综指
}

REGIME_LABELS = {
    "BULL":  "🐂 牛市",
    "BEAR":  "🐻 熊市",
    "RANGE": "🔁 震荡",
}

REGIME_RULES = {
    # 体制 → 各指标解读规则（用于报告生成）
    "BULL": {
        "rsi_70": "仍可持有，追涨信号",
        "macd_golden": "加仓信号",
        "ma_above": "多头趋势确认",
    },
    "BEAR": {
        "rsi_70": "减仓信号，反弹卖出",
        "macd_golden": "反弹卖出机会",
        "ma_above": "死猫弹，不追",
    },
    "RANGE": {
        "rsi_70": "做空信号",
        "macd_golden": "短线操作，非趋势",
        "ma_above": "测试阻力，谨慎",
    },
}


def detect_regime(index_code: str = "000300.SH") -> dict:
    """
    识别指数当前市场体制
    Returns:
        dict: regime / label / price / ma60 / ma120 / slope / rules
    """
    d = date_range()
    df = pro().index_daily(ts_code=index_code, start_date=d["D1Y"], end_date=d["TODAY"])
    df = df.sort_values("trade_date").reset_index(drop=True)

    df["ma60"]  = df["close"].rolling(60).mean()
    df["ma120"] = df["close"].rolling(120).mean()
    df["slope"] = df["ma60"].diff(10)   # 10日斜率

    last = df.iloc[-1]
    price      = float(last["close"])
    ma60       = float(last["ma60"])
    ma120      = float(last["ma120"])
    slope      = float(last["slope"])
    above_ma120 = price > ma120
    rising      = slope > 0

    if above_ma120 and rising:
        regime = "BULL"
    elif not above_ma120 and not rising:
        regime = "BEAR"
    else:
        regime = "RANGE"

    return {
        "index":  index_code,
        "regime": regime,
        "label":  REGIME_LABELS[regime],
        "price":  round(price, 2),
        "ma60":   round(ma60, 2),
        "ma120":  round(ma120, 2),
        "slope":  round(slope, 4),
        "rules":  REGIME_RULES[regime],
    }


def detect_all() -> dict:
    """一次性识别主要板块体制"""
    results = {}
    for name, code in SECTOR_INDEX.items():
        try:
            results[name] = detect_regime(code)
        except Exception as e:
            results[name] = {"regime": "UNKNOWN", "label": f"获取失败: {e}"}
    return results


def get_stock_sector(ts_code: str) -> str:
    """
    根据股票代码推断所属板块
    688xxx.SH → STAR；300xxx/301xxx.SZ → GEM；其余 → CSI300
    """
    code = ts_code.split(".")[0]
    if code.startswith("688"):
        return "STAR"
    if code.startswith("300") or code.startswith("301"):
        return "GEM"
    return "CSI300"
