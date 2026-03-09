#!/usr/bin/env python3
"""
FIFA 2026 World Cup Odds Arbitrage Scanner
对比主流博彩公司赔率 vs Polymarket 价格，发现套利机会
"""

import json
import requests
from typing import Dict, List, Tuple
from dataclasses import dataclass
from datetime import datetime

# Proxy 配置
PROXY = {
    'http': 'socks5h://127.0.0.1:7880',
    'https': 'socks5h://127.0.0.1:7880'
}

# 我们的 Polymarket 持仓
POSITIONS = {
    'Netherlands': {'shares': 110, 'avg_price': 0.031, 'cost': 3.40},
    'Norway': {'shares': 100, 'avg_price': 0.031, 'cost': 2.80},
    'Germany': {'shares': 60, 'avg_price': 0.0545, 'cost': 3.36},
    'Portugal': {'shares': 35, 'avg_price': 0.0704, 'cost': 2.45},
    'Brazil': {'shares': 30, 'avg_price': 0.0855, 'cost': 2.64}
}

@dataclass
class OddsComparison:
    """赔率对比结果"""
    country: str
    bookmaker_odds: float  # 十进制赔率
    bookmaker_prob: float  # 隐含概率
    polymarket_price: float  # Polymarket 价格 (0-1)
    polymarket_prob: float  # Polymarket 隐含概率
    diff_pct: float  # 差异百分比
    our_position: Dict = None
    
    @property
    def is_arbitrage(self) -> bool:
        """是否存在套利机会 (>2% 差异)"""
        return abs(self.diff_pct) > 2.0
    
    @property
    def direction(self) -> str:
        """相对定价"""
        if self.diff_pct > 2:
            return "PM OVERPRICED" if self.polymarket_prob > self.bookmaker_prob else "PM UNDERPRICED"
        return "FAIR"


def decimal_to_probability(odds: float) -> float:
    """将十进制赔率转换为隐含概率"""
    return 1.0 / odds


def get_polymarket_prices() -> Dict[str, float]:
    """
    获取 Polymarket 2026 世界杯价格
    Returns: {country: price}
    """
    try:
        # 尝试从 Data API 获取市场数据
        print("🔍 查询 Polymarket markets...")
        url = "https://gamma-api.polymarket.com/markets"
        params = {
            'closed': 'false',
            'limit': 100
        }
        
        resp = requests.get(url, params=params, proxies=PROXY, timeout=10)
        resp.raise_for_status()
        
        markets = resp.json()
        prices = {}
        
        # 查找 2026 世界杯相关市场
        for market in markets:
            question = market.get('question', '')
            if ('2026' in question or '26' in question) and ('World Cup' in question or 'FIFA' in question):
                # outcomes 和 outcomePrices 是 JSON 字符串，需要解析
                outcomes_str = market.get('outcomes', '[]')
                prices_str = market.get('outcomePrices', '[]')
                
                try:
                    outcomes = json.loads(outcomes_str) if isinstance(outcomes_str, str) else outcomes_str
                    outcome_prices = json.loads(prices_str) if isinstance(prices_str, str) else prices_str
                except json.JSONDecodeError:
                    continue
                
                print(f"  找到市场: {question[:80]}")
                
                if outcomes and outcome_prices and len(outcomes) == len(outcome_prices):
                    for country, price_str in zip(outcomes, outcome_prices):
                        try:
                            price = float(price_str)
                            if price > 0 and price < 1:  # 合理的概率范围
                                # 提取国家名 (去除 "Yes"/"No" 等)
                                if country not in ['Yes', 'No', 'yes', 'no']:
                                    prices[country] = price
                                    print(f"    {country}: ${price:.4f}")
                        except (ValueError, TypeError):
                            pass
        
        if prices:
            print(f"✅ 从 Polymarket API 获取到 {len(prices)} 个价格\n")
            return prices
            
    except Exception as e:
        print(f"⚠️  无法从 Polymarket API 获取价格: {e}")
    
    # 备用: 手动配置的已知价格 (从我们的持仓推测市场价格)
    print("⚠️  使用备用价格数据 (需手动更新)\n")
    return {
        'Netherlands': 0.031,
        'Norway': 0.031,
        'Germany': 0.0545,
        'Portugal': 0.0704,
        'Brazil': 0.0855,
        'France': 0.12,
        'Spain': 0.11,
        'England': 0.13,
        'Argentina': 0.10,
        'Italy': 0.06
    }


def get_bookmaker_odds_manual() -> Dict[str, float]:
    """
    手动配置的博彩公司赔率 (十进制)
    优先从外部文件读取，否则使用默认值
    
    数据来源: 综合 Bet365, William Hill, Pinnacle 等主流博彩公司
    更新方法: python3 /root/openclaw/skills/intelligence/odds_updater.py
    """
    # 尝试从外部文件加载
    odds_file = "/root/openclaw/skills/intelligence/bookmaker_odds.json"
    try:
        with open(odds_file, 'r') as f:
            data = json.load(f)
            last_updated = data.get('last_updated', 'Unknown')
            print(f"📖 从文件加载赔率 (更新时间: {last_updated})\n")
            return data.get('odds', {})
    except FileNotFoundError:
        print("📋 使用默认赔率数据 (建议运行 odds_updater.py 更新)\n")
    
    # 默认赔率 (截至2026年3月)
    return {
        'Brazil': 5.5,      # 隐含概率 ~18.2%
        'France': 6.0,      # 隐含概率 ~16.7%
        'England': 7.0,     # 隐含概率 ~14.3%
        'Spain': 8.0,       # 隐含概率 ~12.5%
        'Argentina': 9.0,   # 隐含概率 ~11.1%
        'Germany': 10.0,    # 隐含概率 ~10.0%
        'Italy': 13.0,      # 隐含概率 ~7.7%
        'Netherlands': 15.0,  # 隐含概率 ~6.7%
        'Portugal': 17.0,   # 隐含概率 ~5.9%
        'Belgium': 21.0,    # 隐含概率 ~4.8%
        'Uruguay': 26.0,    # 隐含概率 ~3.8%
        'Norway': 67.0,     # 隐含概率 ~1.5%
    }


def scrape_oddsportal() -> Dict[str, float]:
    """
    尝试从 OddsPortal 抓取实时赔率
    由于反爬限制，可能需要浏览器自动化或 API 密钥
    """
    try:
        url = "https://www.oddsportal.com/football/world/world-cup-2026/outrights/"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        resp = requests.get(url, headers=headers, proxies=PROXY, timeout=15)
        
        if resp.status_code == 200 and 'odds' in resp.text.lower():
            # 简单检测是否成功
            print("✅ OddsPortal 连接成功，但需要实现 HTML 解析")
            # TODO: 实现 HTML/JSON 解析逻辑
            return {}
        else:
            print("⚠️  OddsPortal 访问受限 (Cloudflare/JS challenge)")
            return {}
            
    except Exception as e:
        print(f"❌ OddsPortal 抓取失败: {e}")
        return {}


def compare_odds() -> List[OddsComparison]:
    """
    对比博彩赔率 vs Polymarket 价格
    """
    print("📊 获取数据中...\n")
    
    # 获取数据
    bookmaker_odds = get_bookmaker_odds_manual()  # 可替换为 scrape_oddsportal()
    polymarket_prices = get_polymarket_prices()
    
    # 对比分析
    comparisons = []
    
    # 找出共同的国家
    common_countries = set(bookmaker_odds.keys()) & set(polymarket_prices.keys())
    
    for country in common_countries:
        bm_odds = bookmaker_odds[country]
        pm_price = polymarket_prices[country]
        
        bm_prob = decimal_to_probability(bm_odds) * 100  # 转为百分比
        pm_prob = pm_price * 100
        
        diff = pm_prob - bm_prob  # 正数 = PM 高估, 负数 = PM 低估
        
        comp = OddsComparison(
            country=country,
            bookmaker_odds=bm_odds,
            bookmaker_prob=bm_prob,
            polymarket_price=pm_price,
            polymarket_prob=pm_prob,
            diff_pct=diff,
            our_position=POSITIONS.get(country)
        )
        
        comparisons.append(comp)
    
    # 按差异绝对值排序
    comparisons.sort(key=lambda x: abs(x.diff_pct), reverse=True)
    
    return comparisons


def print_analysis(comparisons: List[OddsComparison]):
    """打印分析结果"""
    
    print("=" * 100)
    print("FIFA 2026 世界杯赔率套利分析".center(100))
    print("=" * 100)
    print()
    
    # 主表格
    print(f"{'国家':<12} {'博彩赔率':<10} {'博彩概率':<10} {'PM价格':<10} {'PM概率':<10} {'差异':<10} {'方向':<15} {'持仓'}")
    print("-" * 100)
    
    for comp in comparisons:
        position_str = ""
        if comp.our_position:
            pos = comp.our_position
            pnl = (comp.polymarket_price - pos['avg_price']) * pos['shares']
            position_str = f"{pos['shares']}股 @{pos['avg_price']:.3f} (P/L: ${pnl:+.2f})"
        
        # 高亮套利机会
        marker = "🔥" if comp.is_arbitrage else "  "
        
        print(f"{marker} {comp.country:<10} "
              f"{comp.bookmaker_odds:<10.2f} "
              f"{comp.bookmaker_prob:<10.2f}% "
              f"{comp.polymarket_price:<10.4f} "
              f"{comp.polymarket_prob:<10.2f}% "
              f"{comp.diff_pct:+10.2f}% "
              f"{comp.direction:<15} "
              f"{position_str}")
    
    print()
    print("=" * 100)
    
    # 套利机会总结
    arbitrage_opps = [c for c in comparisons if c.is_arbitrage]
    
    if arbitrage_opps:
        print(f"\n🎯 发现 {len(arbitrage_opps)} 个套利/错误定价机会 (差异 >2%):\n")
        
        for comp in arbitrage_opps:
            if comp.diff_pct > 2:
                # Polymarket 高估
                action = f"❌ SELL {comp.country} on PM (高估 {comp.diff_pct:.1f}%)"
                if comp.our_position:
                    action += f" - 我们有 {comp.our_position['shares']} 股，建议平仓"
            else:
                # Polymarket 低估
                action = f"✅ BUY {comp.country} on PM (低估 {abs(comp.diff_pct):.1f}%)"
                if comp.our_position:
                    action += f" - 我们有 {comp.our_position['shares']} 股，建议加仓"
                else:
                    action += " - 考虑建仓"
            
            print(f"  {action}")
    else:
        print("\n✅ 当前无明显套利机会 (所有差异 <2%)")
    
    # 我们持仓的健康度
    print("\n" + "=" * 100)
    print("我们的持仓分析".center(100))
    print("=" * 100)
    
    our_countries = [c for c in comparisons if c.our_position]
    
    if our_countries:
        total_cost = sum(c.our_position['cost'] for c in our_countries)
        total_value = sum(c.polymarket_price * c.our_position['shares'] for c in our_countries)
        total_pnl = total_value - total_cost
        
        print(f"\n总投入: ${total_cost:.2f}")
        print(f"当前市值: ${total_value:.2f}")
        print(f"未实现盈亏: ${total_pnl:+.2f} ({total_pnl/total_cost*100:+.1f}%)\n")
        
        for comp in our_countries:
            pos = comp.our_position
            current_value = comp.polymarket_price * pos['shares']
            pnl = current_value - pos['cost']
            pnl_pct = pnl / pos['cost'] * 100
            
            # 判断是否应该调整
            if comp.diff_pct > 3:
                recommendation = "🔴 强烈建议卖出 (PM严重高估)"
            elif comp.diff_pct > 2:
                recommendation = "🟡 考虑减仓 (PM轻微高估)"
            elif comp.diff_pct < -3:
                recommendation = "🟢 强烈建议加仓 (PM严重低估)"
            elif comp.diff_pct < -2:
                recommendation = "🟢 可以加仓 (PM轻微低估)"
            else:
                recommendation = "⚪ 持有观望 (价格合理)"
            
            print(f"{comp.country:<12} {pos['shares']:>3}股 @ ${pos['avg_price']:.4f}  "
                  f"市值: ${current_value:>6.2f}  P/L: ${pnl:+6.2f} ({pnl_pct:+5.1f}%)  "
                  f"{recommendation}")
    
    print("\n" + "=" * 100)
    print(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 100)


def save_json_report(comparisons: List[OddsComparison], filepath: str = None):
    """保存 JSON 格式报告"""
    if filepath is None:
        filepath = f"/root/openclaw/skills/intelligence/fifa_odds_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    data = {
        'timestamp': datetime.now().isoformat(),
        'comparisons': [
            {
                'country': c.country,
                'bookmaker_odds': c.bookmaker_odds,
                'bookmaker_prob': c.bookmaker_prob,
                'polymarket_price': c.polymarket_price,
                'polymarket_prob': c.polymarket_prob,
                'diff_pct': c.diff_pct,
                'is_arbitrage': c.is_arbitrage,
                'direction': c.direction,
                'our_position': c.our_position
            }
            for c in comparisons
        ],
        'arbitrage_opportunities': [
            {
                'country': c.country,
                'diff_pct': c.diff_pct,
                'recommendation': 'SELL' if c.diff_pct > 0 else 'BUY'
            }
            for c in comparisons if c.is_arbitrage
        ]
    }
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 JSON 报告已保存: {filepath}")


def main():
    """主函数"""
    print("\n🚀 FIFA 2026 世界杯赔率套利扫描器\n")
    
    # 执行对比分析
    comparisons = compare_odds()
    
    # 打印结果
    print_analysis(comparisons)
    
    # 保存 JSON 报告
    save_json_report(comparisons)
    
    print("\n✅ 扫描完成！")


if __name__ == '__main__':
    main()
