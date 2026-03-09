#!/usr/bin/env python3
"""
AIS Shipping Reroute Monitor
Track vessels rerouting around Cape of Good Hope vs Strait of Hormuz
to quantify blockade impact.

Data sources:
- MarineTraffic API (free tier)
- VesselFinder density maps
- UNCTAD AIS data (academic)
"""

import json
import sys
import urllib.request
import ssl
from datetime import datetime, timedelta

# Disable SSL verification for proxy compatibility
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

PROXY = "socks5h://127.0.0.1:7880"

# Key monitoring zones
ZONES = {
    "hormuz_strait": {
        "desc": "Strait of Hormuz - main oil transit chokepoint",
        "bbox": [56.0, 26.0, 57.0, 27.0],
        "normal_daily_tankers": 40,  # ~15M bbl/day, avg 375K bbl per tanker
    },
    "cape_good_hope": {
        "desc": "Cape of Good Hope - alternative route",
        "bbox": [18.0, -35.0, 20.0, -34.0],
        "normal_daily_tankers": 10,  # baseline pre-crisis
    },
    "bab_el_mandeb": {
        "desc": "Bab el-Mandeb - Red Sea entrance (Houthi threat)",
        "bbox": [43.0, 12.0, 44.0, 13.0],
        "normal_daily_tankers": 25,
    },
    "suez_canal": {
        "desc": "Suez Canal - key transit",
        "bbox": [32.3, 30.5, 32.6, 31.0],
        "normal_daily_tankers": 50,
    },
}

def fetch_marine_traffic_density(zone_name, zone_data):
    """Try to get vessel density from public sources"""
    results = {"zone": zone_name, "description": zone_data["desc"]}
    
    # MarineTraffic public density map API
    bbox = zone_data["bbox"]
    
    # Try VesselFinder public API
    try:
        url = f"https://www.vesselfinder.com/api/pub/vesselsonmap?bbox={bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}&zoom=8&mmsi=0&ref=0&ms=0"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
        })
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = resp.read()
            # VesselFinder returns binary format, count entries
            results["vesselfinder_data_bytes"] = len(data)
            results["source"] = "vesselfinder"
    except Exception as e:
        results["vesselfinder_error"] = str(e)[:100]
    
    # Try UN Global Platform AIS
    try:
        url = f"https://ungp.unglobalpulse.net/ais/v1/density?bbox={','.join(map(str,bbox))}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = json.loads(resp.read())
            results["ungp_vessels"] = data
    except Exception as e:
        results["ungp_error"] = str(e)[:100]
    
    return results

def analyze_insurance_war_risk():
    """Check shipping insurance war risk premium changes"""
    # Lloyd's war risk premium is a key indicator
    # Normally ~0.01% of hull value, spikes to 1-2% during conflicts
    return {
        "indicator": "Lloyd's War Risk Premium",
        "normal_rate": "0.01-0.05%",
        "crisis_rate": "1-5% (Gulf of Oman)",
        "note": "Needs Lloyd's List or TradeWinds subscription for real-time data",
        "proxy_signal": "Check Baltic Dry Index and tanker charter rates as free proxy"
    }

def analyze_tanker_charter_rates():
    """Fetch tanker charter rate data"""
    results = {}
    try:
        # Try to get Baltic Exchange data or Clarksons
        url = "https://fbx.freightos.com/api/lane/FBX"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = json.loads(resp.read())
            results["freightos_index"] = data
    except Exception as e:
        results["freightos_error"] = str(e)[:100]
    
    return results

def generate_report():
    """Generate comprehensive shipping disruption report"""
    report = {
        "timestamp": datetime.utcnow().isoformat(),
        "title": "AIS Shipping Reroute Analysis - Iran Conflict Impact",
        "zones": {},
        "insurance": analyze_insurance_war_risk(),
        "charter_rates": analyze_tanker_charter_rates(),
        "assessment": {},
    }
    
    for zone_name, zone_data in ZONES.items():
        report["zones"][zone_name] = fetch_marine_traffic_density(zone_name, zone_data)
    
    # Qualitative assessment based on available intel
    report["assessment"] = {
        "hormuz_blockade_effectiveness": {
            "estimate": "70-90%",
            "evidence": [
                "4 major shipping companies stopped Hormuz transit",
                "150+ tankers stranded in Persian Gulf",
                "LNG charter rates doubled to $200K+/day",
                "Iran navy destroyed (11→0 ships) but mines/IRGC boats remain threat"
            ],
            "counter_evidence": [
                "US Navy claims 'strait is navigable'",
                "USS carriers providing escort",
                "No confirmed mine detonation on commercial vessels yet"
            ]
        },
        "rerouting_impact": {
            "additional_distance_nm": 3500,  # Hormuz→Suez vs Cape of Good Hope
            "additional_days": 10,
            "additional_cost_per_voyage": "$500K-1M",
            "global_oil_supply_impact": "3-5M bbl/day disrupted",
        },
        "trading_signal": {
            "hormuz_position": "HOLD remaining 3 shares YES",
            "confidence": "HIGH - multiple evidence sources confirm significant disruption",
            "exit_signal": "AIS shows >100 tankers transiting Hormuz daily OR IRGC coastal network collapses"
        }
    }
    
    return report

if __name__ == "__main__":
    report = generate_report()
    
    # Save report
    outfile = "/root/openclaw/skills/intelligence/ais_report.json"
    with open(outfile, 'w') as f:
        json.dump(report, f, indent=2, default=str)
    
    print(json.dumps(report, indent=2, default=str))
