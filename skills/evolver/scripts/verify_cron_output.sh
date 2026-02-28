#!/bin/bash
# Verify cron job sub-agents actually executed tools (not hallucinated)
# GEP Cycle #0016 - Innovation: Anti-hallucination validation

SESSIONS_DIR="/root/.openclaw/agents/main/sessions"
RECENT_HOURS=${1:-6}

echo "🔍 Checking isolated session tool usage (last ${RECENT_HOURS}h)..."
echo ""

found=0
suspicious=0

for f in $(find "$SESSIONS_DIR" -name "*.jsonl" -mmin -$((RECENT_HOURS * 60)) 2>/dev/null | sort -r | head -20); do
    basename_f=$(basename "$f" .jsonl)
    
    # Skip lock files
    [[ "$f" == *.lock ]] && continue
    
    # Count tool calls vs text-only responses  
    tool_calls=$(grep -o '"toolCall"' "$f" 2>/dev/null | wc -l)
    assistant_msgs=$(grep -o '"role":"assistant"\|"role": "assistant"' "$f" 2>/dev/null | wc -l)
    has_cron=$(grep -o '"cron:' "$f" 2>/dev/null | wc -l)
    
    tool_calls=$((tool_calls + 0))
    assistant_msgs=$((assistant_msgs + 0))
    has_cron=$((has_cron + 0))
    
    if [ "$has_cron" -gt 0 ]; then
        found=$((found + 1))
        if [ "$tool_calls" -eq 0 ] && [ "$assistant_msgs" -gt 0 ]; then
            echo "⚠️  SUSPICIOUS: $basename_f"
            echo "    Cron session with $assistant_msgs assistant messages but 0 tool calls"
            echo "    → Sub-agent may have hallucinated execution!"
            suspicious=$((suspicious + 1))
        else
            echo "✅ OK: $basename_f (${tool_calls} tool calls, ${assistant_msgs} responses)"
        fi
    fi
done

echo ""
echo "Summary: $found cron sessions checked, $suspicious suspicious"
[ "$suspicious" -gt 0 ] && exit 1 || exit 0
