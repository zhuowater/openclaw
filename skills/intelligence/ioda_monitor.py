#!/usr/bin/env python3
"""
IODA Internet Outage Monitor - Iran and Proxy Networks

Monitors internet connectivity disruptions in Iran and its regional proxy networks
(Lebanon, Syria, Yemen, Iraq) using IODA (Internet Outage Detection and Analysis) API.

Data Source: https://api.ioda.inetintel.cc.gatech.edu/v2/
"""

import json
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import statistics


def _make_session(retries=3, backoff=1.0, timeout=60):
    """Create a requests session with retry + backoff for transient DNS/connection errors."""
    session = requests.Session()
    retry_strategy = Retry(
        total=retries,
        backoff_factor=backoff,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


# Module-level session for connection reuse + retries
_session = _make_session()

# Target countries - Iran and proxy networks
COUNTRIES = {
    "IR": "Iran",
    "LB": "Lebanon", 
    "SY": "Syria",
    "YE": "Yemen",
    "IQ": "Iraq"
}

# IODA signals (Darknet is deprecated)
SIGNALS = ["bgp", "active_probing", "google_transparency"]

# IODA API base URL
API_BASE = "https://api.ioda.inetintel.cc.gatech.edu/v2"

# Anomaly detection threshold (standard deviations)
ANOMALY_THRESHOLD = 2.0


def fetch_signal_data(country_code: str, signal: str, start_ts: int, end_ts: int) -> Optional[List[List]]:
    """
    Fetch raw signal data from IODA API and convert to [timestamp, value] pairs.
    
    Args:
        country_code: Two-letter country code (e.g., "IR")
        signal: Signal type (bgp, ping-slash24, gtr)
        start_ts: Start timestamp (Unix epoch)
        end_ts: End timestamp (Unix epoch)
        
    Returns:
        List of [timestamp, value] pairs or None on error
    """
    url = f"{API_BASE}/signals/raw/country/{country_code}"
    params = {
        "from": start_ts,
        "until": end_ts
    }
    
    # Map friendly names to IODA datasource names
    datasource_map = {
        "bgp": "bgp",
        "active_probing": "ping-slash24",
        "google_transparency": "gtr"
    }
    
    target_datasource = datasource_map.get(signal, signal)
    
    try:
        response = _session.get(url, params=params, timeout=60)
        response.raise_for_status()
        data = response.json()
        
        # IODA API returns data as array of signal objects
        if "data" not in data or not isinstance(data["data"], list):
            return []
        
        # Find the signal in the data array
        for signal_data in data["data"]:
            if isinstance(signal_data, list):
                for item in signal_data:
                    if item.get("datasource") == target_datasource:
                        # Extract values array and reconstruct timestamps
                        values = item.get("values", [])
                        from_ts = item.get("from", start_ts)
                        step = item.get("step", 300)  # Default 5-minute step
                        
                        # Convert to [timestamp, value] pairs
                        result = []
                        for i, value in enumerate(values):
                            if value is not None:  # Skip null values
                                timestamp = from_ts + (i * step)
                                result.append([timestamp, value])
                        
                        return result
        
        return []
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching {signal} data for {country_code}: {e}", file=sys.stderr)
        return None


def calculate_baseline(values: List[float]) -> Tuple[float, float]:
    """
    Calculate baseline mean and standard deviation.
    
    Args:
        values: List of signal values
        
    Returns:
        Tuple of (mean, stdev)
    """
    if len(values) < 2:
        return (0.0, 0.0)
    
    mean = statistics.mean(values)
    stdev = statistics.stdev(values) if len(values) > 1 else 0.0
    
    return (mean, stdev)


def detect_anomalies(data_points: List, signal: str) -> List[Dict]:
    """
    Detect anomalies in signal data using statistical analysis.
    
    Args:
        data_points: List of [timestamp, value] pairs
        signal: Signal type for context
        
    Returns:
        List of anomaly events
    """
    if not data_points:
        return []
    
    # IODA returns [timestamp, value] pairs
    values = [point[1] for point in data_points if isinstance(point, list) and len(point) >= 2]
    
    if len(values) < 10:  # Need sufficient data
        return []
    
    mean, stdev = calculate_baseline(values)
    
    if stdev == 0:  # No variation
        return []
    
    # Detect drops below threshold
    anomalies = []
    for point in data_points:
        if not isinstance(point, list) or len(point) < 2:
            continue
            
        timestamp = point[0]
        value = point[1]
        
        # Calculate z-score
        z_score = (value - mean) / stdev if stdev > 0 else 0
        
        # Detect significant drops (negative z-score)
        if z_score < -ANOMALY_THRESHOLD:
            anomalies.append({
                "timestamp": timestamp,
                "datetime": datetime.fromtimestamp(timestamp).isoformat(),
                "signal": signal,
                "value": value,
                "baseline_mean": round(mean, 2),
                "z_score": round(z_score, 2),
                "severity": "critical" if z_score < -3 else "warning"
            })
    
    return anomalies


def analyze_country(country_code: str, start_ts: int, end_ts: int) -> Dict:
    """
    Analyze internet connectivity for a single country.
    
    Args:
        country_code: Two-letter country code
        start_ts: Start timestamp
        end_ts: End timestamp
        
    Returns:
        Analysis results dictionary
    """
    country_name = COUNTRIES.get(country_code, country_code)
    
    result = {
        "country_code": country_code,
        "country_name": country_name,
        "period": {
            "start": datetime.fromtimestamp(start_ts).isoformat(),
            "end": datetime.fromtimestamp(end_ts).isoformat()
        },
        "signals": {},
        "anomalies": [],
        "status": "normal"
    }
    
    # Fetch and analyze each signal
    for signal in SIGNALS:
        data_points = fetch_signal_data(country_code, signal, start_ts, end_ts)
        
        if data_points is None:
            result["signals"][signal] = {"error": "Failed to fetch data"}
            continue
        
        if not data_points:
            result["signals"][signal] = {"error": "No data available"}
            continue
        
        # Calculate statistics (data_points are [timestamp, value] pairs)
        values = [p[1] for p in data_points if isinstance(p, list) and len(p) >= 2]
        mean, stdev = calculate_baseline(values)
        
        result["signals"][signal] = {
            "data_points": len(data_points),
            "mean": round(mean, 2),
            "stdev": round(stdev, 2),
            "latest_value": values[-1] if values else 0
        }
        
        # Detect anomalies
        anomalies = detect_anomalies(data_points, signal)
        result["anomalies"].extend(anomalies)
    
    # Set overall status
    if any(a["severity"] == "critical" for a in result["anomalies"]):
        result["status"] = "critical"
    elif result["anomalies"]:
        result["status"] = "warning"
    
    return result


def cross_analyze(country_results: Dict[str, Dict]) -> List[Dict]:
    """
    Perform cross-country analysis to detect coordinated events.
    
    Args:
        country_results: Dictionary of country analysis results
        
    Returns:
        List of coordinated event detections
    """
    coordinated_events = []
    
    # Collect all anomalies with timestamps
    all_anomalies = []
    for country_code, result in country_results.items():
        for anomaly in result.get("anomalies", []):
            all_anomalies.append({
                "country": country_code,
                "timestamp": anomaly["timestamp"],
                "signal": anomaly["signal"],
                "severity": anomaly["severity"]
            })
    
    # Sort by timestamp
    all_anomalies.sort(key=lambda x: x["timestamp"])
    
    # Detect clusters (events within 1 hour window across multiple countries)
    time_window = 3600  # 1 hour
    i = 0
    
    while i < len(all_anomalies):
        cluster_start = all_anomalies[i]["timestamp"]
        cluster = [all_anomalies[i]]
        
        # Find all anomalies within time window
        j = i + 1
        while j < len(all_anomalies):
            if all_anomalies[j]["timestamp"] - cluster_start <= time_window:
                cluster.append(all_anomalies[j])
                j += 1
            else:
                break
        
        # If multiple countries involved, mark as coordinated
        countries_involved = set(a["country"] for a in cluster)
        if len(countries_involved) >= 2:
            coordinated_events.append({
                "timestamp": cluster_start,
                "datetime": datetime.fromtimestamp(cluster_start).isoformat(),
                "countries": list(countries_involved),
                "country_names": [COUNTRIES.get(c, c) for c in countries_involved],
                "signal_count": len(cluster),
                "interpretation": "Coordinated disruption detected across multiple proxy networks"
            })
        
        i = j if j > i + 1 else i + 1
    
    return coordinated_events


def generate_report(country_results: Dict[str, Dict], coordinated_events: List[Dict]) -> str:
    """
    Generate human-readable report.
    
    Args:
        country_results: Country analysis results
        coordinated_events: Coordinated event detections
        
    Returns:
        Formatted report string
    """
    lines = []
    lines.append("=" * 80)
    lines.append("IODA INTERNET OUTAGE MONITOR - IRAN & PROXY NETWORKS")
    lines.append("=" * 80)
    lines.append(f"Report generated: {datetime.now().isoformat()}")
    lines.append("")
    
    # Summary
    lines.append("SUMMARY")
    lines.append("-" * 80)
    critical_countries = [c for c, r in country_results.items() if r["status"] == "critical"]
    warning_countries = [c for c, r in country_results.items() if r["status"] == "warning"]
    
    if critical_countries:
        lines.append(f"🔴 CRITICAL: {', '.join([COUNTRIES[c] for c in critical_countries])}")
    if warning_countries:
        lines.append(f"🟡 WARNING: {', '.join([COUNTRIES[c] for c in warning_countries])}")
    if not critical_countries and not warning_countries:
        lines.append("🟢 All countries: Normal connectivity")
    
    lines.append("")
    
    # Coordinated events
    if coordinated_events:
        lines.append("COORDINATED EVENTS")
        lines.append("-" * 80)
        for event in coordinated_events:
            lines.append(f"Time: {event['datetime']}")
            lines.append(f"Countries: {', '.join(event['country_names'])}")
            lines.append(f"Signals affected: {event['signal_count']}")
            lines.append(f"Analysis: {event['interpretation']}")
            lines.append("")
    
    # Country details
    lines.append("COUNTRY DETAILS")
    lines.append("-" * 80)
    
    for country_code in COUNTRIES.keys():
        result = country_results.get(country_code, {})
        lines.append(f"\n{COUNTRIES[country_code]} ({country_code})")
        lines.append(f"Status: {result.get('status', 'unknown').upper()}")
        
        # Signal status
        signals = result.get("signals", {})
        for signal, data in signals.items():
            if "error" in data:
                lines.append(f"  {signal}: {data['error']}")
            else:
                lines.append(f"  {signal}: mean={data['mean']}, latest={data['latest_value']}")
        
        # Anomalies
        anomalies = result.get("anomalies", [])
        if anomalies:
            lines.append(f"  Anomalies detected: {len(anomalies)}")
            for anomaly in anomalies[:5]:  # Show first 5
                lines.append(f"    - {anomaly['datetime']}: {anomaly['signal']} "
                           f"(z-score: {anomaly['z_score']}, severity: {anomaly['severity']})")
    
    lines.append("")
    lines.append("=" * 80)
    lines.append("INTELLIGENCE INTERPRETATION")
    lines.append("=" * 80)
    lines.append("• Iran disruption → Potential military action or domestic unrest")
    lines.append("• Proxy network disruption → Communication cutoff or targeted strikes")
    lines.append("• Multi-country simultaneous → Coordinated operations likely")
    lines.append("=" * 80)
    
    return "\n".join(lines)


def main():
    """Main execution function."""
    # Calculate time range (last 7 days)
    end_time = datetime.now()
    start_time = end_time - timedelta(days=7)
    
    start_ts = int(start_time.timestamp())
    end_ts = int(end_time.timestamp())
    
    print(f"Fetching IODA data from {start_time.isoformat()} to {end_time.isoformat()}")
    print(f"Monitoring: {', '.join([f'{v} ({k})' for k, v in COUNTRIES.items()])}")
    print("")
    
    # Analyze each country
    country_results = {}
    for country_code in COUNTRIES.keys():
        print(f"Analyzing {COUNTRIES[country_code]}...", file=sys.stderr)
        result = analyze_country(country_code, start_ts, end_ts)
        country_results[country_code] = result
    
    # Cross-country analysis
    print("Performing cross-country analysis...", file=sys.stderr)
    coordinated_events = cross_analyze(country_results)
    
    # Generate outputs
    full_data = {
        "metadata": {
            "generated": datetime.now().isoformat(),
            "period": {
                "start": start_time.isoformat(),
                "end": end_time.isoformat()
            },
            "countries_monitored": COUNTRIES
        },
        "country_results": country_results,
        "coordinated_events": coordinated_events
    }
    
    # Output JSON to stdout
    print(json.dumps(full_data, indent=2))
    
    # Generate human-readable report to stderr
    report = generate_report(country_results, coordinated_events)
    print("\n" + report, file=sys.stderr)


if __name__ == "__main__":
    main()
