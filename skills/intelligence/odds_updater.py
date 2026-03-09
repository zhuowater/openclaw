#!/usr/bin/env python3
"""
FIFA 2026 World Cup Odds Data Updater
用于手动更新博彩公司赔率数据
"""

import json
import sys
from datetime import datetime

ODDS_FILE = "/root/openclaw/skills/intelligence/bookmaker_odds.json"

# 默认赔率数据
DEFAULT_ODDS = {
    "last_updated": None,
    "source": "Manual entry - composite of Bet365, William Hill, Pinnacle",
    "odds": {
        'Brazil': 5.5,
        'France': 6.0,
        'England': 7.0,
        'Spain': 8.0,
        'Argentina': 9.0,
        'Germany': 10.0,
        'Italy': 13.0,
        'Netherlands': 15.0,
        'Portugal': 17.0,
        'Belgium': 21.0,
        'Uruguay': 26.0,
        'Norway': 67.0,
    }
}


def load_odds():
    """加载当前赔率数据"""
    try:
        with open(ODDS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return DEFAULT_ODDS.copy()


def save_odds(odds_data):
    """保存赔率数据"""
    odds_data['last_updated'] = datetime.now().isoformat()
    with open(ODDS_FILE, 'w') as f:
        json.dump(odds_data, f, indent=2)
    print(f"✅ 赔率数据已保存到 {ODDS_FILE}")


def update_single_odds(country, odds):
    """更新单个国家的赔率"""
    data = load_odds()
    data['odds'][country] = float(odds)
    save_odds(data)
    print(f"✅ {country} 赔率更新为 {odds}")


def update_batch_odds(updates):
    """批量更新赔率"""
    data = load_odds()
    for country, odds in updates.items():
        data['odds'][country] = float(odds)
    save_odds(data)
    print(f"✅ 批量更新了 {len(updates)} 个国家的赔率")


def display_current_odds():
    """显示当前赔率"""
    data = load_odds()
    print(f"\n📊 当前博彩赔率 (最后更新: {data.get('last_updated', 'Never')})")
    print(f"数据源: {data.get('source', 'Unknown')}\n")
    print(f"{'国家':<15} {'十进制赔率':<12} {'隐含概率'}")
    print("-" * 50)
    
    for country, odds in sorted(data['odds'].items(), key=lambda x: x[1]):
        prob = (1.0 / odds) * 100
        print(f"{country:<15} {odds:<12.2f} {prob:>6.2f}%")
    print()


def main():
    if len(sys.argv) == 1:
        # 无参数: 显示当前赔率
        display_current_odds()
        print("使用方法:")
        print("  更新单个: python3 odds_updater.py Brazil 5.5")
        print("  批量更新: python3 odds_updater.py --batch Brazil=5.5 France=6.0 Spain=8.0")
        print("  重置默认: python3 odds_updater.py --reset")
        return
    
    if sys.argv[1] == '--reset':
        # 重置为默认值
        save_odds(DEFAULT_ODDS.copy())
        print("✅ 赔率数据已重置为默认值")
        display_current_odds()
        return
    
    if sys.argv[1] == '--batch':
        # 批量更新
        updates = {}
        for arg in sys.argv[2:]:
            try:
                country, odds = arg.split('=')
                updates[country] = float(odds)
            except ValueError:
                print(f"⚠️  跳过无效参数: {arg} (格式应为 Country=Odds)")
        
        if updates:
            update_batch_odds(updates)
            display_current_odds()
        else:
            print("❌ 没有有效的更新数据")
        return
    
    if len(sys.argv) == 3:
        # 单个更新
        country = sys.argv[1]
        try:
            odds = float(sys.argv[2])
            update_single_odds(country, odds)
            display_current_odds()
        except ValueError:
            print(f"❌ 错误: 赔率必须是数字 (得到: {sys.argv[2]})")
            sys.exit(1)
        return
    
    print("❌ 参数错误")
    print("使用方法:")
    print("  显示当前: python3 odds_updater.py")
    print("  更新单个: python3 odds_updater.py Brazil 5.5")
    print("  批量更新: python3 odds_updater.py --batch Brazil=5.5 France=6.0")
    sys.exit(1)


if __name__ == '__main__':
    main()
