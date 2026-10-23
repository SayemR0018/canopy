## Description
<!-- Provide a clear summary of what this pull request changes and why. -->

## Motivation & Context
<!-- Which issue does this fix, or what requirement does it address? -->

## Checklist
Please verify each of the following before requesting review:
- [ ] TypeScript build succeeds (`npm run build`) with zero diagnostic errors.
- [ ] Unit test suite passes cleanly (`npm test`).
- [ ] Full 7-gate verification passes (`npm run verify`).
- [ ] No fabricated claims: all figures in documentation match `docs/*.json` via `npx tsx scripts/check-claims.ts`.
- [ ] No secrets, credentials, or API keys are exposed or committed.
- [ ] Architecture decisions logged in `DECISIONS.md` (if applicable).
- [ ] Progress tracked in `PROGRESS.md` (if part of an active milestone).
