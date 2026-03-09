#!/bin/bash
# IODA Monitor Quick Runner
# Usage: ./ioda_check.sh [json|report|alert]

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MONITOR_SCRIPT="$SCRIPT_DIR/ioda_monitor.py"

case "${1:-report}" in
  json)
    # JSON output only
    python3 "$MONITOR_SCRIPT"
    ;;
  
  report)
    # Human-readable report only
    python3 "$MONITOR_SCRIPT" 2>&1 | grep -A 999 "IODA INTERNET OUTAGE MONITOR"
    ;;
  
  alert)
    # Check for critical status
    OUTPUT=$(python3 "$MONITOR_SCRIPT" 2>&1)
    if echo "$OUTPUT" | grep -q "CRITICAL"; then
      echo "⚠️  CRITICAL DISRUPTIONS DETECTED"
      echo "$OUTPUT" | grep -E "(CRITICAL|Countries:|Time:)" | head -20
      exit 1
    else
      echo "✅ All networks normal"
      exit 0
    fi
    ;;
  
  save)
    # Save JSON with timestamp
    OUTPUT_FILE="/tmp/ioda_$(date +%Y%m%d_%H%M%S).json"
    python3 "$MONITOR_SCRIPT" > "$OUTPUT_FILE" 2>&1
    echo "Saved to: $OUTPUT_FILE"
    ;;
  
  *)
    echo "Usage: $0 [json|report|alert|save]"
    echo ""
    echo "  json   - Output JSON data only"
    echo "  report - Display human-readable report"
    echo "  alert  - Check for critical events (exit 1 if found)"
    echo "  save   - Save JSON to timestamped file"
    exit 1
    ;;
esac
