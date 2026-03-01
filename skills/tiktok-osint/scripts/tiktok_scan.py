#!/usr/bin/env python3
"""
TikTok OSINT Scanner via TikAPI.io
Search TikTok hashtags and keywords for intelligence gathering.
"""
import json, sys, os, argparse, subprocess
from datetime import datetime, timezone

API_KEY = os.environ.get("TIKAPI_KEY", "tZfQueYmM506vUrNYQ6Atdf6SS8nTF7azJr9Z6Tm6O39eItv")
BASE = "https://api.tikapi.io"

IRAN_TAGS = ["iranwar", "iran", "tehran", "irgc", "hormuz", "khamenei"]

def tikapi(endpoint, params=""):
    url = f"{BASE}{endpoint}{'?' + params if params else ''}"
    cmd = ["curl", "-s", "--max-time", "30", "-H", f"X-API-KEY: {API_KEY}", url]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=35)
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return json.loads(result.stdout)

def get_hashtag_id(name):
    data = tikapi(f"/public/hashtag", f"name={name}")
    ci = data.get("challengeInfo", {})
    ch = ci.get("challenge", {})
    stats = ci.get("statsV2", ci.get("stats", {}))
    return {
        "id": ch.get("id", ""),
        "title": ch.get("title", ""),
        "views": stats.get("viewCount", 0),
        "videos": stats.get("videoCount", 0),
    }

def get_hashtag_videos(tag_id, count=15):
    data = tikapi(f"/public/hashtag", f"id={tag_id}&count={count}")
    items = data.get("itemList", [])
    results = []
    for item in items:
        stats = item.get("stats", {})
        author = item.get("author", {})
        vid = item.get("id", "")
        created = item.get("createTime", 0)
        results.append({
            "id": vid,
            "desc": item.get("desc", "")[:200],
            "author": author.get("uniqueId", ""),
            "nickname": author.get("nickname", ""),
            "region": item.get("locationCreated", author.get("region", "")),
            "created": datetime.fromtimestamp(created, tz=timezone.utc).isoformat() if created else "",
            "views": stats.get("playCount", 0),
            "likes": stats.get("diggCount", 0),
            "comments": stats.get("commentCount", 0),
            "shares": stats.get("shareCount", 0),
            "url": f"https://www.tiktok.com/@{author.get('uniqueId', '')}/video/{vid}",
        })
    return sorted(results, key=lambda x: -(x.get("views", 0)))

def scan_tag(name, count=15):
    tag_info = get_hashtag_id(name)
    if not tag_info["id"]:
        return {"error": f"Hashtag #{name} not found", "tag": name}
    videos = get_hashtag_videos(tag_info["id"], count)
    return {
        "scan_time": datetime.now(timezone.utc).isoformat(),
        "hashtag": f"#{tag_info['title']}",
        "total_views": tag_info["views"],
        "total_videos": tag_info["videos"],
        "returned": len(videos),
        "videos": videos,
    }

def print_summary(data):
    if "error" in data:
        print(f"❌ {data['error']}")
        return
    print(f"\n{'='*60}")
    tv = data['total_views']
    tv_str = f"{int(tv):,}" if str(tv).isdigit() else str(tv)
    print(f"📱 TikTok: {data['hashtag']} ({tv_str} total views)")
    tv = data['total_videos']
    tv_str = f"{int(tv):,}" if str(tv).isdigit() else str(tv)
    print(f"   Videos: {tv_str} total | {data['returned']} returned")
    print(f"   Time: {data['scan_time']}")
    print(f"{'='*60}")
    for v in data.get("videos", [])[:10]:
        views = v["views"]
        vs = f"{views/1_000_000:.1f}M" if views >= 1_000_000 else f"{views/1000:.0f}K" if views >= 1000 else str(views)
        created = v.get("created", "?")[:16]
        region = f" 📍{v['region']}" if v.get("region") else ""
        print(f"\n  👁️ {vs} views | @{v['author']} | {created}{region}")
        print(f"  📝 {v['desc'][:100]}")
        print(f"  🔗 {v['url']}")

def main():
    parser = argparse.ArgumentParser(description="TikTok OSINT Scanner (TikAPI)")
    parser.add_argument("-k", "--keyword", help="Hashtag to search")
    parser.add_argument("--iran", action="store_true", help="Scan Iran-related hashtags")
    parser.add_argument("--limit", type=int, default=10, help="Videos per hashtag (default: 10)")
    parser.add_argument("--json", action="store_true", help="JSON output")
    args = parser.parse_args()

    if args.iran:
        results = {}
        for tag in IRAN_TAGS:
            try:
                results[tag] = scan_tag(tag, args.limit)
            except Exception as e:
                results[tag] = {"error": str(e)}
        if args.json:
            print(json.dumps(results, indent=2, ensure_ascii=False, default=str))
        else:
            for tag, data in results.items():
                print_summary(data)
    elif args.keyword:
        result = scan_tag(args.keyword, args.limit)
        if args.json:
            print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
        else:
            print_summary(result)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
