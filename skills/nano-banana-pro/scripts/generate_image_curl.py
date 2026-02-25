#!/usr/bin/env python3
"""
Nano Banana Pro 图像生成脚本（curl 版本）

使用 curl 绕过 Python SSL/TLS 问题
"""

import argparse
import base64
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

def parse_args():
    parser = argparse.ArgumentParser(description="Nano Banana Pro 图像生成 (curl)")
    parser.add_argument("prompt", type=str, help="图像生成提示词")
    parser.add_argument("--resolution", type=str, default="2K", 
                       choices=["1K", "2K", "4K"], help="分辨率")
    parser.add_argument("--aspect", type=str, default="16:9", 
                       help="宽高比 (1:1, 16:9, 9:16, 4:3, 3:4)")
    parser.add_argument("--output", type=str, default=".", 
                       help="输出目录")
    parser.add_argument("--reference", type=str, action="append", default=[],
                       help="参考图片路径")
    return parser.parse_args()

def load_image_as_base64(image_path: str) -> tuple[str, str]:
    """加载图片并转为 base64，返回 (mime_type, base64_data)"""
    ext = Path(image_path).suffix.lower()
    mime_map = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp'
    }
    mime_type = mime_map.get(ext, 'image/jpeg')
    
    with open(image_path, 'rb') as f:
        data = base64.b64encode(f.read()).decode('utf-8')
    return mime_type, data

def generate_image_curl(
    prompt: str,
    resolution: str,
    aspect_ratio: str,
    reference_images: list[str],
    api_key: str,
    base_url: str = "https://api.skyeye.net"
) -> dict:
    """使用 curl 调用 API"""
    
    # 构建请求体
    parts = [{"text": prompt}]
    
    # 添加参考图片
    for ref_path in reference_images:
        mime_type, data = load_image_as_base64(ref_path)
        parts.append({
            "inlineData": {
                "mimeType": mime_type,
                "data": data
            }
        })
    
    request_body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "response_modalities": ["TEXT", "IMAGE"],
            "image_config": {
                "aspect_ratio": aspect_ratio,
                "image_size": resolution
            }
        }
    }
    
    # 写入临时文件
    tmp_request = "/tmp/nano-banana-request.json"
    tmp_response = "/tmp/nano-banana-response.json"
    
    with open(tmp_request, 'w') as f:
        json.dump(request_body, f)
    
    # 调用 curl
    url = f"{base_url}/v1/models/gemini-3-pro-image-preview:generateContent"
    cmd = [
        "curl", "-s", "-X", "POST",
        "-H", f"Authorization: Bearer {api_key}",
        "-H", "Content-Type: application/json",
        "-d", f"@{tmp_request}",
        "--max-time", "180",
        url,
        "-o", tmp_response
    ]
    
    print(f"🚀 发送请求到 {base_url}...")
    print(f"   提示词: {prompt}")
    print(f"   分辨率: {resolution}, 宽高比: {aspect_ratio}")
    if reference_images:
        print(f"   参考图片: {len(reference_images)} 张")
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        raise RuntimeError(f"curl 失败: {result.stderr}")
    
    # 读取响应
    with open(tmp_response, 'r') as f:
        response = json.load(f)
    
    return response

def save_image(response: dict, output_dir: str) -> str:
    """从响应中保存图片"""
    candidates = response.get("candidates", [])
    if not candidates:
        raise ValueError("API 响应中没有候选结果")
    
    parts = candidates[0].get("content", {}).get("parts", [])
    
    # 找到图片部分
    image_part = None
    for part in parts:
        if "inlineData" in part:
            image_part = part["inlineData"]
            break
    
    if not image_part:
        raise ValueError("响应中没有图片数据")
    
    # 解析 MIME 类型和扩展名
    mime_type = image_part.get("mimeType", "image/jpeg")
    ext_map = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp"
    }
    ext = ext_map.get(mime_type, ".jpg")
    
    # 生成文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = Path(output_dir) / f"{timestamp}{ext}"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 保存图片
    image_data = base64.b64decode(image_part["data"])
    with open(output_path, 'wb') as f:
        f.write(image_data)
    
    return str(output_path)

def main():
    args = parse_args()
    
    # 获取 API 配置
    api_key = os.environ.get("GEMINI_API_KEY")
    base_url = os.environ.get("GEMINI_BASE_URL", "https://api.skyeye.net")
    
    if not api_key:
        print("❌ 错误: 未设置 GEMINI_API_KEY 环境变量", file=sys.stderr)
        sys.exit(1)
    
    try:
        # 生成图片
        response = generate_image_curl(
            prompt=args.prompt,
            resolution=args.resolution,
            aspect_ratio=args.aspect,
            reference_images=args.reference,
            api_key=api_key,
            base_url=base_url
        )
        
        # 保存图片
        output_path = save_image(response, args.output)
        
        print(f"✅ 图片已保存: {output_path}")
        print(f"   文件大小: {Path(output_path).stat().st_size / 1024:.1f} KB")
        
        return 0
        
    except Exception as e:
        print(f"❌ 生成失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
