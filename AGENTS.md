<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:karpathy-guidelines -->
# Coding guidelines (Karpathy)

Behavioral guidelines to reduce common LLM coding mistakes. Bias toward caution over speed; for trivial tasks, use judgment. Source: [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) (MIT).

## 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility"/"configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it. Ask: "Would a senior engineer say this is overcomplicated?"

## 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Don't "improve" adjacent code, comments, or formatting; don't refactor what isn't broken.
- Match existing style, even if you'd do it differently.
- Notice unrelated dead code → mention it, don't delete it.
- Remove imports/vars/functions that YOUR changes made unused; leave pre-existing dead code unless asked.
- The test: every changed line traces directly to the user's request.

## 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**
- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."
- "Refactor X" → "Ensure tests pass before and after."
- For multi-step tasks, state a brief plan with a verify check per step.
<!-- END:karpathy-guidelines -->
