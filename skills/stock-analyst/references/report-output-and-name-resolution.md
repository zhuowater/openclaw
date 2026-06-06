# Report Output and A-share Name Resolution Notes

Use this reference when a user asks for a stock analysis by an informal or possibly imprecise Chinese name, or asks for the "complete report" after an analysis run.

## Informal / ambiguous A-share names

- First resolve the intended ticker with Tushare `stock_basic` before running analysis.
- If multiple close matches appear, choose the most semantically likely one only when the user's wording strongly implies it, and state the assumption explicitly in the report.
  - Example: user says "深南电子"; no exact listed company exists. `stock_basic` returns `深南电A` (power generation) and `深南电路` (PCB/electronics). For an electronics/stock-analysis context, default to `002916.SZ 深南电路`, but disclose: "A股无精确深南电子；我按深南电路分析。若指深南电A，可另跑。"
- If the ambiguity changes sector logic materially and there is no obvious default, ask a concise clarification instead of guessing.

## "Complete report" after running analyze.py

Users may mean either:
1. the complete authored investment memo, or
2. the raw analyzer transcript produced by `scripts/analyze.py`.

Default behavior:
- Provide the authored Markdown memo as a `MEDIA:` attachment and paste the content if it is short enough.
- If the user specifically says "跑完的完整报告", "原始输出", "脚本输出", or asks to audit the run, also save/attach the raw analyzer transcript or rerun with stdout redirected to a `.txt` file.
- Do not confuse the two: the saved investment memo is the agent's synthesized report; `analyze.py --no-save` stdout is the raw data/transcript.

## Short-form chat response

For A-share chat analysis, lead with actionable zones before prose:
- rating / stance
- buy-low zone
- stop-loss
- first resistance / strong resistance
- no-chase zone
- position sizing

Then explain the evidence: fundamentals, valuation, technicals, capital/holding structure, sentiment, and invalidation triggers.