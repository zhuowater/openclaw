#!/usr/bin/env python3
"""
IODA Internet Outage Scanner
Detect internet outages by country using IODA (Georgia Tech / CAIDA).
Data sources: Google Transparency (traffic), BGP (routing), Active Probing (ping).
"""
import json, sys, os, argparse, subprocess
from datetime import datetime, timezone, timedelta

BASE = "https://api.ioda.inetintel.cc.gatech.edu/v2"

# RIPE RIS for BGP routing details
RIPE_BASE = "https://stat.ripe.net/data"

# Key Iran ASNs
IRAN_ASNS = {
    "AS12880": "DCI (Iran backbone)",
    "AS58224": "TIC (International gateway)",
    "AS44244": "Irancell (mobile)",
    "AS197207": "MCI (mobile)",
}

PRESETS = {
    "iran": "IR",
    "russia": "RU",
    "ukraine": "UA",
    "china": "CN",
    "syria": "SY",
    "iraq": "IQ",
    "israel": "IL",
    "lebanon": "LB",
    "yemen": "YE",
    "myanmar": "MM",
}

def curl_json(url, timeout=20):
    cmd = ["curl", "-s", "--max-time", str(timeout), url]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout+5)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except:
        return None

def get_ioda_signals(country_code, hours_back=48):
    now = int(datetime.now(timezone.utc).timestamp())
    start = now - hours_back * 3600
    url = f"{BASE}/signals/raw/country/{country_code}?from={start}&until={now}"
    data = curl_json(url, timeout=25)
    if not data or not data.get("data"):
        return None
    
    items = data["data"]
    if isinstance(items, list) and len(items) > 0 and isinstance(items[0], list):
        items = items[0]
    
    results = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        ds = item.get("datasource", "")
        subtype = item.get("subtype", "")
        step = item.get("step", 1800)
        start_ts = item.get("from", 0)
        values = item.get("values", [])
        
        # Flatten nested lists
        flat = []
        for v in values:
            if isinstance(v, list):
                flat.extend(v)
            else:
                flat.append(v)
        
        numeric = [(i, v) for i, v in enumerate(flat) if v is not None and isinstance(v, (int, float))]
        if not numeric:
            continue
        
        all_vals = [v for _, v in numeric]
        peak = max(all_vals)
        latest = all_vals[-1]
        
        # Split into first half / second half for trend
        mid = len(numeric) // 2
        first_half = [v for _, v in numeric[:mid]]
        second_half = [v for _, v in numeric[mid:]]
        avg_first = sum(first_half) / len(first_half) if first_half else 0
        avg_second = sum(second_half) / len(second_half) if second_half else 0
        
        change_pct = ((avg_second - avg_first) / avg_first * 100) if avg_first else 0
        
        # Find biggest drop
        max_drop = 0
        drop_time = ""
        for idx in range(1, len(numeric)):
            prev_i, prev_v = numeric[idx-1]
            curr_i, curr_v = numeric[idx]
            if prev_v > 0:
                drop = (prev_v - curr_v) / prev_v * 100
                if drop > max_drop:
                    max_drop = drop
                    ts = start_ts + curr_i * step
                    drop_time = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        
        # Current vs peak ratio
        current_pct = (latest / peak * 100) if peak else 0
        
        key = f"{ds}_{subtype}" if subtype else ds
        results[key] = {
            "datasource": ds,
            "subtype": subtype,
            "points": len(numeric),
            "step_min": step // 60,
            "peak": peak,
            "latest": latest,
            "current_pct": round(current_pct, 1),
            "trend_pct": round(change_pct, 1),
            "max_single_drop_pct": round(max_drop, 1),
            "max_drop_time": drop_time,
        }
    
    return results

def get_bgp_status(asn):
    url = f"{RIPE_BASE}/routing-status/data.json?resource={asn}"
    data = curl_json(url, timeout=15)
    if not data:
        return None
    status = data.get("data", {})
    v4 = status.get("announced_space", {}).get("v4", {})
    vis = status.get("visibility", {}).get("v4", {})
    return {
        "asn": asn,
        "prefixes": v4.get("prefixes", 0),
        "ips": v4.get("ips", 0),
        "ris_peers_seeing": vis.get("ris_peers_seeing", 0),
        "ris_peers_total": vis.get("ris_peers_total", 0),
    }

def scan_country(country_code, hours=48):
    signals = get_ioda_signals(country_code, hours)
    if not signals:
        return {"error": f"No IODA data for {country_code}", "country": country_code}
    
    # Determine outage status
    gtr = signals.get("gtr_WEB_SEARCH", signals.get("gtr", {}))
    bgp = signals.get("bgp_", signals.get("bgp", {}))
    ping = signals.get("ping-slash24_", signals.get("ping-slash24", {}))
    
    current_traffic = gtr.get("current_pct", 100)
    
    if current_traffic < 10:
        status = "🔴 MAJOR OUTAGE"
    elif current_traffic < 50:
        status = "🟠 SIGNIFICANT DISRUPTION"
    elif current_traffic < 80:
        status = "🟡 PARTIAL DISRUPTION"
    else:
        status = "🟢 NORMAL"
    
    return {
        "scan_time": datetime.now(timezone.utc).isoformat(),
        "country": country_code,
        "status": status,
        "hours_analyzed": hours,
        "signals": signals,
    }

def scan_iran_full():
    """Full Iran scan: IODA + BGP routing for key ASNs"""
    result = scan_country("IR")
    
    # Add BGP details for key ASNs
    bgp_details = {}
    for asn, desc in IRAN_ASNS.items():
        status = get_bgp_status(asn)
        if status:
            status["description"] = desc
            bgp_details[asn] = status
    
    result["bgp_details"] = bgp_details
    return result

def print_summary(data):
    if "error" in data:
        print(f"❌ {data['error']}")
        return
    
    print(f"\n{'='*60}")
    print(f"🌐 {data['country']} Internet Status: {data['status']}")
    print(f"   Scanned: {data['scan_time'][:19]} | Window: {data['hours_analyzed']}h")
    print(f"{'='*60}")
    
    for key, sig in data.get("signals", {}).items():
        ds = sig["datasource"]
        sub = f" ({sig['subtype']})" if sig.get("subtype") else ""
        pct = sig["current_pct"]
        trend = sig["trend_pct"]
        drop = sig["max_single_drop_pct"]
        drop_t = sig.get("max_drop_time", "")
        
        bar = "█" * max(1, int(pct / 2.5))
        trend_s = f"{'📈' if trend > 0 else '📉'}{trend:+.0f}%" if abs(trend) > 5 else "→"
        
        print(f"\n  {ds}{sub}:")
        print(f"    Current: {pct:.1f}% of peak {trend_s}")
        print(f"    |{bar}| ({sig['latest']:.0f} / {sig['peak']:.0f})")
        if drop > 20:
            print(f"    ⚠️  Max drop: -{drop:.0f}% at {drop_t}")
    
    if "bgp_details" in data:
        print(f"\n  BGP Routing:")
        for asn, info in data["bgp_details"].items():
            vis_pct = (info["ris_peers_seeing"] / info["ris_peers_total"] * 100) if info.get("ris_peers_total") else 0
            print(f"    {asn} ({info.get('description','')}): {info['prefixes']} prefixes, {vis_pct:.0f}% visible")

def main():
    parser = argparse.ArgumentParser(description="IODA Internet Outage Scanner")
    parser.add_argument("-c", "--country", help="Country code (e.g. IR, RU, UA)")
    parser.add_argument("--iran", action="store_true", help="Full Iran scan (IODA + BGP)")
    parser.add_argument("--hours", type=int, default=48, help="Hours to analyze (default: 48)")
    parser.add_argument("--json", action="store_true", help="JSON output")
    args = parser.parse_args()
    
    if args.iran:
        result = scan_iran_full()
    elif args.country:
        code = PRESETS.get(args.country.lower(), args.country.upper())
        result = scan_country(code, args.hours)
    else:
        parser.print_help()
        return
    
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    else:
        print_summary(result)

if __name__ == "__main__":
    main()
