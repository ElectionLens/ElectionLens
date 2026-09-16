[< Back to index](./README.md)

## 7. Effort & sequencing

| Phase | Effort | Risk | Visible impact |
|---|---|---|---|
| 0 — Stop the bleeding | **0.5 d** | Very low | **Huge** |
| 1 — Token consolidation | 1–2 d | Low (no visual change) | None (enables rest) |
| 2 — Shared selection + panel width + podium | 4–5 d | Medium | **Huge** |
| 2.5 — Data-based navigation | 3–4 d | Medium | **High** (new capability) |
| 3 — WCAG 2.2 AA | 2 d | Low | Low visually, mandatory |
| 4 — Map & mobile | 2–3 d | Medium | High |
| 5 — Dark mode | 1–2 d | Low | Medium |
| | **~14–19 d** | | |

**Ship Phase 0 today.** Phases 1→2 are the real revamp. 3 is non-negotiable before any public push. 4–5 are polish.

### Guardrails
- Every phase ends green: `npm run validate` (typecheck + lint + 494 unit tests) and the 113 Playwright e2e tests.
- Commit per logical change, per repo convention — roll forward and back in time.
- Phase 1 must be provably behaviour-preserving: screenshot-diff before/after.
- Don't split files purely to hit 600 lines where it hurts cohesion.

---
