# Agent skills bootstrap

This repository carries a **SessionStart hook** that reinstalls a curated set of
third-party [Claude Code](https://code.claude.com) skill libraries into
`~/.claude` at the start of every **Claude Code on the web** session.

Web sessions run in an ephemeral container, so anything installed into
`~/.claude` is wiped when the session ends. The hook re-establishes the skills
each time so they are available again without manual reinstalling.

## What gets installed

Everything is namespaced under `~/.claude/skills/<namespace>/` so nothing
collides.

### CORE (installed automatically, ~1–2 min)

| Namespace | Source | Notes |
|---|---|---|
| `superpowers` | obra/superpowers | TDD, debugging, workflow skills |
| `uupm` | nextlevelbuilder/ui-ux-pro-max-skill | UI/UX design intelligence |
| `taste` | Leonxlnx/taste-skill | Frontend "taste" design skills |
| `karpathy` | multica-ai/andrej-karpathy-skills | LLM-coding guidelines |
| `vercel` | vercel-labs/agent-skills | Vercel/React best practices |
| `ecc` | affaan-m/ECC | 277 skills + rules (skills/rules copied directly) |
| `toolkit` | rohitg00/awesome-claude-code-toolkit | agents/skills/commands/rules/templates |
| `composio-awesome` | ComposioHQ/awesome-claude-skills | 32 curated skills (832 connectors excluded) |
| `open-design` | nexu-io/open-design | 162 design skills (skills subtree only) |
| `repomix` | yamadashy/repomix | `repomix` CLI + explorer skill |
| — | JuliusBrussee/caveman | installed via `claude` plugin system |
| — | mvanhorn/last30days-skill | installed via `claude` plugin system |

### HEAVY (opt in with `INSTALL_HEAVY=1`, adds several minutes)

These build native binaries and/or start background daemons, so they are off by
default. Set the environment variable `INSTALL_HEAVY=1` to enable them:

| Source | What it does |
|---|---|
| garrytan/gstack | Browser-automation toolkit — `bun install` + builds a ~99 MB binary and downloads Chrome |
| thedotmack/claude-mem | Persistent-memory system — hooks + Bun worker daemon + MCP server |

## How it works

- `.claude/hooks/session-start.sh` — the installer. Idempotent (skips
  namespaces already present; set `FORCE=1` to reinstall), resilient (one repo
  failing never aborts the rest), and only runs when `CLAUDE_CODE_REMOTE=true`
  (i.e. web sessions — it no-ops on local machines).
- `.claude/settings.json` — registers the hook on `SessionStart`.

## Notes

- **Local machines:** install each library once with its own installer; the
  hook intentionally does nothing locally.
- **Other projects:** this only auto-runs for sessions opened on this repo. To
  make the skills user-global on the web for every project, this same hook
  logic would need to live in the environment's setup configuration.
- Skills are third-party and carry their own licenses (MIT/Apache-2.0, etc.).
