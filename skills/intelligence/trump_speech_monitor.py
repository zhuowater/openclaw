#!/usr/bin/env python3
"""
Trump "Third Term" 关键词监控系统 v2
追踪 Trump 在演讲和社交媒体中提到 "third term" 的频率

改进:
- 更短的超时时间
- 更详细的错误日志
- 支持部分数据源失败仍能继续
"""

import json
import re
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
from collections import defaultdict
import os
import sys

# 代理配置
PROXIES = {
    'http': 'socks5h://127.0.0.1:7880',
    'https': 'socks5h://127.0.0.1:7880'
}

# 关键词列表 (正则表达式)
KEYWORDS = [
    r'\bthird term\b',
    r'\bthree terms\b',
    r'\b12 years\b',
    r'\b2032\b',
    r'\bterm limits?\b',
    r'\brepeal.*22nd amendment\b',
    r'\b22nd amendment.*repeal\b',
]

# 通用请求头
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

class TrumpThirdTermMonitor:
    def __init__(self, verbose: bool = True):
        self.verbose = verbose
        self.results = {
            'timestamp': datetime.now().isoformat(),
            'sources': {},
            'summary': {},
            'weekly_mentions': 0,
            'total_mentions': 0,
            'keywords_breakdown': defaultdict(int),
            'trading_signal': None,
            'errors': []
        }
        
    def log(self, message: str):
        """日志输出"""
        if self.verbose:
            print(message, flush=True)
    
    def search_text(self, text: str) -> List[Dict]:
        """在文本中搜索关键词"""
        text_lower = text.lower()
        matches = []
        
        for keyword in KEYWORDS:
            pattern = re.compile(keyword, re.IGNORECASE)
            found = pattern.findall(text)
            if found:
                for match in found:
                    matches.append({
                        'keyword': keyword,
                        'match': match,
                        'context': self._extract_context(text, match)
                    })
                    self.results['keywords_breakdown'][keyword] += 1
        
        return matches
    
    def _extract_context(self, text: str, match: str, window: int = 100) -> str:
        """提取匹配词的上下文"""
        match_lower = match.lower()
        text_lower = text.lower()
        pos = text_lower.find(match_lower)
        if pos == -1:
            return ""
        
        start = max(0, pos - window)
        end = min(len(text), pos + len(match) + window)
        context = text[start:end]
        
        if start > 0:
            context = "..." + context
        if end < len(text):
            context = context + "..."
            
        return context.strip()
    
    def fetch_whitehouse_speeches(self) -> List[Dict]:
        """抓取白宫演讲"""
        self.log("📜 抓取白宫演讲...")
        speeches = []
        
        try:
            response = requests.get(
                'https://www.whitehouse.gov/briefing-room/speeches-remarks/',
                proxies=PROXIES,
                timeout=10,
                headers=HEADERS
            )
            
            if response.status_code == 200:
                content = response.text
                matches = self.search_text(content)
                
                if matches:
                    speeches.append({
                        'source': 'whitehouse',
                        'url': 'https://www.whitehouse.gov/briefing-room/speeches-remarks/',
                        'date': datetime.now().isoformat(),
                        'matches': matches,
                        'match_count': len(matches)
                    })
                    self.log(f"   ✅ 找到 {len(matches)} 个匹配")
                else:
                    self.log(f"   ➖ 无匹配")
            else:
                self.log(f"   ⚠️ HTTP {response.status_code}")
                    
        except Exception as e:
            error_msg = f"抓取白宫演讲失败: {str(e)}"
            self.log(f"   ❌ {error_msg}")
            self.results['errors'].append(error_msg)
        
        return speeches
    
    def fetch_factbase_data(self) -> List[Dict]:
        """抓取 Factbase 社交媒体数据"""
        self.log("📊 抓取 Factbase 社交媒体数据...")
        factbase_data = []
        
        try:
            # 使用 Factbase API
            response = requests.get(
                'https://rollcall.com/wp-json/factbase/v1/twitter',
                params={
                    'page': 1,
                    'per_page': 100,
                    'format': 'json',
                    'start_date': (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'),
                    'end_date': datetime.now().strftime('%Y-%m-%d')
                },
                proxies=PROXIES,
                timeout=15,
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                
                if 'data' in data and isinstance(data['data'], list):
                    self.log(f"   📥 获取到 {len(data['data'])} 条帖子")
                    
                    for post in data['data']:
                        text = post.get('text', '') or post.get('content', '')
                        if text:
                            matches = self.search_text(text)
                            
                            if matches:
                                factbase_data.append({
                                    'source': 'factbase_' + post.get('platform', 'unknown'),
                                    'url': post.get('url', ''),
                                    'date': post.get('date', ''),
                                    'text': text[:200] + '...' if len(text) > 200 else text,
                                    'matches': matches,
                                    'match_count': len(matches)
                                })
                    
                    if factbase_data:
                        self.log(f"   ✅ 找到 {len(factbase_data)} 条有匹配的帖子")
                    else:
                        self.log(f"   ➖ 无匹配")
                else:
                    self.log(f"   ⚠️ 响应格式异常")
            else:
                self.log(f"   ⚠️ HTTP {response.status_code}")
                    
        except Exception as e:
            error_msg = f"抓取 Factbase 数据失败: {str(e)}"
            self.log(f"   ❌ {error_msg}")
            self.results['errors'].append(error_msg)
        
        return factbase_data
    
    def search_web_for_trump_speeches(self) -> List[Dict]:
        """通过 web 搜索查找最近的 Trump 演讲"""
        self.log("🔍 搜索最近 Trump 演讲...")
        speeches = []
        
        # 可以通过 Google News 或其他新闻聚合器搜索
        # 这里使用简化的方法：直接搜索一些已知的新闻源
        
        known_sources = [
            'https://www.c-span.org/person/?DonaldTrump',
            'https://www.rev.com/blog/transcript-tag/donald-trump-transcripts',
        ]
        
        for url in known_sources:
            try:
                self.log(f"   检查 {url}...")
                response = requests.get(
                    url,
                    proxies=PROXIES,
                    timeout=10,
                    headers=HEADERS
                )
                
                if response.status_code == 200:
                    matches = self.search_text(response.text)
                    
                    if matches:
                        speeches.append({
                            'source': 'web_search',
                            'url': url,
                            'date': datetime.now().isoformat(),
                            'matches': matches,
                            'match_count': len(matches)
                        })
                        self.log(f"      ✅ 找到 {len(matches)} 个匹配")
                        
            except Exception as e:
                self.log(f"      ⚠️ 跳过 {url}: {str(e)}")
                continue
        
        return speeches
    
    def fetch_polymarket_price(self) -> Dict:
        """获取 Polymarket "Third Term" 市场价格"""
        self.log("💰 获取 Polymarket 价格...")
        
        try:
            # 搜索活跃市场
            response = requests.get(
                'https://gamma-api.polymarket.com/markets',
                params={
                    'limit': 200,  # 增加搜索范围
                    'offset': 0,
                    'active': 'true',
                    'archived': 'false'
                },
                proxies=PROXIES,
                timeout=10
            )
            
            if response.status_code == 200:
                markets = response.json()
                
                # 优先搜索 "third term" 关键词
                third_term_markets = []
                
                for market in markets:
                    question = market.get('question', '').lower()
                    description = market.get('description', '').lower()
                    
                    # 严格匹配 "third term" 相关市场
                    if 'third term' in question or 'third term' in description:
                        third_term_markets.append(market)
                    # 次优: Trump + (term OR 2032)
                    elif 'trump' in question and ('term' in question or '2032' in question):
                        # 排除明确是 second term 的市场
                        if 'second term' not in question and '2021' not in question and '2025' not in question:
                            third_term_markets.append(market)
                
                # 如果找到多个市场，优先选择 end_date 最晚的（最相关）
                if third_term_markets:
                    # 按 end date 排序
                    third_term_markets.sort(
                        key=lambda m: m.get('endDate', ''),
                        reverse=True
                    )
                    
                    market = third_term_markets[0]
                    
                    # outcomePrices 可能是字符串或列表
                    outcome_prices = market.get('outcomePrices', ['0', '0'])
                    
                    # 如果是字符串，尝试解析为列表
                    if isinstance(outcome_prices, str):
                        import ast
                        try:
                            outcome_prices = ast.literal_eval(outcome_prices)
                        except:
                            outcome_prices = ['0', '0']
                    
                    yes_price = float(outcome_prices[0]) if len(outcome_prices) > 0 else 0.0
                    no_price = float(outcome_prices[1]) if len(outcome_prices) > 1 else 0.0
                    
                    self.log(f"   ✅ 找到市场: {market.get('question')}")
                    self.log(f"      YES: ${yes_price:.2f}, NO: ${no_price:.2f}")
                    self.log(f"      结束日期: {market.get('endDate', 'N/A')}")
                    
                    return {
                        'market_slug': market.get('slug'),
                        'question': market.get('question'),
                        'yes_price': yes_price,
                        'no_price': no_price,
                        'volume': market.get('volume'),
                        'liquidity': market.get('liquidity'),
                        'end_date': market.get('endDate')
                    }
                
                self.log(f"   ⚠️ 未找到 'third term' 相关市场 (搜索了 {len(markets)} 个市场)")
            else:
                self.log(f"   ⚠️ HTTP {response.status_code}")
                        
        except Exception as e:
            error_msg = f"获取 Polymarket 价格失败: {str(e)}"
            self.log(f"   ❌ {error_msg}")
            self.results['errors'].append(error_msg)
        
        return {}
    
    def generate_trading_signal(self, weekly_mentions: int, current_price: float) -> Dict:
        """生成交易信号
        
        当前持仓: 5 shares YES @ $0.46
        现价: $0.38
        到期: 2026年3月31日
        """
        
        position = {
            'shares': 5,
            'entry_price': 0.46,
            'current_price': current_price,
            'unrealized_pnl': 5 * (current_price - 0.46),
            'unrealized_pnl_pct': ((current_price - 0.46) / 0.46) * 100
        }
        
        signal = {
            'position': position,
            'recommendation': None,
            'reasoning': [],
            'risk_level': 'MEDIUM',
            'action_items': []
        }
        
        # 计算距到期天数
        days_to_expiry = (datetime(2026, 3, 31) - datetime.now()).days
        
        # 决策逻辑
        if weekly_mentions == 0:
            signal['recommendation'] = '🔴 减仓 50% 或止损'
            signal['reasoning'].append(f'⚠️ 本周零提及，论点显著弱化')
            signal['reasoning'].append(f'💀 距到期 {days_to_expiry} 天，时间价值快速衰减')
            signal['action_items'].append('卖出 2-3 shares，保留 2-3 shares 作为彩票仓位')
            signal['risk_level'] = 'HIGH'
            
        elif weekly_mentions >= 5:
            signal['recommendation'] = '🟢 持有或小幅加仓'
            signal['reasoning'].append(f'✅ 本周 {weekly_mentions} 次提及，论点显著增强')
            if current_price < 0.40:
                signal['reasoning'].append(f'💡 当前价格 ${current_price:.2f} 具有吸引力')
                signal['action_items'].append('可考虑加仓 2-3 shares @ ${current_price:.2f}')
            else:
                signal['action_items'].append('继续持有，观察下周数据')
            signal['risk_level'] = 'LOW'
            
        elif weekly_mentions >= 2:
            signal['recommendation'] = '🟡 继续持有'
            signal['reasoning'].append(f'➡️ 本周 {weekly_mentions} 次提及，保持中性')
            signal['reasoning'].append(f'⏳ 距到期 {days_to_expiry} 天，还有时间观察')
            signal['action_items'].append('保持当前持仓不变')
            signal['risk_level'] = 'MEDIUM'
            
        else:  # 1 次提及
            signal['recommendation'] = '🟡 谨慎持有'
            signal['reasoning'].append(f'⚠️ 本周仅 {weekly_mentions} 次提及，论点偏弱')
            signal['reasoning'].append(f'⏰ 距到期 {days_to_expiry} 天，需密切关注')
            signal['action_items'].append('设置止损位: 如跌破 $0.30 则减仓')
            signal['risk_level'] = 'MEDIUM'
        
        # 价格考量
        if current_price < 0.30:
            signal['reasoning'].append(f'🚨 价格已跌至 ${current_price:.2f}，严重超跌')
            signal['reasoning'].append(f'⚡ 要么是市场错误定价（抄底机会），要么是根本性利空')
        elif current_price > 0.55:
            signal['reasoning'].append(f'📈 价格反弹至 ${current_price:.2f}，考虑部分止盈')
            signal['action_items'].append('价格 >$0.60 时可卖出 2-3 shares 锁定利润')
        
        # 时间价值警告
        if days_to_expiry < 21:
            signal['reasoning'].append(f'⏰⏰⏰ 仅剩 {days_to_expiry} 天到期！时间价值快速归零')
            signal['risk_level'] = 'HIGH'
        elif days_to_expiry < 30:
            signal['reasoning'].append(f'⏰ 距到期 {days_to_expiry} 天，时间压力增加')
        
        # 盈亏状态评估
        if position['unrealized_pnl_pct'] < -30:
            signal['reasoning'].append(f'💸 当前亏损 {abs(position["unrealized_pnl_pct"]):.1f}%，已触发风险阈值')
            if weekly_mentions < 2:
                signal['action_items'].append('强烈建议止损，避免继续扩大损失')
        
        return signal
    
    def run(self) -> Dict:
        """运行完整监控流程"""
        self.log("=" * 60)
        self.log("🔍 Trump 'Third Term' 关键词监控系统")
        self.log("=" * 60)
        
        all_data = []
        
        # 抓取各数据源 (允许部分失败)
        all_data.extend(self.fetch_whitehouse_speeches())
        all_data.extend(self.fetch_factbase_data())
        all_data.extend(self.search_web_for_trump_speeches())
        
        # 统计提及次数
        self.results['total_mentions'] = sum(item['match_count'] for item in all_data)
        self.results['weekly_mentions'] = self.results['total_mentions']
        
        # 按来源分组
        by_source = defaultdict(list)
        for item in all_data:
            by_source[item['source']].append(item)
        
        self.results['sources'] = dict(by_source)
        
        # 获取市场价格
        market_data = self.fetch_polymarket_price()
        self.results['market_data'] = market_data
        
        # 生成交易信号
        current_price = market_data.get('yes_price', 0.38)  # 默认当前价 $0.38
        self.results['trading_signal'] = self.generate_trading_signal(
            self.results['weekly_mentions'],
            current_price
        )
        
        # 生成摘要
        self.results['summary'] = {
            'sources_checked': 3,  # whitehouse, factbase, web search
            'sources_with_matches': len(by_source),
            'total_mentions': self.results['total_mentions'],
            'weekly_mentions': self.results['weekly_mentions'],
            'top_keywords': sorted(
                self.results['keywords_breakdown'].items(),
                key=lambda x: x[1],
                reverse=True
            )[:5],
            'errors_count': len(self.results['errors'])
        }
        
        return self.results
    
    def print_report(self):
        """打印人类可读的报告"""
        self.log("\n" + "=" * 60)
        self.log("📊 监控报告")
        self.log("=" * 60)
        
        summary = self.results['summary']
        self.log(f"\n📅 时间: {self.results['timestamp']}")
        self.log(f"🔍 数据源: {summary['sources_checked']} 个")
        self.log(f"✅ 有匹配的源: {summary['sources_with_matches']} 个")
        self.log(f"📈 本周提及: {summary['weekly_mentions']} 次")
        self.log(f"📊 总计提及: {summary['total_mentions']} 次")
        
        if self.results['errors']:
            self.log(f"⚠️ 错误: {summary['errors_count']} 个")
        
        if summary['top_keywords']:
            self.log(f"\n🔑 热门关键词:")
            for keyword, count in summary['top_keywords']:
                self.log(f"   • {keyword}: {count} 次")
        
        # 详细匹配
        if self.results['sources']:
            self.log(f"\n📝 详细匹配:")
            for source, items in self.results['sources'].items():
                self.log(f"\n   {source}:")
                for item in items:
                    self.log(f"      • {item.get('date', 'N/A')}: {item['match_count']} 个匹配")
                    if item.get('text'):
                        self.log(f"        {item['text'][:100]}...")
        
        # 市场数据
        if self.results.get('market_data'):
            market = self.results['market_data']
            self.log(f"\n💰 Polymarket 市场:")
            self.log(f"   问题: {market.get('question', 'N/A')}")
            self.log(f"   YES 价格: ${market.get('yes_price', 0):.2f}")
            self.log(f"   NO 价格: ${market.get('no_price', 0):.2f}")
            self.log(f"   成交量: ${float(market.get('volume', 0)):,.0f}")
        
        # 交易信号 (重点部分)
        if self.results.get('trading_signal'):
            signal = self.results['trading_signal']
            position = signal['position']
            
            self.log(f"\n💼 持仓状态:")
            self.log(f"   持仓: {position['shares']} shares @ ${position['entry_price']:.2f}")
            self.log(f"   现价: ${position['current_price']:.2f}")
            
            pnl_color = '🟢' if position['unrealized_pnl'] >= 0 else '🔴'
            self.log(f"   未实现盈亏: {pnl_color} ${position['unrealized_pnl']:.2f} ({position['unrealized_pnl_pct']:.1f}%)")
            
            self.log(f"\n🎯 交易建议:")
            self.log(f"   {signal['recommendation']}")
            self.log(f"   风险等级: {signal['risk_level']}")
            
            self.log(f"\n   📋 理由:")
            for reason in signal['reasoning']:
                self.log(f"      {reason}")
            
            if signal['action_items']:
                self.log(f"\n   ✅ 行动建议:")
                for action in signal['action_items']:
                    self.log(f"      • {action}")
        
        self.log("\n" + "=" * 60)
    
    def save_report(self, filepath: str = None):
        """保存 JSON 报告"""
        if filepath is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filepath = f'/root/openclaw/skills/intelligence/trump_third_term_report_{timestamp}.json'
        
        # 转换 defaultdict 为普通 dict
        output = dict(self.results)
        output['keywords_breakdown'] = dict(output['keywords_breakdown'])
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False, default=str)
        
        self.log(f"\n💾 报告已保存: {filepath}")
        return filepath


def main():
    """主函数"""
    monitor = TrumpThirdTermMonitor(verbose=True)
    
    try:
        monitor.run()
        monitor.print_report()
        report_path = monitor.save_report()
        
        print(f"\n✅ 监控完成!")
        print(f"📄 完整报告: {report_path}")
        
        return 0
        
    except KeyboardInterrupt:
        print(f"\n⚠️ 用户中断")
        return 130
        
    except Exception as e:
        print(f"\n❌ 监控失败: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
