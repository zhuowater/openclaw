#!/usr/bin/env python3
"""YouTube search via yt-dlp."""
import subprocess, json, sys, argparse

PROXY = "socks5://127.0.0.1:7880"

def search(query, limit=5):
    cmd = [
        "yt-dlp", "--proxy", PROXY,
        f"ytsearch{limit}:{query}",
        "--flat-playlist",
        "--print", "%(id)s\t%(title)s\t%(duration)s",
        "--no-warnings"
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    results = []
    for line in r.stdout.strip().split('\n'):
        if not line: continue
        parts = line.split('\t')
        if len(parts) >= 3:
            results.append({"id": parts[0], "title": parts[1], "duration": parts[2],
                          "url": f"https://youtube.com/watch?v={parts[0]}"})
    return results

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="YouTube search")
    p.add_argument("query")
    p.add_argument("-n", "--limit", type=int, default=5)
    args = p.parse_args()
    results = search(args.query, args.limit)
    print(json.dumps(results, ensure_ascii=False, indent=2))
