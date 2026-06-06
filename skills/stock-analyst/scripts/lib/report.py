"""
报告导出模块
Markdown → HTML → PDF（via Chrome headless）
"""
import os
import subprocess
import tempfile
from datetime import datetime


def _chrome_path() -> str:
    """Find a Chrome/Chromium executable on macOS/Linux."""
    candidates = [
        os.environ.get("CHROME_PATH"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    raise RuntimeError("未找到 Chrome/Chromium；Markdown 已保存，PDF 需安装 chromium 或设置 CHROME_PATH")


CSS = """
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap');
  * { box-sizing: border-box; }
  body {
    font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-size: 13px; line-height: 1.7; color: #1a1a1a;
    max-width: 900px; margin: 0 auto; padding: 32px 40px;
  }
  h1 { font-size: 22px; border-bottom: 3px solid #1a56db; padding-bottom: 8px; margin-top: 28px; }
  h2 { font-size: 17px; border-left: 4px solid #1a56db; padding-left: 10px; margin-top: 24px; color: #1a56db; }
  h3 { font-size: 14px; margin-top: 18px; color: #374151; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12px; }
  th { background: #1a56db; color: white; padding: 7px 10px; text-align: left; }
  td { padding: 6px 10px; border: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  code { background: #f3f4f6; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  pre { background: #1f2937; color: #e5e7eb; padding: 14px; border-radius: 6px; overflow-x: auto; }
  blockquote { border-left: 4px solid #e5e7eb; margin: 12px 0; padding: 8px 16px; color: #6b7280; }
  strong { color: #111827; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  @media print {
    body { padding: 20px 30px; }
    h1 { page-break-before: auto; }
    table { page-break-inside: avoid; }
  }
</style>
"""


def md_to_pdf(md_path: str, pdf_path: str = None) -> str:
    """
    将 Markdown 文件转换为 PDF
    Args:
        md_path:  输入 .md 文件路径
        pdf_path: 输出 .pdf 路径（默认与 md 同目录同名）
    Returns:
        str: 生成的 pdf 路径
    """
    import markdown as mdlib

    if pdf_path is None:
        pdf_path = md_path.replace(".md", ".pdf")

    # Step 1: md → html
    with open(md_path, "r", encoding="utf-8") as f:
        md_content = f.read()

    html_body = mdlib.markdown(
        md_content,
        extensions=["tables", "fenced_code", "nl2br", "sane_lists"],
    )

    title = os.path.basename(md_path).replace(".md", "")
    html_full = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>{title}</title>
  {CSS}
</head>
<body>
{html_body}
</body>
</html>"""

    # Step 2: 写临时 html
    with tempfile.NamedTemporaryFile(mode="w", suffix=".html",
                                     encoding="utf-8", delete=False) as tmp:
        tmp.write(html_full)
        tmp_html = tmp.name

    # Step 3: Chrome headless → pdf
    try:
        cmd = [
            _chrome_path(),
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-web-security",
            f"--print-to-pdf={pdf_path}",
            "--print-to-pdf-no-header",
            tmp_html,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if not os.path.exists(pdf_path):
            raise RuntimeError(f"PDF未生成: {result.stderr[:300]}")
    finally:
        os.unlink(tmp_html)

    return pdf_path


def save_report(content: str, ts_code: str, name: str = "",
                output_dir: str = ".") -> dict:
    """
    保存分析报告为 .md 和 .pdf
    Args:
        content:    完整 markdown 字符串
        ts_code:    股票代码（用于文件名）
        name:       股票名称（可选）
        output_dir: 输出目录（默认当前目录）
    Returns:
        dict: {"md": md_path, "pdf": pdf_path}
    """
    os.makedirs(output_dir, exist_ok=True)

    date_str = datetime.today().strftime("%Y%m%d")
    stem = f"{name}_{ts_code}_{date_str}" if name else f"{ts_code}_{date_str}"
    # 去掉文件名中的非法字符
    stem = stem.replace("/", "-").replace("\\", "-").replace(" ", "_")

    md_path  = os.path.join(output_dir, f"{stem}.md")
    pdf_path = os.path.join(output_dir, f"{stem}.pdf")

    # 写 markdown
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(content)

    # 生成 pdf
    try:
        md_to_pdf(md_path, pdf_path)
        pdf_ok = True
    except Exception as e:
        pdf_path = None
        pdf_ok = False
        pdf_err = str(e)

    return {
        "md":  md_path,
        "pdf": pdf_path if pdf_ok else None,
        "pdf_error": None if pdf_ok else pdf_err,
    }
