#!/usr/bin/env python3
"""Intelligence Trading Dashboard - aggregates all data sources"""

import json, os, glob
from datetime import datetime, timezone

INTEL_DIR = "/root/openclaw/skills/intelligence"

def load_latest(patterns):
    """Load the most recent report matching any pattern"""
    for pattern in patterns if isinstance(patterns, list) else [patterns]:
        files = sorted(glob.glob(pattern))
        if files:
            try:
                with open(files[-1]) as f:
                    return json.load(f)
            except: pass
    return None

def aggregate():
    d = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data_sources": {},
        "signals": [],
    }
    
    sources = {
        "ioda": [f"{INTEL_DIR}/ioda_report*.json"],
        "viirs": ["/tmp/viirs/iran_grid_assessment.json"],
        "adsb": [f"{INTEL_DIR}/adsb_report*.json", f"{INTEL_DIR}/logs/adsb_*.log"],
        "trump": [f"{INTEL_DIR}/trump_third_term_report_*.json"],
        "fifa": [f"{INTEL_DIR}/fifa_odds_2*.json"],
        "ais": [f"{INTEL_DIR}/ais_report*.json"],
        "firms": ["/root/openclaw/skills/firms-satellite/output/*.json"],
    }
    
    for name, patterns in sources.items():
        data = load_latest(patterns)
        d["data_sources"][name] = {
            "available": data is not None,
            "last_updated": data.get("timestamp") or data.get("analysis_date") if data else None,
        }
    
    # Generate trading signals from available data
    # IODA signal
    ioda = load_latest(f"{INTEL_DIR}/ioda_report*.json")
    if ioda:
        iran = ioda.get("findings", {}).get("iran", {})
        ping = iran.get("active_probing", {})
        if ping.get("change_pct", 0) < -50:
            d["signals"].append({
                "source": "IODA",
                "signal": "IRAN_INTERNET_DOWN",
                "severity": "CRITICAL",
                "detail": f"Active probing {ping.get('change_pct', 0):.0f}%",
                "trading_implication": "Supports war continuation thesis, HOLD Hormuz YES"
            })
    
    # FIFA signal
    fifa = load_latest(f"{INTEL_DIR}/fifa_odds_2*.json")
    if fifa:
        for comp in fifa.get("comparisons", []):
            if comp.get("is_arbitrage") and comp.get("our_position"):
                diff = comp.get("diff_pct", 0)
                d["signals"].append({
                    "source": "FIFA_ODDS",
                    "signal": f"{comp['country']}_UNDERVALUED",
                    "severity": "INFO",
                    "detail": f"Bookmaker {comp['bookmaker_prob']:.1f}% vs PM {comp['polymarket_prob']:.1f}%",
                    "trading_implication": f"Consider adding to {comp['country']} position"
                })
    
    # Trump signal
    trump = load_latest(f"{INTEL_DIR}/trump_third_term_report_*.json")
    if trump:
        mentions = trump.get("total_mentions", 0)
        signal = trump.get("trading_signal", {})
        if mentions == 0:
            d["signals"].append({
                "source": "TRUMP_MONITOR",
                "signal": "ZERO_MENTIONS",
                "severity": "WARNING",
                "detail": "No 'third term' mentions this week",
                "trading_implication": signal.get("recommendation", "Consider reducing position")
            })
    
    return d

if __name__ == "__main__":
    d = aggregate()
    outfile = os.path.join(INTEL_DIR, "dashboard.json")
    with open(outfile, 'w') as f:
        json.dump(d, f, indent=2, default=str)
    
    print(json.dumps(d, indent=2, default=str))
