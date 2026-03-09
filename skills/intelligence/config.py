#!/usr/bin/env python3
"""
Trump "Third Term" 监控配置文件
用于手动配置市场信息和监控参数
"""

# Polymarket 市场配置
MARKET_CONFIG = {
    # 如果自动搜索失败，使用这个配置
    'manual': {
        'enabled': True,  # 是否使用手动配置
        'market_slug': 'will-trump-serve-a-third-term',  # 市场 slug (URL 中的部分)
        'question': 'Will Trump serve a third term as President?',
        'yes_price': 0.38,  # 手动更新: 最后已知价格
        'no_price': 0.62,
        'end_date': '2026-03-31T23:59:59Z',
        'last_updated': '2026-03-03T23:00:00Z'
    },
    
    # API 配置
    'api': {
        'use_gamma': True,  # 尝试使用 Gamma API
        'use_clob': False,  # 是否尝试 CLOB API (需要认证)
        'timeout': 10,  # API 超时时间 (秒)
        'fallback_to_manual': True  # API 失败时回退到手动配置
    }
}

# 监控配置
MONITOR_CONFIG = {
    # 持仓信息 (手动更新)
    'position': {
        'shares': 5,
        'entry_price': 0.46,
        'market': 'Will Trump serve a third term?',
        'expiry_date': '2026-03-31'
    },
    
    # 数据源配置
    'sources': {
        'whitehouse': {
            'enabled': True,
            'url': 'https://www.whitehouse.gov/briefing-room/speeches-remarks/',
            'timeout': 10
        },
        'factbase': {
            'enabled': True,
            'api_endpoint': 'https://rollcall.com/wp-json/factbase/v1/twitter',
            'timeout': 15,
            'days_lookback': 7  # 查看最近 N 天
        },
        'web_search': {
            'enabled': True,
            'urls': [
                'https://www.c-span.org/person/?DonaldTrump',
                'https://www.rev.com/blog/transcript-tag/donald-trump-transcripts'
            ],
            'timeout': 10
        },
        'truth_social': {
            'enabled': False,  # Truth Social 没有公开 API，暂时禁用
            'urls': []
        }
    },
    
    # 关键词配置
    'keywords': [
        r'\bthird term\b',
        r'\bthree terms\b',
        r'\b12 years\b',
        r'\b2032\b',
        r'\bterm limits?\b',
        r'\brepeal.*22nd amendment\b',
        r'\b22nd amendment.*repeal\b',
    ],
    
    # 交易信号阈值
    'signals': {
        'strong_buy': 5,  # 本周提及 >= 5 次
        'hold': 2,        # 本周提及 >= 2 次
        'caution': 1,     # 本周提及 >= 1 次
        'sell': 0,        # 本周提及 = 0 次
        
        'price_oversold': 0.30,   # 价格 < 此值视为超跌
        'price_takeprofit': 0.55, # 价格 > 此值考虑止盈
        
        'loss_stop': -30,  # 亏损 > 30% 建议止损
        'days_to_expiry_urgent': 21  # 距到期 < 21 天视为紧急
    }
}

# 代理配置
PROXY_CONFIG = {
    'enabled': True,
    'proxies': {
        'http': 'socks5h://127.0.0.1:7880',
        'https': 'socks5h://127.0.0.1:7880'
    }
}

# 输出配置
OUTPUT_CONFIG = {
    'report_dir': '/root/openclaw/skills/intelligence',
    'log_dir': '/root/openclaw/skills/intelligence/logs',
    'report_prefix': 'trump_third_term_report',
    'verbose': True,  # 详细输出
    'save_json': True,  # 保存 JSON 报告
    'print_summary': True  # 打印摘要
}
