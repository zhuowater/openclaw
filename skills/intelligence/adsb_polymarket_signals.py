#!/usr/bin/env python3
"""
ADS-B + Polymarket 集成示例
根据 ADS-B 军事航班数据生成交易信号
"""

import json
import sys
from pathlib import Path

# 读取 ADS-B 监控结果
ADSB_REPORT = Path('/tmp/adsb_latest.json')

def analyze_adsb_signals():
    """分析 ADS-B 数据生成交易信号"""
    
    if not ADSB_REPORT.exists():
        print("❌ 未找到 ADS-B 报告，请先运行 adsb_monitor.py", file=sys.stderr)
        return None
    
    with open(ADSB_REPORT) as f:
        report = json.load(f)
    
    threat_score = report['threat_assessment']['score']
    threat_level = report['threat_assessment']['level']
    me_aircraft = report['military_activity']['middle_east_region']
    iran_civilian = report['iran_airspace']['civilian_flights_over_iran']
    
    # 交易信号逻辑
    signals = []
    
    # 信号 1: 高威胁 → 买入 "US strikes Iran" YES
    if threat_score >= 70:
        signals.append({
            'market': 'us-strikes-iran',
            'side': 'YES',
            'confidence': 'HIGH',
            'reason': f'威胁评分 {threat_score}/100，军机活动异常',
            'size_pct': 10,  # 仓位百分比
        })
    elif threat_score >= 50:
        signals.append({
            'market': 'us-strikes-iran',
            'side': 'YES',
            'confidence': 'MEDIUM',
            'reason': f'威胁评分 {threat_score}/100，中等风险',
            'size_pct': 5,
        })
    
    # 信号 2: 伊朗民航骤减 → 短期冲突风险
    if iran_civilian < 5:
        signals.append({
            'market': 'iran-conflict-escalation',
            'side': 'YES',
            'confidence': 'HIGH',
            'reason': f'伊朗领空仅 {iran_civilian} 架民航，可能绕飞',
            'size_pct': 8,
        })
    
    # 信号 3: 中东军机密集 → 军事行动准备
    if me_aircraft > 15:
        signals.append({
            'market': 'middle-east-military-action',
            'side': 'YES',
            'confidence': 'HIGH',
            'reason': f'中东地区 {me_aircraft} 架军机，异常密集',
            'size_pct': 12,
        })
    
    # 反向信号: 低威胁 → 卖出或持观望
    if threat_score < 20 and iran_civilian > 30:
        signals.append({
            'market': 'iran-conflict',
            'side': 'NO',
            'confidence': 'LOW',
            'reason': '军事活动正常，短期冲突概率低',
            'size_pct': 3,
        })
    
    return {
        'timestamp': report['timestamp'],
        'adsb_threat_score': threat_score,
        'adsb_threat_level': threat_level,
        'signals': signals,
        'raw_metrics': {
            'middle_east_aircraft': me_aircraft,
            'iran_civilian_flights': iran_civilian,
            'base_activity': report['military_activity']['base_activity'],
        }
    }


def main():
    """主函数"""
    result = analyze_adsb_signals()
    
    if not result:
        sys.exit(1)
    
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    # 打印简要信号
    print("\n📊 交易信号摘要:", file=sys.stderr)
    print(f"🎯 威胁评分: {result['adsb_threat_score']}/100 ({result['adsb_threat_level']})", file=sys.stderr)
    print(f"📡 信号数量: {len(result['signals'])}", file=sys.stderr)
    
    if result['signals']:
        print("\n🔔 活跃信号:", file=sys.stderr)
        for sig in result['signals']:
            print(f"   • {sig['market']}: {sig['side']} ({sig['confidence']}) - {sig['reason']}", file=sys.stderr)
            print(f"     建议仓位: {sig['size_pct']}%", file=sys.stderr)
    else:
        print("\n🔕 无活跃信号，保持观望", file=sys.stderr)


if __name__ == '__main__':
    main()
