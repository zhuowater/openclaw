#!/bin/bash
# GEP Prompt Cleanup - remove old GEP prompt files, keeping the N most recent
# Usage: gep-cleanup.sh [keep_count]
# Default: keep 5 most recent of each type (.txt, .json)

set -euo pipefail

KEEP=${1:-5}
DIR="/root/openclaw/memory/evolution"

cleanup_type() {
  local ext="$1"
  local files
  files=$(ls -t "$DIR"/gep_prompt_*."$ext" 2>/dev/null | tail -n +"$((KEEP + 1))" || true)
  if [ -z "$files" ]; then
    echo "[$ext] Nothing to clean (≤$KEEP files)"
    return
  fi
  local count
  count=$(echo "$files" | wc -l)
  echo "[$ext] Removing $count old prompt files (keeping $KEEP)"
  echo "$files" | xargs rm -v
}

echo "=== GEP Prompt Cleanup (keep=$KEEP) ==="
cleanup_type "txt"
cleanup_type "json"

# Trim memory_graph.jsonl (keep last 120 entries, archive rest)
MG="$DIR/memory_graph.jsonl"
MG_ARCHIVE="$DIR/memory_graph_archive.jsonl"
MG_KEEP=120
if [ -f "$MG" ]; then
  MG_TOTAL=$(wc -l < "$MG")
  if [ "$MG_TOTAL" -gt "$MG_KEEP" ]; then
    MG_REMOVE=$((MG_TOTAL - MG_KEEP))
    echo "[memory_graph] Archiving $MG_REMOVE of $MG_TOTAL entries (keeping $MG_KEEP)"
    head -n "$MG_REMOVE" "$MG" >> "$MG_ARCHIVE"
    tail -n "$MG_KEEP" "$MG" > /tmp/mg_trimmed.jsonl && mv /tmp/mg_trimmed.jsonl "$MG"
  else
    echo "[memory_graph] $MG_TOTAL entries, no trim needed"
  fi
fi

# Report
remaining=$(ls "$DIR"/gep_prompt_* 2>/dev/null | wc -l || echo 0)
mg_size=$(wc -l < "$MG" 2>/dev/null || echo 0)
size=$(du -sh "$DIR" 2>/dev/null | cut -f1)
echo "=== Done: $remaining prompt files, $mg_size graph entries, $size total ==="
