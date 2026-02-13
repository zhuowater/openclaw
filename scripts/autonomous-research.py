#!/usr/bin/env python3
"""
Autonomous Research Agent
自主研究工具 - 定期收集、分析、总结信息

用途：
1. 定期搜索 AI 安全、Agent 发展等话题
2. 自动分析重要性和趋势
3. 生成结构化报告
4. 更新记忆系统
"""

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# 配置
RESEARCH_TOPICS = [
    {
        "id": "ai-safety",
        "name": "AI 安全态势",
        "query": "AI安全 2026 漏洞 攻击 防御",
        "keywords": ["CVE", "漏洞", "攻击", "AI安全", "对抗"],
        "importance": "high"
    },
    {
        "id": "agent-dev",
        "name": "Agent 技术发展",
        "query": "AI Agent 自主 智能体 2026 发展",
        "keywords": ["Agent", "智能体", "自主", "MCP", "A2A"],
        "importance": "high"
    },
    {
        "id": "cyber-threats",
        "name": "网络威胁情报",
        "query": "网络安全 威胁 APT 攻击 2026",
        "keywords": ["APT", "攻击", "恶意软件", "供应链", "勒索"],
        "importance": "high"
    },
    {
        "id": "quantum-computing",
        "name": "量子计算进展",
        "query": "量子计算 量子纠错 商业化 2026",
        "keywords": ["量子", "qubit", "商业化", "量子纠错"],
        "importance": "medium"
    }
]

MEMORY_DIR = Path("/root/openclaw/memory")
REPORTS_DIR = Path("/root/openclaw/reports")
STATE_FILE = Path("/root/openclaw/.research_state.json")


def load_state():
    """加载研究状态"""
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_run": None, "findings": []}


def save_state(state):
    """保存研究状态"""
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False))


def search_baidu(query: str) -> list:
    """使用百度搜索 MCP"""
    try:
        result = subprocess.run(
            ["mcporter", "call", f"baidu-search.AIsearch(query: '{query}')"],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            return [{"raw": result.stdout}]
        else:
            print(f"搜索失败: {result.stderr}", file=sys.stderr)
            return []
    except Exception as e:
        print(f"搜索异常: {e}", file=sys.stderr)
        return []


def search_hn(query: str) -> list:
    """搜索 Hacker News"""
    import urllib.parse
    try:
        url = f"https://hn.algolia.com/api/v1/search?query={urllib.parse.quote(query)}&hitsPerPage=10"
        result = subprocess.run(
            ["curl", "-s", url],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout)
            hits = data.get("hits", [])
            return [
                {
                    "title": h.get("title", ""),
                    "url": h.get("url", ""),
                    "points": h.get("points", 0),
                    "date": h.get("created_at", "")
                }
                for h in hits
            ]
        return []
    except Exception as e:
        print(f"HN搜索异常: {e}", file=sys.stderr)
        return []


def analyze_findings(topic: dict, findings: list) -> dict:
    """分析研究结果"""
    analysis = {
        "topic": topic["name"],
        "query": topic["query"],
        "timestamp": datetime.now().isoformat(),
        "findings_count": len(findings),
        "summary": "",
        "highlights": []
    }
    
    # 简单的关键词匹配分析
    keyword_matches = {}
    for kw in topic["keywords"]:
        count = 0
        for f in findings:
            text = str(f).lower()
            if kw.lower() in text:
                count += 1
        if count > 0:
            keyword_matches[kw] = count
    
    analysis["keyword_matches"] = keyword_matches
    
    # 生成简单摘要
    if findings:
        analysis["summary"] = f"发现 {len(findings)} 条相关信息，关键词命中: {keyword_matches}"
    else:
        analysis["summary"] = "未找到相关信息"
    
    return analysis


def generate_report(analyses: list) -> str:
    """生成研究报告"""
    report_lines = [
        f"# 自主研究报告",
        f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "---",
        ""
    ]
    
    for a in analyses:
        report_lines.append(f"## {a['topic']}")
        report_lines.append(f"**查询**: {a['query']}")
        report_lines.append(f"**摘要**: {a['summary']}")
        report_lines.append(f"**关键词命中**: {a['keyword_matches']}")
        report_lines.append("")
    
    report_lines.extend([
        "---",
        "",
        "*本报告由奇安信机器人自主生成*"
    ])
    
    return "\n".join(report_lines)


def update_memory(report: str):
    """更新记忆系统"""
    today = datetime.now().strftime("%Y-%m-%d")
    memory_file = MEMORY_DIR / f"{today}.md"
    
    if memory_file.exists():
        content = memory_file.read_text()
        if "## 自主研究报告" not in content:
            # 追加报告
            memory_file.write_text(content + "\n\n" + report)
    else:
        # 创建新文件
        memory_file.write_text(f"# {today} 记忆\n\n{report}")


def main():
    """主函数"""
    print("🔍 开始自主研究...")
    
    # 加载状态
    state = load_state()
    
    # 检查是否今天已运行
    today = datetime.now().strftime("%Y-%m-%d")
    if state.get("last_run", "").startswith(today):
        print("✅ 今天已完成研究，跳过")
        return
    
    all_analyses = []
    
    for topic in RESEARCH_TOPICS:
        print(f"\n📡 研究: {topic['name']}")
        
        # 搜索
        baidu_results = search_baidu(topic["query"])
        hn_results = search_hn(topic["query"])
        
        all_findings = baidu_results + hn_results
        print(f"   - 百度: {len(baidu_results)} 条")
        print(f"   - HN: {len(hn_results)} 条")
        
        # 分析
        analysis = analyze_findings(topic, all_findings)
        all_analyses.append(analysis)
    
    # 生成报告
    report = generate_report(all_analyses)
    
    # 保存报告
    REPORTS_DIR.mkdir(exist_ok=True)
    report_file = REPORTS_DIR / f"autonomous-{today}.md"
    report_file.write_text(report)
    print(f"\n📝 报告已保存: {report_file}")
    
    # 更新记忆
    update_memory(report)
    print("🧠 记忆已更新")
    
    # 更新状态
    state["last_run"] = datetime.now().isoformat()
    save_state(state)
    
    print("\n✅ 自主研究完成")


if __name__ == "__main__":
    main()
