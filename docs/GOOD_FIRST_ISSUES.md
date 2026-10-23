# Good First Issues

Welcome to Canopy! We have curated several starter issues for contributors who want to help improve lazy-clone developer workflows and semantic cache ergonomics.

---

### Issue #1: `canopy stats --json` Flag
- **Type**: Enhancement / CLI Ergonomics
- **Difficulty**: Easy
- **Status**: Ready for contribution
- **Context**: Currently, `canopy stats` outputs a human-readable table summarizing cache hits, bytes downloaded, and bandwidth saved vs traditional git clones. Machine agents, CI runners, and IDE extensions benefit from machine-readable JSON.
- **Acceptance Criteria**:
  1. Add support for `--json` flag to `canopy stats`: `canopy stats --json`.
  2. Output strict JSON to stdout without decorative ASCII or color escape sequences:
     ```json
     {
       "mounted": true,
       "totalReads": 5,
       "cachedReads": 4,
       "networkFetches": 1,
       "cacheHitRatePct": 80.0,
       "bytesDownloaded": 1937,
       "bytesSavedVsClone": 2898437,
       "bandwidthSavingsPct": 99.9
     }
     ```
  3. Ensure existing formatted output remains the default when `--json` is omitted.
  4. Add unit test in `test/client.test.ts` verifying `JSON.parse()` succeeds on `--json` output.
  5. Ensure all verification gates pass (`npm run verify`).

---

### Issue #2: Windows Developer Setup Guide & PowerShell Tips
- **Type**: Documentation / Developer Experience
- **Difficulty**: Easy
- **Status**: Ready for contribution
- **Context**: Canopy runs cleanly across Linux, macOS, and Windows. By adopting Node 22's built-in `node:sqlite` adapter, native Visual Studio MSVC compilation (`node-gyp`) is avoided. However, Windows PowerShell developers have questions regarding command chaining and line endings.
- **Acceptance Criteria**:
  1. Add a `Windows Developer Notes` section to `README.md` or `docs/WINDOWS_SETUP.md`.
  2. Document the Node >= 22.5.0 requirement and explain how `node:sqlite` eliminates native C++ toolchain dependencies.
  3. Provide command chaining tips: PowerShell 5.1 requires `;` rather than `&&`.
  4. Explain git line ending configuration (`git config core.autocrlf input`).
  5. Test that a fresh clone on Windows executes `npm test` and `npm run verify` cleanly.
