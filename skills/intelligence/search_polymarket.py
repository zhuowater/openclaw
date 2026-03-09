#!/usr/bin/env python3
"""
Polymarket 市场搜索工具
用于手动查找 Trump "Third Term" 市场
"""

import requests
import json
import sys

PROXIES = {
    'http': 'socks5h://127.0.0.1:7880',
    'https': 'socks5h://127.0.0.1:7880'
}

def search_markets(keyword: str = 'trump', active_only: bool = True):
    """搜索 Polymarket 市场"""
    
    params = {
        'limit': 200,
        'offset': 0
    }
    
    if active_only:
        params['active'] = 'true'
        params['archived'] = 'false'
    
    try:
        response = requests.get(
            'https://gamma-api.polymarket.com/markets',
            params=params,
            proxies=PROXIES,
            timeout=15
        )
        
        if response.status_code == 200:
            markets = response.json()
            
            keyword_lower = keyword.lower()
            matches = []
            
            for market in markets:
                question = market.get('question', '')
                description = market.get('description', '')
                
                if keyword_lower in question.lower() or keyword_lower in description.lower():
                    matches.append({
                        'question': question,
                        'slug': market.get('slug'),
                        'yes_price': market.get('outcomePrices', ['N/A', 'N/A'])[0],
                        'no_price': market.get('outcomePrices', ['N/A', 'N/A'])[1],
                        'volume': market.get('volume'),
                        'end_date': market.get('endDate'),
                        'active': market.get('active')
                    })
            
            return matches
        else:
            print(f"❌ HTTP {response.status_code}")
            return []
            
    except Exception as e:
        print(f"❌ 错误: {e}")
        return []


def main():
    keyword = sys.argv[1] if len(sys.argv) > 1 else 'trump'
    
    print(f"🔍 搜索关键词: '{keyword}'")
    print("=" * 60)
    
    markets = search_markets(keyword)
    
    if markets:
        print(f"\n✅ 找到 {len(markets)} 个市场:\n")
        
        for i, market in enumerate(markets, 1):
            print(f"{i}. {market['question']}")
            print(f"   Slug: {market['slug']}")
            print(f"   YES: {market['yes_price']}, NO: {market['no_price']}")
            print(f"   Volume: ${float(market['volume'] or 0):,.0f}")
            print(f"   End: {market['end_date']}")
            print(f"   Active: {market['active']}")
            print()
    else:
        print(f"\n⚠️ 未找到包含 '{keyword}' 的市场")
    
    # 特别搜索 "third term"
    if keyword != 'third term':
        print("\n" + "=" * 60)
        print("🔍 额外搜索: 'third term'")
        print("=" * 60)
        
        third_term_markets = search_markets('third term')
        
        if third_term_markets:
            print(f"\n✅ 找到 {len(third_term_markets)} 个 'third term' 市场:\n")
            
            for i, market in enumerate(third_term_markets, 1):
                print(f"{i}. {market['question']}")
                print(f"   YES: {market['yes_price']}, NO: {market['no_price']}")
                print(f"   Volume: ${float(market['volume'] or 0):,.0f}")
                print()


if __name__ == '__main__':
    main()
