# Third-party skills

`ui-ux-pro-max` and its six companion skills, vendored from
https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT, v2.13.0).

## Why they are committed rather than installed

Claude Code sessions for this project run in ephemeral containers. Anything in `~/.claude/skills/`
is wiped when the container is reclaimed, so a skill that is only installed there works once and is
gone by the next session. Committing them is what makes them actually available.

## What was checked before adding them

A skill's instructions are followed in later sessions, so this is a trust boundary rather than a
dependency install. What the audit found:

- `ui-ux-pro-max` — the headline skill — is entirely offline. Its `search.py` is a BM25 index over
  local CSVs: no network calls, no `subprocess`, no `eval`/`exec`.
- The only outbound requests in the whole bundle are in `design-system/scripts/fetch-background.py`,
  which downloads stock photos from `images.pexels.com`. Transparent, and unrelated to the search.
- No nested `.git`, no `node_modules`, no install/postinstall step. 8.4 MB, largest single file a
  728 KB Google Fonts CSV.

The upstream repo's own root `CLAUDE.md` was deliberately NOT copied — it would collide with this
project's instructions.

## Updating

Re-clone upstream and copy its `.claude/skills/` over this directory. Re-run the audit above rather
than assuming a later version kept the same posture.
