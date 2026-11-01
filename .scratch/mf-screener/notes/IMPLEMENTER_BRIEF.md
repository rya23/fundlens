# Implementer brief (all tickets)

Repo: <repo>. You work in your own git worktree. Integration branch: `mf-screener` (local only; never push).

Read first: your ticket file, `.scratch/mf-screener/spec.md`, `docs/PLAN.md`, `CLAUDE.md`, `AGENTS.md` (Next 16 differences), and the notes of resolved tickets in this notes dir (start with `01-scaffold.md`). UI tickets also read `.claude/skills/README.md` and the skills it indexes.

Git: ALWAYS use `/usr/bin/git` (absolute path); a wrapper on bare `git` silently drops or refuses commands here.

Steps:
1. Confirm your branch is based on `mf-screener` (`git merge-base --is-ancestor mf-screener HEAD`); if not, `git reset --hard mf-screener`.
2. Run `npm ci --registry=https://registry.npmjs.org/` at the worktree root.
3. Use the Skill tool with `mattpocock-skills:tdd` for logic (data assembly, parsers, jobs, URL state). For pure UI/layout, skip the TDD ceremony: a few focused tests plus a browser check is enough. Be economical with tokens: read only the notes and files you need.
4. Installs: always pass `--registry=https://registry.npmjs.org/` (the global npmrc points at an unreachable internal proxy). Latest stable versions. ignore-scripts is on globally: use `npm rebuild <pkg>` for packages that need install scripts.
5. Never read `.env`. Never use the em dash character. Never run `lint --fix`/`prettier --write` over the whole tree. Fix any lint/test failure you see, even unrelated.
7. Before reporting: merge the current `mf-screener` tip into your branch (other tickets run in parallel; for package-lock.json conflicts, take theirs then re-run `npm install --registry=https://registry.npmjs.org/` to regenerate), then `npm run typecheck && npm run lint && npm test && npm run build` must pass.
8. Write notes for later agents to `<this notes dir>/<ticket-file-name>` (public module APIs, file layout, decisions, gotchas). Keep the final report to the orchestrator under 120 words: branch, worktree path, commits, check results, anything blocking.
