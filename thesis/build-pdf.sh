#!/bin/bash
# Build thesis PDF from markdown chapters
set -e

THESIS_DIR="/root/openclaw/thesis"
OUTPUT="$THESIS_DIR/thesis-complete.pdf"
IMAGES="$THESIS_DIR/images"

cd "$THESIS_DIR"

# Create master markdown
echo "Building master document..."
cat > master.md << 'FRONTMATTER'
---
title: "网络安全的数学-物理学本质：从不可能性定理到新范式"
author: "奇安信机器人 (Agent ID: node_5e984e0508cc)"
date: "2026年2月"
documentclass: report
classoption:
  - a4paper
  - 12pt
geometry:
  - margin=2.5cm
header-includes:
  - \usepackage{fontspec}
  - \setmainfont{Noto Serif CJK SC}
  - \setsansfont{Noto Sans CJK SC}
  - \setmonofont{Noto Sans Mono CJK SC}
  - \usepackage{amsmath,amssymb,amsthm}
  - \usepackage{graphicx}
  - \usepackage{float}
  - \usepackage{titlesec}
  - \usepackage{fancyhdr}
  - \usepackage{hyperref}
  - \hypersetup{colorlinks=true,linkcolor=black,urlcolor=blue}
  - \pagestyle{fancy}
  - \fancyhead[L]{\leftmark}
  - \fancyhead[R]{\thepage}
  - \newtheorem{theorem}{定理}[chapter]
  - \newtheorem{definition}{定义}[chapter]
  - \newtheorem{proposition}{命题}[chapter]
  - \renewcommand{\chaptername}{第}
  - \renewcommand{\thechapter}{\arabic{chapter}}
  - \titleformat{\chapter}[display]{\normalfont\huge\bfseries}{第\thechapter 章}{20pt}{\Huge}
---

\newpage
\tableofcontents
\newpage

FRONTMATTER

# Part headers and chapter files
declare -A PARTS
PARTS[1]="第一部分：危机——当前安全范式的失效"
PARTS[5]="第二部分：基础——数学与物理学的不可能性定理"
PARTS[10]="第三部分：映射——从定理到安全系统的结构同构"
PARTS[15]="第四部分：重构——基于约束的新安全范式"
PARTS[20]="第五部分：应用——垂直领域的深度分析"
PARTS[24]="第六部分：未来——5年内的技术与威胁演化"
PARTS[28]="第七部分：实践——可落地的框架与工具"
PARTS[33]="第八部分：哲学——安全的本体论与认识论"
PARTS[36]="第九部分：结论"

for ch in $(seq 1 39); do
  # Add part header if this chapter starts a new part
  if [ -n "${PARTS[$ch]}" ]; then
    echo "" >> master.md
    echo "\\part{${PARTS[$ch]}}" >> master.md
    echo "" >> master.md
  fi
  
  f="chapter-$(printf '%02d' $ch).md"
  
  # Add chapter illustration if exists
  img="$IMAGES/ch$(printf '%02d' $ch).png"
  if [ -f "$img" ]; then
    echo "" >> master.md
    echo "\\begin{figure}[H]" >> master.md
    echo "\\centering" >> master.md
    echo "\\includegraphics[width=0.6\\textwidth]{$img}" >> master.md
    echo "\\end{figure}" >> master.md
    echo "" >> master.md
  fi
  
  # Append chapter content
  cat "$f" >> master.md
  echo -e "\n\n" >> master.md
done

echo "Converting to PDF..."
pandoc master.md \
  -o "$OUTPUT" \
  --pdf-engine=xelatex \
  --toc \
  --toc-depth=3 \
  -V mainfont="Noto Serif CJK SC" \
  -V sansfont="Noto Sans CJK SC" \
  -V monofont="Noto Sans Mono CJK SC" \
  -V CJKmainfont="Noto Serif CJK SC" \
  --highlight-style=tango \
  2>&1

echo "✅ PDF generated: $OUTPUT"
ls -lh "$OUTPUT"
