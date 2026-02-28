#!/usr/bin/env python3
"""
Polymarket Sentiment Scanner
Analyzes market sentiment indicators to detect crowd psychology patterns.
Based on Le Bon's crowd psychology + contrarian trading philosophy.
"""
import json, sys, subprocess, os

PROXY = "socks5h://127.0.0.1:7880"
FUNDER = os.environ.get("POLYMARKET_FUNDER", "0x68e8da45f26396b2cc076e24103e9494ea680c38")

def curl_json(url):
    result = subprocess.run(
        ["curl", "-s", "-x", PROXY, url],
        capture_output=True, text=True, timeout=15
    )
    return json.loads(result.stdout)

def analyze_crowd_signals(markets):
    """Detect Le Bon crowd psychology patterns in market data"""
    signals = []
    
    for m in markets:
        q = m.get("question", "")[:60]
        prices = json.loads(m.get("outcomePrices", "[]"))
        yes = float(prices[0]) if prices else 0
        vol24h = m.get("volume24hr", 0) or 0
        vol_total = m.get("volumeNum", 0) or 0
        
        if yes < 0.02 or yes > 0.98: continue
        if vol24h < 10000: continue
        
        # === Crowd Psychology Indicators ===
        
        # 1. FOMO/Panic ratio: extreme volume spike = emotional crowd
        vol_ratio = vol24h / max(vol_total / 30, 1)  # vs 30-day avg
        crowd_emotion = "neutral"
        if vol_ratio > 5:
            crowd_emotion = "🔴 EXTREME (FOMO/panic)"
        elif vol_ratio > 2:
            crowd_emotion = "🟡 ELEVATED"
        
        # 2. Extreme pricing = crowd consensus (potential contrarian opportunity)
        contrarian_signal = None
        if yes > 0.90:
            contrarian_signal = "⚠️ Crowd strongly YES — contrarian: consider NO"
        elif yes < 0.10:
            contrarian_signal = "⚠️ Crowd strongly NO — contrarian: consider YES"
        elif 0.40 < yes < 0.60:
            contrarian_signal = "⚖️ Market uncertain — no crowd consensus"
        
        # 3. Le Bon's "simplification" — markets with simple narratives move faster
        narrative_simple = any(w in q.lower() for w in 
            ["war", "crash", "fall", "die", "win", "lose", "ban", "fire"])
        
        if crowd_emotion != "neutral" or contrarian_signal:
            signals.append({
                "market": q,
                "yes_price": f"{yes:.1%}",
                "vol_24h": f"${vol24h/1000:.0f}k",
                "vol_ratio": f"{vol_ratio:.1f}x",
                "crowd_emotion": crowd_emotion,
                "contrarian": contrarian_signal,
                "simple_narrative": "⚡ Simple narrative (moves fast)" if narrative_simple else "",
            })
    
    return signals

def main():
    print("=== Polymarket Crowd Psychology Scanner ===\n")
    
    # Get top markets by volume
    markets = curl_json(
        "https://gamma-api.polymarket.com/markets?_limit=50&active=true&closed=false"
        "&order=volume24hr&ascending=false"
    )
    
    signals = analyze_crowd_signals(markets)
    
    if not signals:
        print("No significant crowd signals detected.")
        return
    
    print(f"Found {len(signals)} markets with crowd psychology signals:\n")
    for s in signals:
        print(f"📊 {s['market']}")
        print(f"   Price: {s['yes_price']} | 24h Vol: {s['vol_24h']} | Vol spike: {s['vol_ratio']}")
        print(f"   Emotion: {s['crowd_emotion']}")
        if s['contrarian']:
            print(f"   Signal: {s['contrarian']}")
        if s['simple_narrative']:
            print(f"   Narrative: {s['simple_narrative']}")
        print()

    # Get our positions for context
    print("=== Our Positions ===\n")
    positions = curl_json(
        f"https://data-api.polymarket.com/positions?user={FUNDER}"
    )
    for p in positions:
        if float(p.get("size", 0)) > 0:
            title = p.get("title", "?")[:50]
            cur = float(p.get("curPrice", 0))
            avg = float(p.get("avgPrice", 0))
            pnl = ((cur - avg) / avg * 100) if avg > 0 else 0
            print(f"  {p.get('outcome','?'):3s} | ${cur:.3f} (avg ${avg:.3f}, {pnl:+.0f}%) | {title}")

if __name__ == "__main__":
    main()
