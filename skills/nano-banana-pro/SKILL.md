---
name: nano-banana-pro
description: Generate/edit images with Nano Banana Pro (Gemini 3 Pro Image). Successfully tested with Skyeye proxy. Use for image create/modify requests. Supports text-to-image + image-to-image via --reference parameter.
---

# Nano Banana Pro Image Generation & Editing

Generate new images or edit existing ones using Google's Nano Banana Pro API (Gemini 3 Pro Image) via Skyeye proxy.

✅ **Verified working with Skyeye** (base URL: `https://api.skyeye.net`)

## Setup

The skill uses a uv-managed virtual environment located at `/root/openclaw/skills/nano-banana-pro/venv/`.

**Dependencies** (already installed):
- `google-genai` 1.62.0 - Google's official Gemini SDK
- `pillow` 12.1.0 - Image processing
- `python-dotenv` 1.2.1 - Environment variable management
- `google-auth` 2.48.0 - Authentication

## Usage

**Important:** The script uses **positional `prompt` argument**, not `--prompt`. Always run from the user's current working directory so images are saved where the user is working.

**Generate new image:**
```bash
export GEMINI_API_KEY="$SKYEYE_API_KEY"
export GEMINI_BASE_URL="https://api.skyeye.net"

/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "your image description" \
  [--resolution 1K|2K|4K] \
  [--aspect 16:9|1:1|...] \
  [--output ./output_directory]
```

**Edit existing image (image-to-image):**
```bash
export GEMINI_API_KEY="$SKYEYE_API_KEY"
export GEMINI_BASE_URL="https://api.skyeye.net"

/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "editing instructions" \
  --reference "path/to/input.png" \
  [--resolution 1K|2K|4K] \
  [--aspect 16:9] \
  [--output ./output_directory]
```

**Multiple reference images** (up to 14):
```bash
/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "combine these images" \
  --reference image1.png \
  --reference image2.png \
  --reference image3.png \
  --resolution 4K
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | **positional** | (required) | Image generation or editing prompt |
| `--resolution` | choice | `2K` | Output resolution: `1K`, `2K`, or `4K` |
| `--aspect` | string | `16:9` | Aspect ratio (e.g., `1:1`, `16:9`, `4:3`) |
| `--output` | path | `./generated_images` | Output directory for generated images |
| `--reference` | path | (none) | Reference image path (repeatable, max 14) |

## Environment Variables

**Required:**
- `GEMINI_API_KEY` - Your Skyeye API key

**Optional:**
- `GEMINI_BASE_URL` - Custom base URL (default uses Google's official API)
  - For Skyeye: `https://api.skyeye.net`

Alternatively, create a `.env` file in `/root/openclaw/skills/nano-banana-pro/scripts/`:
```bash
GEMINI_API_KEY=sk-your-skyeye-key
GEMINI_BASE_URL=https://api.skyeye.net
```

## Default Workflow (draft → iterate → final)

Goal: fast iteration without burning time on 4K until the prompt is correct.

**1. Draft (1K)** - quick feedback loop:
```bash
export GEMINI_API_KEY="$SKYEYE_API_KEY"
export GEMINI_BASE_URL="https://api.skyeye.net"

/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "可爱的蓝色机器人" \
  --resolution 1K \
  --output .
```

**2. Iterate** - adjust prompt, keep iterating until satisfied:
- For image editing: use `--reference` with the previous output
- Keep tweaking the prompt in small steps

**3. Final (4K)** - only when prompt is perfect:
```bash
/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "可爱的蓝色机器人，细节丰富" \
  --resolution 4K \
  --output .
```

## Resolution Options

Map user requests to API parameters:
- "low resolution", "draft", "1K" → `--resolution 1K`
- "normal", "2K" (default) → `--resolution 2K`  
- "high resolution", "4K", "ultra" → `--resolution 4K`

## Output Format

- Images are saved with auto-generated timestamp filenames: `YYYYMMDD_HHMMSS.png`
- Default output directory: `./generated_images` (auto-created)
- Override with `--output` to save elsewhere
- Script prints: `[Success] 画像を保存しました: /path/to/image.png`

**Filename examples:**
- `20260207_232137.png`
- `20260207_235942.jpg`

## Image Editing (Image-to-Image)

When the user wants to modify an existing image:

1. Check if they provide an image path or reference an image in the current directory
2. Use `--reference` parameter with the path to the image
3. The prompt should contain editing instructions

**Examples:**
```bash
# Make sky more dramatic
/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "make the sky more dramatic with storm clouds" \
  --reference original-photo.jpg \
  --resolution 2K

# Change style
/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "change to watercolor painting style" \
  --reference photo.png \
  --resolution 4K

# Remove/add elements
/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "remove the person in the background" \
  --reference scene.jpg
```

## Prompt Handling

**For generation:** Pass user's image description as-is to the positional `prompt` argument. Only rework if clearly insufficient.

**For editing:** Pass editing instructions in `prompt` (e.g., "add a rainbow in the sky", "make it look like a watercolor painting")

Preserve user's creative intent in both cases.

## Preflight Checks

Before running, verify:
```bash
# 1. Virtual environment exists
test -f /root/openclaw/skills/nano-banana-pro/venv/bin/python || echo "venv missing"

# 2. API key is set
test -n "$GEMINI_API_KEY" || echo "GEMINI_API_KEY not set"

# 3. Base URL is set (for Skyeye)
test -n "$GEMINI_BASE_URL" || echo "GEMINI_BASE_URL not set (will use Google's API)"

# 4. Reference image exists (if editing)
test -f "path/to/input.png" || echo "reference image not found"
```

## Common Failures & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `GEMINI_API_KEY 環境変数が設定されていません` | API key not set | `export GEMINI_API_KEY="$SKYEYE_API_KEY"` |
| `参照画像が見つかりません` | Wrong reference image path | Verify `--reference` path is correct |
| Timeout (>5 min) | Skyeye API slow response | **Normal for 4K images**, script will complete eventually |
| `404 Invalid URL` | Wrong base URL format | Use `https://api.skyeye.net` (no `/v1` suffix) |
| `画像を保存しました` then SIGKILL | Script completed, timeout killed it | **This is success!** Check output directory for image |

⚠️ **Skyeye timeout behavior:** The script may be killed by timeout (SIGKILL) but **check the output** - the image is often saved before the kill signal. Look for `[Success] 画像を保存しました:` in the logs.

## Examples

**Generate new image:**
```bash
export GEMINI_API_KEY="$SKYEYE_API_KEY"
export GEMINI_BASE_URL="https://api.skyeye.net"

cd /root/openclaw  # Work in your current directory

/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "A serene Japanese garden with cherry blossoms at sunset" \
  --resolution 4K \
  --aspect 16:9 \
  --output .
```

**Edit existing image:**
```bash
/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "make the colors more vibrant and saturated" \
  --reference test-robot-20260207-232137.png \
  --resolution 2K \
  --output .
```

**Quick test (1K resolution):**
```bash
export GEMINI_API_KEY="$SKYEYE_API_KEY"
export GEMINI_BASE_URL="https://api.skyeye.net"

/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  "可爱的蓝色机器人" \
  --resolution 1K \
  --output .
```

## Rebuilding Virtual Environment

If you need to recreate the virtual environment:

```bash
cd /root/openclaw/skills/nano-banana-pro
rm -rf venv
uv venv venv --python python3
source venv/bin/activate
uv pip install google-genai pillow python-dotenv google-auth
```

## Troubleshooting

**Check virtual environment:**
```bash
ls -la /root/openclaw/skills/nano-banana-pro/venv/
/root/openclaw/skills/nano-banana-pro/venv/bin/python --version
/root/openclaw/skills/nano-banana-pro/venv/bin/pip list | grep -E "google|pillow"
```

**Test script directly:**
```bash
export GEMINI_API_KEY="$SKYEYE_API_KEY"
export GEMINI_BASE_URL="https://api.skyeye.net"

/root/openclaw/skills/nano-banana-pro/venv/bin/python \
  /root/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  --help
```

**Check if image was generated despite timeout:**
```bash
# Look for recently created images
ls -lth ./generated_images/ | head -5
ls -lth . | grep -E "\.png|\.jpg" | head -5
```

## Success Indicators

✅ Script prints: `[Success] 画像を保存しました: /path/to/image.png`  
✅ Image file exists at the printed path  
✅ Even if process is killed (SIGKILL), check output - image may be saved  

**Verified working:** Generated `/root/openclaw/test-robot-20260207-232137.png` successfully via Skyeye proxy.
