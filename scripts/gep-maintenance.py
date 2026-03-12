#!/usr/bin/env python3
"""
GEP Asset Maintenance Script
Deduplicates candidates.jsonl and archives old events from events.jsonl.
Safe to run periodically (idempotent).

Usage: python3 scripts/gep-maintenance.py [--dry-run]
"""
import json
import sys
import os

DRY_RUN = '--dry-run' in sys.argv
GEP_DIR = os.path.join(os.path.dirname(__file__), '..', 'skills', 'evolver', 'assets', 'gep')
KEEP_EVENTS = 30  # Keep last N EvolutionEvents (+ their ValidationReports)


def dedup_candidates():
    """Remove duplicate entries from candidates.jsonl, keeping latest per ID."""
    path = os.path.join(GEP_DIR, 'candidates.jsonl')
    if not os.path.exists(path):
        print('candidates.jsonl not found, skipping.')
        return 0

    with open(path) as f:
        lines = [l.strip() for l in f if l.strip()]

    seen = {}
    for line in lines:
        obj = json.loads(line)
        cid = obj.get('id', '')
        seen[cid] = line

    deduped = list(seen.values())
    removed = len(lines) - len(deduped)

    if removed == 0:
        print(f'candidates.jsonl: {len(lines)} entries, no duplicates.')
        return 0

    if DRY_RUN:
        print(f'[DRY RUN] candidates.jsonl: would remove {removed} duplicates ({len(lines)} → {len(deduped)})')
        return removed

    with open(path, 'w') as f:
        for line in deduped:
            f.write(line + '\n')

    print(f'candidates.jsonl: removed {removed} duplicates ({len(lines)} → {len(deduped)})')
    return removed


def archive_old_events():
    """Archive events older than KEEP_EVENTS cycles."""
    path = os.path.join(GEP_DIR, 'events.jsonl')
    archive_path = os.path.join(GEP_DIR, 'events_archive.jsonl')

    if not os.path.exists(path):
        print('events.jsonl not found, skipping.')
        return 0

    with open(path) as f:
        entries = [json.loads(l) for l in f if l.strip()]

    events = [e for e in entries if e.get('type') == 'EvolutionEvent']
    vrs = [e for e in entries if e.get('type') == 'ValidationReport']

    events.sort(key=lambda e: e.get('id', ''))
    vrs.sort(key=lambda e: e.get('id', ''))

    if len(events) <= KEEP_EVENTS:
        print(f'events.jsonl: {len(events)} events, under threshold ({KEEP_EVENTS}). No archival needed.')
        return 0

    archived_events = events[:-KEEP_EVENTS]
    archived_vrs = vrs[:-KEEP_EVENTS]
    kept_events = events[-KEEP_EVENTS:]
    kept_vrs = vrs[-KEEP_EVENTS:]

    archived = archived_events + archived_vrs
    kept = kept_events + kept_vrs
    kept.sort(key=lambda e: e.get('id', ''))

    if DRY_RUN:
        print(f'[DRY RUN] events.jsonl: would archive {len(archived)} entries, keep {len(kept)}')
        return len(archived)

    # Append to archive
    with open(archive_path, 'a') as f:
        for e in archived:
            f.write(json.dumps(e) + '\n')

    # Write kept entries
    with open(path, 'w') as f:
        for e in kept:
            f.write(json.dumps(e) + '\n')

    print(f'events.jsonl: archived {len(archived)} entries, kept {len(kept)}')
    return len(archived)


def main():
    if DRY_RUN:
        print('=== GEP Maintenance (DRY RUN) ===')
    else:
        print('=== GEP Maintenance ===')

    dedup_count = dedup_candidates()
    archive_count = archive_old_events()

    total_actions = dedup_count + archive_count
    if total_actions == 0:
        print('Nothing to do. Assets are clean.')
    else:
        print(f'Done. Deduped: {dedup_count}, Archived: {archive_count}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
