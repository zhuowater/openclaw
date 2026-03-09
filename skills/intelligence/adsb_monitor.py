#!/usr/bin/env python3
"""
ADS-B Military Flight Monitor
监控美国→中东的军事运输机航班

数据源: OpenSky Network API (免费层)
代理: socks5h://127.0.0.1:7880
"""

import json
import sys
import time
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# SOCKS5 代理配置 (可通过环境变量禁用)
USE_PROXY = os.environ.get('ADSB_USE_PROXY', 'true').lower() in ('true', '1', 'yes')
PROXY = {
    'http': 'socks5h://127.0.0.1:7880',
    'https': 'socks5h://127.0.0.1:7880'
} if USE_PROXY else None

# OpenSky Network API 端点
OPENSKY_BASE = "https://opensky-network.org/api"

# 军用运输机型号 (通过 callsign 前缀识别)
MILITARY_CALLSIGNS = [
    'RCH',      # Reach (AMC - Air Mobility Command)
    'CMB',      # Convoy (AMC)
    'PACK',     # Pack (AMC)
    'EVAC',     # Evac (AMC)
    'SPAR',     # Special Air Resources (USAF VIP)
    'SAM',      # Special Air Mission (Air Force One when active)
    'CNV',      # Convoy
    'NAVY',     # US Navy
    'BOXER',    # US Navy
    'VADER',    # USAF special ops
    'BLUE',     # USAF
    'RED',      # USAF
    'GUNR',     # Gunrunner (AMC)
    'TREK',     # Trek (AMC)
    'GOLD',     # USAF
]

# 关键空军基地 (名称, 纬度, 经度, 半径km)
KEY_BASES = {
    'Dover AFB': (39.13, -75.47, 50),
    'Travis AFB': (38.26, -121.93, 50),
    'Ramstein': (49.44, 7.60, 50),
    'Al Udeid Qatar': (25.12, 51.31, 80),
    'Bahrain': (26.27, 50.63, 60),
    'Incirlik Turkey': (37.00, 35.43, 50),
    'Ali Al Salem Kuwait': (29.35, 47.52, 60),
}

# 中东关注区域 (用于检测活动增加)
MIDDLE_EAST_BOX = {
    'lamin': 12.0,   # 南边界
    'lamax': 42.0,   # 北边界
    'lomin': 34.0,   # 西边界 (红海)
    'lomax': 63.0,   # 东边界 (阿曼湾)
}

# 伊朗领空 (用于检测绕飞模式)
IRAN_AIRSPACE = {
    'lamin': 25.0,
    'lamax': 40.0,
    'lomin': 44.0,
    'lomax': 64.0,
}


def get_session() -> requests.Session:
    """创建带重试机制的 requests session"""
    session = requests.Session()
    if PROXY:
        session.proxies = PROXY
        print(f"🔐 使用代理: {PROXY['https']}", file=sys.stderr)
    else:
        print("⚠️  直连模式 (无代理)", file=sys.stderr)
    
    retry_strategy = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    
    return session


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """计算两点间距离 (km)"""
    from math import radians, sin, cos, sqrt, atan2
    
    R = 6371  # 地球半径 km
    
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c


def is_near_base(lat: float, lon: float, base_coords: Tuple[float, float, float]) -> bool:
    """检查坐标是否在基地附近"""
    base_lat, base_lon, radius = base_coords
    return haversine_distance(lat, lon, base_lat, base_lon) <= radius


def is_in_box(lat: float, lon: float, box: Dict[str, float]) -> bool:
    """检查坐标是否在矩形区域内"""
    return (box['lamin'] <= lat <= box['lamax'] and 
            box['lomin'] <= lon <= box['lomax'])


def fetch_states(session: requests.Session, bbox: Optional[Dict[str, float]] = None) -> List[List]:
    """
    获取当前航班状态
    
    Args:
        session: requests session
        bbox: 边界框参数 (lamin, lamax, lomin, lomax)
    
    Returns:
        航班状态列表
    """
    url = f"{OPENSKY_BASE}/states/all"
    params = bbox if bbox else {}
    
    try:
        response = session.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if data and 'states' in data and data['states']:
            return data['states']
        return []
    
    except requests.exceptions.RequestException as e:
        print(f"⚠️  API 请求失败: {e}", file=sys.stderr)
        return []


def analyze_military_flights(states: List[List]) -> Dict:
    """分析军事航班数据"""
    military_flights = []
    flights_near_bases = {base: [] for base in KEY_BASES}
    flights_in_middle_east = []
    
    for state in states:
        # OpenSky state vector 索引:
        # [0]=icao24, [1]=callsign, [2]=origin_country, [5]=longitude, 
        # [6]=latitude, [7]=baro_altitude, [8]=on_ground, [9]=velocity
        
        icao24 = state[0]
        callsign = state[1].strip() if state[1] else None
        origin = state[2]
        lon = state[5]
        lat = state[6]
        altitude = state[7]  # meters
        on_ground = state[8]
        velocity = state[9]  # m/s
        
        # 跳过地面航班和无位置数据的航班
        if on_ground or lat is None or lon is None:
            continue
        
        # 检查是否为军事航班 (通过 callsign 前缀)
        is_military = False
        if callsign:
            for prefix in MILITARY_CALLSIGNS:
                if callsign.startswith(prefix):
                    is_military = True
                    break
        
        # 美国军机通常注册在 United States
        if origin == "United States" and callsign and len(callsign) >= 3:
            # 美军航班通常有特定 callsign 格式
            is_military = True
        
        if is_military:
            flight_info = {
                'icao24': icao24,
                'callsign': callsign,
                'origin': origin,
                'position': [lat, lon],
                'altitude_m': altitude,
                'altitude_ft': int(altitude * 3.28084) if altitude else None,
                'velocity_kts': int(velocity * 1.94384) if velocity else None,
            }
            military_flights.append(flight_info)
            
            # 检查是否靠近关键基地
            for base_name, base_coords in KEY_BASES.items():
                if is_near_base(lat, lon, base_coords):
                    flights_near_bases[base_name].append(flight_info)
            
            # 检查是否在中东区域
            if is_in_box(lat, lon, MIDDLE_EAST_BOX):
                flights_in_middle_east.append(flight_info)
    
    return {
        'total_military': len(military_flights),
        'military_flights': military_flights,
        'flights_near_bases': {k: v for k, v in flights_near_bases.items() if v},
        'flights_in_middle_east': flights_in_middle_east,
    }


def check_iran_airspace_avoidance(session: requests.Session) -> Dict:
    """
    检查民航是否绕飞伊朗领空
    
    通过统计伊朗领空内的航班数量来判断是否有异常绕飞模式
    """
    states = fetch_states(session, IRAN_AIRSPACE)
    
    # 统计不同类型的航班
    total_flights = len(states)
    civilian_flights = 0
    altitudes = []
    
    for state in states:
        callsign = state[1].strip() if state[1] else ""
        altitude = state[7]
        on_ground = state[8]
        
        if not on_ground and altitude:
            altitudes.append(altitude)
            
            # 判断是否为民航 (callsign 通常是航空公司代码+数字)
            is_civilian = True
            for prefix in MILITARY_CALLSIGNS:
                if callsign.startswith(prefix):
                    is_civilian = False
                    break
            
            if is_civilian:
                civilian_flights += 1
    
    avg_altitude = sum(altitudes) / len(altitudes) if altitudes else 0
    
    return {
        'total_flights_over_iran': total_flights,
        'civilian_flights_over_iran': civilian_flights,
        'avg_altitude_m': int(avg_altitude),
        'avg_altitude_ft': int(avg_altitude * 3.28084),
        'note': '正常情况下伊朗领空有大量民航过境。数量骤减可能表示紧张局势。'
    }


def generate_intelligence_summary(military_data: Dict, iran_data: Dict) -> Dict:
    """生成情报摘要"""
    from datetime import datetime, timezone
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # 计算威胁指数 (0-100)
    threat_score = 0
    threat_factors = []
    
    # 中东地区军机数量
    me_count = len(military_data['flights_in_middle_east'])
    if me_count > 10:
        threat_score += 30
        threat_factors.append(f"中东地区发现 {me_count} 架军机 (高)")
    elif me_count > 5:
        threat_score += 15
        threat_factors.append(f"中东地区发现 {me_count} 架军机 (中)")
    
    # 关键基地活动
    base_activity = sum(len(v) for v in military_data['flights_near_bases'].values())
    if base_activity > 8:
        threat_score += 25
        threat_factors.append(f"关键基地周边活动频繁 ({base_activity} 架次)")
    elif base_activity > 4:
        threat_score += 10
        threat_factors.append(f"关键基地周边有活动 ({base_activity} 架次)")
    
    # 伊朗领空民航绕飞检测
    if iran_data['civilian_flights_over_iran'] < 10:
        threat_score += 35
        threat_factors.append(f"伊朗领空民航稀少 ({iran_data['civilian_flights_over_iran']} 架) - 可能绕飞")
    elif iran_data['civilian_flights_over_iran'] < 20:
        threat_score += 15
        threat_factors.append(f"伊朗领空民航减少 ({iran_data['civilian_flights_over_iran']} 架)")
    
    # 威胁等级
    if threat_score >= 60:
        threat_level = "HIGH"
        threat_color = "🔴"
    elif threat_score >= 30:
        threat_level = "MEDIUM"
        threat_color = "🟡"
    else:
        threat_level = "LOW"
        threat_color = "🟢"
    
    summary = {
        'timestamp': timestamp,
        'threat_assessment': {
            'level': threat_level,
            'score': threat_score,
            'emoji': threat_color,
            'factors': threat_factors,
        },
        'military_activity': {
            'total_military_aircraft': military_data['total_military'],
            'middle_east_region': me_count,
            'base_activity': {
                base: len(flights) 
                for base, flights in military_data['flights_near_bases'].items()
            },
        },
        'iran_airspace': iran_data,
        'notable_flights': military_data['flights_in_middle_east'][:10],  # Top 10
        'data_source': 'OpenSky Network API',
        'limitations': [
            '免费 API 仅显示当前状态，无历史趋势',
            '军用飞机可能关闭 ADS-B 转发器',
            '数据延迟 10-15 秒',
        ]
    }
    
    return summary


def main():
    """主函数"""
    print("🛰️  启动 ADS-B 军事航班监控...", file=sys.stderr)
    
    session = get_session()
    
    # 1. 获取中东地区航班数据
    print("📡 查询中东地区航班...", file=sys.stderr)
    middle_east_states = fetch_states(session, MIDDLE_EAST_BOX)
    
    if not middle_east_states:
        print("⚠️  未能获取中东地区数据，尝试全球查询...", file=sys.stderr)
        middle_east_states = fetch_states(session)
    
    # 2. 分析军事航班
    print(f"✅ 获取到 {len(middle_east_states)} 个航班状态", file=sys.stderr)
    military_data = analyze_military_flights(middle_east_states)
    
    # 3. 检查伊朗领空绕飞情况
    print("🌍 检查伊朗领空民航模式...", file=sys.stderr)
    iran_data = check_iran_airspace_avoidance(session)
    
    # 4. 生成情报摘要
    summary = generate_intelligence_summary(military_data, iran_data)
    
    # 5. 输出 JSON
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    
    # 6. 打印简要报告到 stderr
    print("\n" + "="*60, file=sys.stderr)
    print(f"🎯 威胁评估: {summary['threat_assessment']['emoji']} {summary['threat_assessment']['level']} (评分: {summary['threat_assessment']['score']}/100)", file=sys.stderr)
    print(f"✈️  军机总数: {summary['military_activity']['total_military_aircraft']}", file=sys.stderr)
    print(f"🎖️  中东地区: {summary['military_activity']['middle_east_region']} 架", file=sys.stderr)
    print(f"🏢 关键基地活动:", file=sys.stderr)
    for base, count in summary['military_activity']['base_activity'].items():
        print(f"   - {base}: {count} 架", file=sys.stderr)
    print(f"🇮🇷 伊朗领空民航: {iran_data['civilian_flights_over_iran']} 架", file=sys.stderr)
    
    if summary['threat_assessment']['factors']:
        print(f"\n⚠️  威胁因素:", file=sys.stderr)
        for factor in summary['threat_assessment']['factors']:
            print(f"   - {factor}", file=sys.stderr)
    
    print("="*60, file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⏹️  监控中断", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ 错误: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
