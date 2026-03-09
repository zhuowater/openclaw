#!/usr/bin/env python3
"""
VIIRS 夜光卫星 — 伊朗电网损伤评估
使用 NASA VIIRS 夜间灯光数据评估城市电网受损情况
"""

import os
import json
import requests
from datetime import datetime, timedelta
from urllib.parse import urlencode
import numpy as np
from PIL import Image
import io

# 配置
OUTPUT_DIR = "/tmp/viirs"
CITIES = {
    "Tehran": {"lat": 35.6892, "lon": 51.3890, "bbox_size": 0.5},
    "Isfahan": {"lat": 32.6546, "lon": 51.6680, "bbox_size": 0.3},
    "Tabriz": {"lat": 38.0735, "lon": 46.2919, "bbox_size": 0.3},
    "Abadan": {"lat": 30.3392, "lon": 48.2842, "bbox_size": 0.2},
    "Bandar Abbas": {"lat": 27.1865, "lon": 56.2808, "bbox_size": 0.3},
    "Shiraz": {"lat": 29.5918, "lon": 52.5836, "bbox_size": 0.3},
}

# NASA GIBS WMS 配置
GIBS_WMS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
LAYER = "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance"

# 日期配置
BEFORE_DATE = "2025-02-27"  # 战前
AFTER_DATES = ["2025-03-02", "2025-03-03"]  # 战后

class VIIRSAnalyzer:
    def __init__(self):
        self.session = requests.Session()
        self.results = {}
        
    def get_bbox(self, lat, lon, size):
        """生成城市周围的边界框"""
        return {
            "west": lon - size,
            "south": lat - size,
            "east": lon + size,
            "north": lat + size
        }
    
    def download_nightlight_image(self, city_name, date_str, bbox):
        """从 NASA GIBS 下载夜光影像"""
        params = {
            "SERVICE": "WMS",
            "REQUEST": "GetMap",
            "VERSION": "1.3.0",
            "LAYERS": LAYER,
            "CRS": "EPSG:4326",
            "BBOX": f"{bbox['south']},{bbox['west']},{bbox['north']},{bbox['east']}",
            "WIDTH": "512",
            "HEIGHT": "512",
            "FORMAT": "image/png",
            "TIME": date_str
        }
        
        url = f"{GIBS_WMS_URL}?{urlencode(params)}"
        print(f"📡 Downloading {city_name} @ {date_str}...")
        print(f"   URL: {url[:100]}...")
        
        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            
            # 保存原始图像
            filename = f"{city_name}_{date_str}.png"
            filepath = os.path.join(OUTPUT_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(response.content)
            
            print(f"   ✓ Saved: {filepath}")
            return filepath
            
        except Exception as e:
            print(f"   ✗ Error: {e}")
            return None
    
    def calculate_brightness(self, image_path):
        """计算图像平均亮度（灯光强度）"""
        try:
            img = Image.open(image_path).convert('L')  # 转灰度
            pixels = np.array(img)
            
            # 过滤完全黑色的像素（无数据区域）
            valid_pixels = pixels[pixels > 0]
            
            if len(valid_pixels) == 0:
                return 0.0
            
            mean_brightness = float(np.mean(valid_pixels))
            median_brightness = float(np.median(valid_pixels))
            max_brightness = float(np.max(valid_pixels))
            
            return {
                "mean": mean_brightness,
                "median": median_brightness,
                "max": max_brightness,
                "valid_pixel_count": int(len(valid_pixels))
            }
        except Exception as e:
            print(f"   ✗ Brightness calculation error: {e}")
            return None
    
    def analyze_city(self, city_name, city_data):
        """分析单个城市的夜光变化"""
        print(f"\n{'='*60}")
        print(f"🌃 Analyzing: {city_name}")
        print(f"{'='*60}")
        
        bbox = self.get_bbox(city_data["lat"], city_data["lon"], city_data["bbox_size"])
        
        # 下载战前影像
        before_path = self.download_nightlight_image(city_name, BEFORE_DATE, bbox)
        if not before_path:
            return None
        
        before_brightness = self.calculate_brightness(before_path)
        if not before_brightness:
            return None
        
        # 下载战后影像
        after_images = []
        for after_date in AFTER_DATES:
            after_path = self.download_nightlight_image(city_name, after_date, bbox)
            if after_path:
                after_brightness = self.calculate_brightness(after_path)
                if after_brightness:
                    after_images.append({
                        "date": after_date,
                        "path": after_path,
                        "brightness": after_brightness
                    })
        
        if not after_images:
            return None
        
        # 计算平均战后亮度
        avg_after_brightness = {
            "mean": np.mean([img["brightness"]["mean"] for img in after_images]),
            "median": np.mean([img["brightness"]["median"] for img in after_images]),
            "max": np.mean([img["brightness"]["max"] for img in after_images])
        }
        
        # 计算变化百分比
        change_pct = {
            "mean": ((avg_after_brightness["mean"] - before_brightness["mean"]) / before_brightness["mean"] * 100) if before_brightness["mean"] > 0 else 0,
            "median": ((avg_after_brightness["median"] - before_brightness["median"]) / before_brightness["median"] * 100) if before_brightness["median"] > 0 else 0,
            "max": ((avg_after_brightness["max"] - before_brightness["max"]) / before_brightness["max"] * 100) if before_brightness["max"] > 0 else 0
        }
        
        result = {
            "city": city_name,
            "coordinates": {"lat": city_data["lat"], "lon": city_data["lon"]},
            "before": {
                "date": BEFORE_DATE,
                "brightness": before_brightness
            },
            "after": {
                "dates": AFTER_DATES,
                "brightness": avg_after_brightness,
                "images": after_images
            },
            "change_percent": change_pct,
            "assessment": self.assess_damage(change_pct["mean"])
        }
        
        # 打印结果
        print(f"\n📊 Results for {city_name}:")
        print(f"   Before ({BEFORE_DATE}): {before_brightness['mean']:.2f} (mean)")
        print(f"   After (avg): {avg_after_brightness['mean']:.2f} (mean)")
        print(f"   Change: {change_pct['mean']:+.2f}%")
        print(f"   Assessment: {result['assessment']}")
        
        return result
    
    def assess_damage(self, change_pct):
        """根据亮度变化评估损伤程度"""
        if change_pct >= -5:
            return "No significant damage"
        elif change_pct >= -15:
            return "Minor damage - localized outages"
        elif change_pct >= -30:
            return "Moderate damage - widespread outages"
        elif change_pct >= -50:
            return "Severe damage - major infrastructure loss"
        else:
            return "Critical damage - catastrophic grid failure"
    
    def run_analysis(self):
        """运行完整分析"""
        print("🛰️  VIIRS Nightlight Analysis - Iran Power Grid Assessment")
        print(f"📅 Analysis Period: {BEFORE_DATE} → {AFTER_DATES}")
        print(f"📁 Output Directory: {OUTPUT_DIR}")
        
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        
        results = []
        for city_name, city_data in CITIES.items():
            result = self.analyze_city(city_name, city_data)
            if result:
                results.append(result)
        
        # 保存 JSON 结果
        output_file = os.path.join(OUTPUT_DIR, "iran_grid_assessment.json")
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump({
                "analysis_date": datetime.now().isoformat(),
                "before_date": BEFORE_DATE,
                "after_dates": AFTER_DATES,
                "cities": results
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*60}")
        print(f"✅ Analysis complete!")
        print(f"📄 JSON report: {output_file}")
        print(f"🖼️  Images saved in: {OUTPUT_DIR}")
        print(f"{'='*60}")
        
        # 生成总结
        self.print_summary(results)
        
        return results
    
    def print_summary(self, results):
        """打印分析总结"""
        print("\n" + "="*60)
        print("📋 SUMMARY - Iran Power Grid Damage Assessment")
        print("="*60)
        
        if not results:
            print("❌ No valid results")
            return
        
        for result in sorted(results, key=lambda x: x["change_percent"]["mean"]):
            city = result["city"]
            change = result["change_percent"]["mean"]
            assessment = result["assessment"]
            
            emoji = "🟢" if change >= -5 else "🟡" if change >= -15 else "🟠" if change >= -30 else "🔴"
            print(f"{emoji} {city:15s}: {change:+7.2f}% | {assessment}")

if __name__ == "__main__":
    analyzer = VIIRSAnalyzer()
    analyzer.run_analysis()
