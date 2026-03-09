#!/bin/bash
# Master intelligence pipeline runner
# Usage: ./run_all.sh [pipeline_name]
# If no name, runs all pipelines

INTEL_DIR="/root/openclaw/skills/intelligence"
cd "$INTEL_DIR"

run_pipeline() {
    local name=$1
    local script=$2
    local timeout=${3:-60}
    
    echo "[$(date '+%H:%M:%S')] Running $name..."
    timeout $timeout python3 "$script" > "logs/${name}_$(date '+%Y%m%d_%H%M').log" 2>&1
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo "[$(date '+%H:%M:%S')] ✅ $name complete"
    else
        echo "[$(date '+%H:%M:%S')] ❌ $name failed (exit $exit_code)"
    fi
}

mkdir -p logs

case "${1:-all}" in
    adsb)    run_pipeline "adsb" "adsb_monitor.py" 45 ;;
    trump)   run_pipeline "trump" "trump_speech_monitor.py" 30 ;;
    fifa)    run_pipeline "fifa" "fifa_odds_scanner.py" 30 ;;
    viirs)   run_pipeline "viirs" "viirs_nightlights.py" 60 ;;
    ioda)    run_pipeline "ioda" "ioda_monitor.py" 60 ;;
    ais)     run_pipeline "ais" "ais_rerouting.py" 30 ;;
    all)
        run_pipeline "ioda" "ioda_monitor.py" 60
        run_pipeline "adsb" "adsb_monitor.py" 45
        run_pipeline "trump" "trump_speech_monitor.py" 30
        run_pipeline "fifa" "fifa_odds_scanner.py" 30
        run_pipeline "viirs" "viirs_nightlights.py" 60
        echo ""
        echo "[$(date '+%H:%M:%S')] All pipelines complete. Running dashboard..."
        python3 dashboard.py
        ;;
esac
