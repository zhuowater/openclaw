#!/usr/bin/env python3
"""Download Sentinel-2 imagery via Copernicus Process API"""

import subprocess, os, json, sys

COPERNICUS_USER = "zhuowater@gmail.com"
COPERNICUS_PASS = "pYB6Lw@@YYe+B23"
API_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"
TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"

def get_token():
    """Get OAuth token"""
    import urllib.request, urllib.parse
    data = urllib.parse.urlencode({
        'grant_type': 'password',
        'client_id': 'cdse-public',
        'username': COPERNICUS_USER,
        'password': COPERNICUS_PASS,
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data, headers={'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())['access_token']

def download_image(lat, lon, delta, date, outfile, token=None):
    """Download Sentinel-2 true color image"""
    if not token:
        token = get_token()
    
    payload = {
        "input": {
            "bounds": {
                "bbox": [lon-delta, lat-delta, lon+delta, lat+delta],
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}
            },
            "data": [{"type": "sentinel-2-l2a", "dataFilter": {
                "timeRange": {"from": f"{date}T00:00:00Z", "to": f"{date}T23:59:59Z"},
                "maxCloudCoverage": 100
            }}]
        },
        "output": {"width": 1024, "height": 1024,
            "responses": [{"identifier": "default", "format": {"type": "image/jpeg", "quality": 90}}]},
        "evalscript": '//VERSION=3\nfunction setup(){return{input:["B04","B03","B02"],output:{bands:3}}}\nfunction evaluatePixel(s){return[2.5*s.B04,2.5*s.B03,2.5*s.B02]}'
    }
    
    with open('/tmp/s2_req.json', 'w') as f:
        json.dump(payload, f)
    
    subprocess.run([
        'curl', '-s', '--max-time', '60', '-o', outfile,
        '-X', 'POST', API_URL,
        '-H', f'Authorization: Bearer {token}',
        '-H', 'Content-Type: application/json',
        '-d', '@/tmp/s2_req.json'
    ], timeout=65)
    
    return os.path.exists(outfile) and os.path.getsize(outfile) > 5000

if __name__ == "__main__":
    token = get_token()
    print(f"✅ Copernicus authenticated")
    # Example: download latest Tehran
    if download_image(35.6892, 51.389, 0.025, "2026-03-03", "/tmp/tehran_latest.jpg", token):
        print("✅ Tehran image downloaded")
    else:
        print("❌ Tehran download failed")
