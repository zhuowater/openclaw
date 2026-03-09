---
name: video-download
description: 搜索和下载视频。支持抖音、快手、小红书、B站、微博（通过速推AI解析），以及YouTube搜索。当用户要求下载视频、获取视频、解析视频链接时使用。
---

# 视频搜索与下载

## 支持平台

| 平台 | 搜索 | 下载 | 方式 |
|------|------|------|------|
| 抖音 | ✅ 百度搜索 | ✅ | 速推AI parse_video |
| 快手 | ✅ 百度搜索 | ✅ | 速推AI parse_video |
| 小红书 | ✅ 百度搜索 | ✅ | 速推AI parse_video |
| B站 | ✅ 百度搜索 | ✅ | 速推AI parse_video |
| 微博 | ✅ 百度搜索 | ✅ | 速推AI parse_video |
| YouTube | ✅ yt-dlp | ❌ 需cookies | yt-dlp (被bot检测拦截) |

## 一、国内平台视频下载（推荐）

### 步骤1: 搜索视频

用百度搜索找目标视频链接：

```bash
mcporter call baidu-search.AIsearch query="抖音 关键词 douyin.com/video"
mcporter call baidu-search.AIsearch query="B站 关键词 bilibili.com/video"
mcporter call baidu-search.AIsearch query="快手 关键词"
mcporter call baidu-search.AIsearch query="小红书 关键词"
```

从搜索结果中提取视频链接（如 `douyin.com/video/xxx`、`bilibili.com/video/BVxxx`）。

### 步骤2: 解析视频

用速推AI的 `parse_video` 获取无水印下载地址：

```bash
mcporter call 速推AI.parse_video url="https://www.douyin.com/video/7613576525401494650"
```

返回结果中关键字段：
- `video_url`: 主视频下载地址
- `video_urls`: 多清晰度视频地址列表
- `title`: 视频标题
- `audio_url`: 音频地址
- `image_urls`: 封面/图片

### 步骤3: 下载视频

```bash
curl -L -o /tmp/video.mp4 "视频URL"
```

### 完整示例

```bash
# 1. 搜索伊朗相关抖音视频
mcporter call baidu-search.AIsearch query="抖音 伊朗战争 douyin.com/video"

# 2. 解析获取下载地址
mcporter call 速推AI.parse_video url="https://www.douyin.com/video/7613576525401494650"

# 3. 下载（从返回的 video_url 字段）
curl -L -o /tmp/iran-war.mp4 "https://aweme.snssdk.com/aweme/v1/play/?video_id=xxx..."
```

### 注意事项

- `parse_video` 免费使用，无需额外费用
- 返回的是无水印视频地址
- 链接有时效性，获取后尽快下载
- 抖音图文笔记（note）只会返回图片，无视频URL
- `douyin.com/video/xxx` 格式成功率最高
- 短链接 `v.douyin.com/xxx` 可能返回503，建议用完整链接

## 二、YouTube（仅搜索可用）

### 搜索

```bash
python3 /root/openclaw/skills/video-download/yt_search.py "关键词" -n 5
```

返回 JSON: `[{id, title, duration}, ...]`

### 下载（需要cookies）

当前服务器 IP 被 YouTube 识别为 bot，直接下载会被拦截。

**如果有 cookies 文件**：
```bash
yt-dlp --proxy socks5://127.0.0.1:7880 \
  --cookies /path/to/youtube-cookies.txt \
  -f "best[height<=720]" \
  -o "/tmp/yt-downloads/%(id)s.%(ext)s" \
  "https://youtube.com/watch?v=VIDEO_ID"
```

**获取 cookies 方法**：用户从已登录的浏览器导出 cookies.txt 文件。

## 三、B站下载注意事项（重要）

B站使用 DASH 格式，音视频分离，下载流程比抖音复杂：

```bash
# 1. 解析获取视频和音频流
mcporter call 速推AI.parse_video url="https://www.bilibili.com/video/BVxxxxxx"
# all_medias 里 type=video 和 type=audio 分别有多个清晰度

# 2. 分别下载（必须带 Referer 防盗链头）
curl -L -o /tmp/video.m4s -H "Referer: https://www.bilibili.com" -H "User-Agent: Mozilla/5.0" "视频URL"
curl -L -o /tmp/audio.m4s -H "Referer: https://www.bilibili.com" -H "User-Agent: Mozilla/5.0" "音频URL"

# 3. m4s 格式需要转码修复再合并（直接 -c copy 会报 Invalid sample size）
ffmpeg -y -i /tmp/audio.m4s -c:a aac -b:a 64k /tmp/audio_fixed.m4a
ffmpeg -y -i /tmp/video.m4s -c:v libx264 -crf 28 -preset ultrafast /tmp/video_fixed.mp4
ffmpeg -y -i /tmp/video_fixed.mp4 -i /tmp/audio_fixed.m4a -c copy -shortest -movflags +faststart /tmp/final.mp4
```

**已知限制**：
- B站 CDN 对服务器 IP 限速，长视频（>15分钟）可能下载不完整
- 选最小清晰度（360P AV1）减少下载量
- 下载后检查 ffprobe duration 确认是否完整

## 四、代理规则

- 国内平台（抖音/快手/B站/小红书/微博）：**不需要代理**
- YouTube：需要 `socks5://127.0.0.1:7880` 代理
- 速推AI mcporter 调用：**不需要代理**
