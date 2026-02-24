#!/usr/bin/env python3
"""Fix common LaTeX issues in markdown files for pandoc compilation."""
import re, glob, os

def fix_subscript_commands(text):
    """Fix patterns like _\mathcal{X} -> _{\mathcal{X}}"""
    # Match _\command{...} where command is mathcal, text, mathrm, mathbf, etc.
    pattern = r'_\\(mathcal|text|mathrm|mathbf|mathbb|mathsf|operatorname)\{([^}]*)\}'
    replacement = r'_{\\\1{\2}}'
    text = re.sub(pattern, text, string=text)
    return text

def fix_superscript_commands(text):
    """Fix patterns like ^\mathcal{X} -> ^{\mathcal{X}}"""
    pattern = r'\^\\(mathcal|text|mathrm|mathbf|mathbb|mathsf|operatorname)\{([^}]*)\}'
    replacement = r'^{\\\1{\2}}'
    text = re.sub(pattern, replacement, text)
    return text

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # Fix _\command{} patterns
    content = re.sub(
        r'_\\(mathcal|text|mathrm|mathbf|mathbb|mathsf|operatorname)\{',
        r'_{\\\1{',
        content
    )
    
    # Fix ^\command{} patterns  
    content = re.sub(
        r'\^\\(mathcal|text|mathrm|mathbf|mathbb|mathsf|operatorname)\{',
        r'^{\\\1{',
        content
    )
    
    # Now we need to close the extra brace. This is tricky.
    # Actually the above adds { after _ but we need matching }.
    # Better approach: find _\mathcal{X} and wrap the whole thing
    
    # Revert and use a proper approach
    content = original
    
    # Pattern: _\mathcal{...} -> _{\mathcal{...}}
    # We need to find the matching closing brace
    def wrap_subscript(match):
        cmd = match.group(1)
        inner = match.group(2)
        return f'_{{{cmd}{{{inner}}}}}'
    
    content = re.sub(
        r'_(\\(?:mathcal|text|mathrm|mathbf|mathbb|mathsf|operatorname))\{([^}]*)\}',
        wrap_subscript,
        content
    )
    
    def wrap_superscript(match):
        cmd = match.group(1)
        inner = match.group(2)
        return f'^{{{cmd}{{{inner}}}}}'
    
    content = re.sub(
        r'\^(\\(?:mathcal|text|mathrm|mathbf|mathbb|mathsf|operatorname))\{([^}]*)\}',
        wrap_superscript,
        content
    )
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

changed = 0
for f in sorted(glob.glob('/root/openclaw/thesis/chapter-*.md')):
    if fix_file(f):
        changed += 1
        print(f"Fixed: {os.path.basename(f)}")

print(f"\nTotal files fixed: {changed}")
