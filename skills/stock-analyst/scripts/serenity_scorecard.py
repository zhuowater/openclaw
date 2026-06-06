#!/usr/bin/env python3
"""Stock Analyst Serenity-style bottleneck scorecard.

Usage:
  python scripts/serenity_scorecard.py --template
  python scripts/serenity_scorecard.py scorecard.json --format md
  cat scorecard.json | python scripts/serenity_scorecard.py - --format both

All ratings are 0-5. Positive factors are weighted to 100 before penalties.
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, Tuple

WEIGHTS = {
    "demand_inflection": 15,
    "architecture_coupling": 10,
    "bottleneck_severity": 15,
    "supplier_concentration": 12,
    "expansion_difficulty": 12,
    "evidence_quality": 15,
    "valuation_disconnect": 11,
    "catalyst_timing": 10,
}

PENALTY_MULTIPLIER = 2.0

TEMPLATE = {
    "ticker": "688XXX.SH",
    "company": "示例公司",
    "market": "A-share/HK/US/Taiwan/Japan/Korea/Europe",
    "chain_layer": "设备/材料/封测/芯片/模组/基础设施等",
    "bottleneck_role": "controls/supplies/benefits/theme-only",
    "factors": {key: 0 for key in WEIGHTS},
    "penalties": {
        "dilution_financing": 0,
        "governance": 0,
        "geopolitics": 0,
        "liquidity": 0,
        "hype_crowding": 0,
        "accounting_quality": 0,
        "cyclicality": 0,
        "substitution_risk": 0,
    },
    "evidence": [
        {"claim": "", "source": "filing/announcement/media/social", "strength": "strong/medium/weak"}
    ],
    "what_market_may_miss": "",
    "kill_switches": ["", "", ""],
}

LABEL_ZH = {
    "demand_inflection": "需求拐点",
    "architecture_coupling": "架构耦合度",
    "bottleneck_severity": "卡点严重度",
    "supplier_concentration": "供应集中度",
    "expansion_difficulty": "扩产难度",
    "evidence_quality": "证据质量",
    "valuation_disconnect": "估值错位",
    "catalyst_timing": "催化时点",
    "dilution_financing": "融资摊薄",
    "governance": "治理风险",
    "geopolitics": "地缘风险",
    "liquidity": "流动性风险",
    "hype_crowding": "炒作拥挤",
    "accounting_quality": "会计质量风险",
    "cyclicality": "周期性风险",
    "substitution_risk": "替代技术风险",
}


def _num_0_to_5(value: Any, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be a number from 0 to 5") from None
    if number < 0 or number > 5:
        raise ValueError(f"{label} must be from 0 to 5; got {number}")
    return number


def load_input(path: str) -> Dict[str, Any]:
    raw = sys.stdin.read() if path == "-" else open(path, "r", encoding="utf-8").read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise SystemExit("Input JSON must be an object")
    return data


def score(data: Dict[str, Any]) -> Dict[str, Any]:
    factors = data.get("factors", {})
    penalties = data.get("penalties", {})
    factor_details = {}
    total = 0.0
    for key, weight in WEIGHTS.items():
        rating = _num_0_to_5(factors.get(key, 0), f"factors.{key}")
        points = rating / 5.0 * weight
        factor_details[key] = {"label": LABEL_ZH.get(key, key), "rating": rating, "weight": weight, "points": round(points, 2)}
        total += points

    penalty_details = {}
    penalty_total = 0.0
    for key, value in penalties.items():
        rating = _num_0_to_5(value, f"penalties.{key}")
        points = rating * PENALTY_MULTIPLIER
        penalty_details[key] = {"label": LABEL_ZH.get(key, key), "rating": rating, "points": round(points, 2)}
        penalty_total += points

    final_score = max(0.0, min(100.0, total - penalty_total))
    if final_score >= 85:
        verdict = "Top research priority / 顶级研究优先级"
    elif final_score >= 70:
        verdict = "High research priority / 高优先级"
    elif final_score >= 55:
        verdict = "Worth tracking / 值得跟踪"
    else:
        verdict = "Early lead or low priority / 早期线索或低优先级"

    return {
        "ticker": data.get("ticker", ""),
        "company": data.get("company", ""),
        "market": data.get("market", ""),
        "chain_layer": data.get("chain_layer", ""),
        "bottleneck_role": data.get("bottleneck_role", ""),
        "raw_factor_points": round(total, 2),
        "penalty_points": round(penalty_total, 2),
        "final_score": round(final_score, 2),
        "verdict": verdict,
        "factor_details": factor_details,
        "penalty_details": penalty_details,
        "what_market_may_miss": data.get("what_market_may_miss", ""),
        "kill_switches": data.get("kill_switches", data.get("what_could_weaken_view", [])),
        "evidence": data.get("evidence", []),
    }


def to_markdown(result: Dict[str, Any]) -> str:
    title = result.get("ticker") or "Unknown"
    if result.get("company"):
        title += f"（{result['company']}）"
    lines = [
        f"# Serenity产业链卡点评分：{title}",
        "",
        f"市场：{result.get('market', '')}",
        f"产业链层级：{result.get('chain_layer', '')}",
        f"卡点角色：{result.get('bottleneck_role', '')}",
        f"最终分：**{result['final_score']} / 100**",
        f"结论：**{result['verdict']}**",
        f"正向因子分：{result['raw_factor_points']}",
        f"扣分：{result['penalty_points']}",
        "",
        "## 正向因子",
        "| 因子 | 评分(0-5) | 权重 | 得分 |",
        "|---|---:|---:|---:|",
    ]
    for key, detail in result["factor_details"].items():
        lines.append(f"| {detail['label']} | {detail['rating']} | {detail['weight']} | {detail['points']} |")

    lines.extend(["", "## 扣分项", "| 风险 | 评分(0-5) | 扣分 |", "|---|---:|---:|"])
    for key, detail in result["penalty_details"].items():
        lines.append(f"| {detail['label']} | {detail['rating']} | {detail['points']} |")

    if result.get("what_market_may_miss"):
        lines.extend(["", "## 市场可能没看清", str(result["what_market_may_miss"])])

    weakening_items = [str(item).strip() for item in result.get("kill_switches", []) if str(item).strip()]
    if weakening_items:
        lines.extend(["", "## 证伪/降级条件"])
        for item in weakening_items:
            lines.append(f"- {item}")

    evidence_lines = []
    for ev in result.get("evidence", []) or []:
        if isinstance(ev, dict):
            claim = str(ev.get("claim", "")).strip()
            source = str(ev.get("source", "")).strip()
            strength = str(ev.get("strength", "")).strip()
            if claim or source:
                evidence_lines.append(f"- [{strength}] {claim} — {source}")
    if evidence_lines:
        lines.extend(["", "## 证据"])
        lines.extend(evidence_lines)

    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Score a Serenity-style supply-chain bottleneck thesis")
    parser.add_argument("input", nargs="?", help="JSON scorecard file, or '-' for stdin")
    parser.add_argument("--template", action="store_true", help="Print a JSON template")
    parser.add_argument("--format", choices=["json", "md", "both"], default="json")
    args = parser.parse_args()
    if args.template:
        print(json.dumps(TEMPLATE, ensure_ascii=False, indent=2))
        return
    if not args.input:
        parser.error("input is required unless --template is used")
    result = score(load_input(args.input))
    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.format == "md":
        print(to_markdown(result))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print("\n---\n")
        print(to_markdown(result))


if __name__ == "__main__":
    main()
