#!/usr/bin/env python3
"""
A股每日股票筛选脚本
条件：
1. 主板涨幅 3%-5%
2. 20天内有涨停板
3. 量比 >= 1
4. 市值 < 300亿
5. 换手率 5-10%
6. 全天站稳黄金均价线（VWAP）
"""

import tushare as ts
import os, requests, time
import pandas as pd
from datetime import datetime, timedelta

token = os.getenv('TUSHARE_TOKEN')
pro = ts.pro_api(token)
proxies = {'http': 'socks5h://127.0.0.1:7880', 'https': 'socks5h://127.0.0.1:7880'}
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}


def get_latest_trade_date():
    """获取最近交易日"""
    today = datetime.now().strftime('%Y%m%d')
    cal = pro.trade_cal(exchange='SSE', start_date=(datetime.now()-timedelta(days=10)).strftime('%Y%m%d'), end_date=today)
    open_days = cal[cal['is_open']==1]['cal_date'].tolist()
    return open_days[-1] if open_days else today


def get_vwap_check(ts_code, trade_date):
    """检查全天股价是否站稳在VWAP以上"""
    prefix = '1' if ts_code.endswith('.SH') else '0'
    code = ts_code.replace('.SZ','').replace('.SH','').replace('.BJ','')
    
    url = (f'http://push2his.eastmoney.com/api/qt/stock/kline/get'
           f'?secid={prefix}.{code}&fields1=f1,f2,f3,f4,f5,f6'
           f'&fields2=f51,f52,f53,f54,f55,f56,f57,f58'
           f'&klt=5&fqt=0&beg={trade_date}&end={trade_date}')
    try:
        r = requests.get(url, headers=headers, proxies=proxies, timeout=10)
        d = r.json()
        if not d.get('data') or not d['data'].get('klines'):
            return None, 0, 0
        
        klines = d['data']['klines']
        cum_amount = 0
        cum_vol = 0
        all_above = True
        closes = []
        
        for k in klines:
            parts = k.split(',')
            close = float(parts[2])
            vol = float(parts[5])
            amount = float(parts[6])
            cum_amount += amount
            cum_vol += vol
            vwap = cum_amount / (cum_vol * 100) if cum_vol > 0 else 0
            closes.append(close)
            if close < vwap:
                all_above = False
        
        final_vwap = cum_amount / (cum_vol * 100) if cum_vol > 0 else 0
        return all_above, closes[-1] if closes else 0, final_vwap
    except Exception as e:
        return None, 0, 0


def run_screen():
    trade_date = get_latest_trade_date()
    print(f"筛选日期: {trade_date}")
    
    # 获取20个交易日
    start = (datetime.now()-timedelta(days=35)).strftime('%Y%m%d')
    trade_cal = pro.trade_cal(exchange='SSE', start_date=start, end_date=trade_date)
    trade_dates = sorted(trade_cal[trade_cal['is_open']==1]['cal_date'].tolist())[-20:]
    
    # 获取今日数据
    df_daily = pro.daily(trade_date=trade_date, fields='ts_code,close,pct_chg')
    df_basic = pro.daily_basic(trade_date=trade_date, fields='ts_code,turnover_rate,volume_ratio,total_mv')
    df = df_daily.merge(df_basic, on='ts_code')
    
    # 条件筛选
    df = df[(df['pct_chg'] >= 3) & (df['pct_chg'] <= 5)]
    df = df[df['volume_ratio'] >= 1]
    df = df[(df['turnover_rate'] >= 5) & (df['turnover_rate'] <= 10)]
    df = df[df['total_mv'] < 3000000]  # 300亿=3000000万
    
    # 20天涨停
    limit_up = set()
    for td in trade_dates:
        try:
            df_lu = pro.daily(trade_date=td, fields='ts_code,pct_chg')
            limit_up.update(df_lu[df_lu['pct_chg'] >= 9.9]['ts_code'].tolist())
        except: pass
    df = df[df['ts_code'].isin(limit_up)]
    
    # 获取股票名称
    df_name = pro.stock_basic(fields='ts_code,name')
    df = df.merge(df_name, on='ts_code')
    candidates = df['ts_code'].tolist()
    
    print(f"前5条件候选: {len(candidates)} 只，开始VWAP验证...")
    
    # VWAP筛选
    results = []
    for code in candidates:
        ok, close, vwap = get_vwap_check(code, trade_date)
        if ok:
            row = df[df['ts_code']==code].iloc[0]
            results.append({
                'ts_code': code,
                'name': row['name'],
                'pct_chg': round(row['pct_chg'], 2),
                'turnover_rate': round(row['turnover_rate'], 2),
                'volume_ratio': round(row['volume_ratio'], 2),
                'market_cap': round(row['total_mv']/10000, 1),
                'close': close,
                'vwap': round(vwap, 2)
            })
        time.sleep(0.3)
    
    return trade_date, results


if __name__ == '__main__':
    trade_date, results = run_screen()
    print(f"\n{'='*50}")
    print(f"📊 {trade_date} A股筛选结果: {len(results)} 只")
    print(f"{'='*50}")
    if results:
        for r in results:
            print(f"✅ {r['ts_code']} {r['name']}")
            print(f"   涨幅:{r['pct_chg']}% | 换手:{r['turnover_rate']}% | 量比:{r['volume_ratio']} | 市值:{r['market_cap']}亿")
            print(f"   收盘:{r['close']} | VWAP:{r['vwap']}")
    else:
        print("今日无符合条件的股票")
