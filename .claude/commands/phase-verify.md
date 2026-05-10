---
description: Run verification checklist for a given Phase
disable-model-invocation: true
argument-hint: [phase_number]
---

Invoke the `phase-verifier` subagent for Phase $ARGUMENTS.

If $ARGUMENTS is empty, ask the user which Phase (0a, 0b, 1, 2, 3, 4, 5, 6, 7).

Pass to the subagent:
- The Phase number
- A reminder to read `~/.claude/plans/stateful-gathering-quiche.md` for the verification list
- Instruction to report results in the standard format
