#!/bin/bash
# ---------------------------------------------------------------------------
# session-start.sh
#
# Reinstalls a curated set of third-party Claude Code skill libraries into
# ~/.claude on every Claude Code (web) session, so they are available again in
# each ephemeral container.
#
# Design notes:
#   * Runs ONLY in the remote (web) environment. On local machines you install
#     these once with their own installers, so we no-op there.
#   * CORE set (fast, passive skill copies + quick plugin installs) runs by
#     default.
#   * HEAVY runtimes (gstack browser build, claude-mem daemon) are OFF by
#     default because they add many minutes to startup. Opt in by exporting
#     INSTALL_HEAVY=1 (e.g. in the environment's variables).
#   * Idempotent: skips a namespace that already exists unless FORCE=1.
#   * Resilient: a single repo failing never aborts the whole hook.
# ---------------------------------------------------------------------------
set -uo pipefail   # deliberately NOT -e: one failed repo must not abort setup

# Only run in Claude Code on the web. Locally, do nothing.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

SKILLS_DIR="$HOME/.claude/skills"
WORK="$(mktemp -d)"
mkdir -p "$SKILLS_DIR"
trap 'rm -rf "$WORK"' EXIT

# All logging goes to stderr; keep stdout clean for the hook protocol.
log() { echo "[install-agent-skills] $*" >&2; }

# Shallow clone helper. Returns non-zero on failure without aborting.
clone() { # url dest [extra git args...]
  local url="$1" dest="$2"; shift 2
  rm -rf "$dest"
  git clone --depth 1 --quiet "$@" "$url" "$dest" 2>/dev/null
}

# Copy every immediate subdirectory that contains a SKILL.md into a namespace.
copy_skill_dirs() { # src_dir namespace
  local src="$1" ns="$2" d
  [ -d "$src" ] || return 0
  mkdir -p "$SKILLS_DIR/$ns"
  for d in "$src"/*/; do
    [ -d "$d" ] || continue
    if find "$d" -maxdepth 2 -name SKILL.md -print -quit 2>/dev/null | grep -q .; then
      cp -R "$d" "$SKILLS_DIR/$ns/"
    fi
  done
}

# True when a namespace is already installed (and we are not forcing).
already() { # namespace
  [ "${FORCE:-0}" != "1" ] && [ -d "$SKILLS_DIR/$1" ] && \
    [ -n "$(ls -A "$SKILLS_DIR/$1" 2>/dev/null)" ]
}

# --------------------------------------------------------------------------
# CORE — fast, passive skill libraries (git clone + copy markdown)
# --------------------------------------------------------------------------

install_simple() { # name url subpath namespace
  local name="$1" url="$2" sub="$3" ns="$4"
  if already "$ns"; then log "skip $name (present)"; return 0; fi
  log "installing $name ..."
  if clone "$url" "$WORK/$name"; then
    copy_skill_dirs "$WORK/$name/$sub" "$ns"
    log "  ok $name"
  else
    log "  FAILED clone $name"
  fi
}

install_simple superpowers   https://github.com/obra/superpowers.git                     skills         superpowers
install_simple ui-ux-pro-max https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git .claude/skills uupm
install_simple taste         https://github.com/Leonxlnx/taste-skill.git                 skills         taste
install_simple karpathy      https://github.com/multica-ai/andrej-karpathy-skills.git    skills         karpathy
install_simple vercel        https://github.com/vercel-labs/agent-skills.git             skills         vercel

# ECC — copy skills/ + rules/ directly (skip its node installer for speed).
if ! already ecc; then
  log "installing ECC ..."
  if clone https://github.com/affaan-m/ECC.git "$WORK/ecc" --filter=blob:none --sparse; then
    git -C "$WORK/ecc" sparse-checkout set skills rules >/dev/null 2>&1
    copy_skill_dirs "$WORK/ecc/skills" ecc
    if [ -d "$WORK/ecc/rules" ]; then
      mkdir -p "$HOME/.claude/rules/ecc"; cp -R "$WORK/ecc/rules/." "$HOME/.claude/rules/ecc/" 2>/dev/null
    fi
    log "  ok ECC"
  else
    log "  FAILED clone ECC"
  fi
else
  log "skip ECC (present)"
fi

# awesome-claude-code-toolkit — agents / skills / commands / rules / templates.
if ! already toolkit; then
  log "installing toolkit ..."
  if clone https://github.com/rohitg00/awesome-claude-code-toolkit.git "$WORK/toolkit"; then
    copy_skill_dirs "$WORK/toolkit/skills" toolkit
    for pair in "agents:agents" "commands:commands" "rules:rules" "templates:templates"; do
      s="${pair%%:*}"; t="${pair##*:}"
      [ -d "$WORK/toolkit/$s" ] || continue
      mkdir -p "$HOME/.claude/$t/toolkit"; cp -R "$WORK/toolkit/$s/." "$HOME/.claude/$t/toolkit/" 2>/dev/null
    done
    log "  ok toolkit"
  else
    log "  FAILED clone toolkit"
  fi
else
  log "skip toolkit (present)"
fi

# awesome-claude-skills — curated skills only (exclude the 832 composio connectors).
if ! already composio-awesome; then
  log "installing awesome-claude-skills (curated) ..."
  if clone https://github.com/ComposioHQ/awesome-claude-skills.git "$WORK/aws" --filter=blob:none --sparse; then
    git -C "$WORK/aws" sparse-checkout set --no-cone '/*' '!/composio-skills/' >/dev/null 2>&1
    copy_skill_dirs "$WORK/aws" composio-awesome
    log "  ok awesome-claude-skills"
  else
    log "  FAILED clone awesome-claude-skills"
  fi
else
  log "skip awesome-claude-skills (present)"
fi

# open-design — skills/ subtree only (repo is an 11k-file monorepo).
if ! already open-design; then
  log "installing open-design (skills) ..."
  if clone https://github.com/nexu-io/open-design.git "$WORK/od" --filter=blob:none --sparse; then
    git -C "$WORK/od" sparse-checkout set skills >/dev/null 2>&1
    copy_skill_dirs "$WORK/od/skills" open-design
    log "  ok open-design"
  else
    log "  FAILED clone open-design"
  fi
else
  log "skip open-design (present)"
fi

# repomix — CLI tool + its explorer skill.
if ! command -v repomix >/dev/null 2>&1; then
  log "installing repomix CLI ..."; npm install -g repomix >/dev/null 2>&1 && log "  ok repomix CLI" || log "  FAILED repomix CLI"
fi
if ! already repomix; then
  if clone https://github.com/yamadashy/repomix.git "$WORK/repomix"; then
    copy_skill_dirs "$WORK/repomix/skills" repomix
  fi
fi

# --------------------------------------------------------------------------
# Plugin-system installs (fast, use the claude CLI)
# --------------------------------------------------------------------------
if command -v claude >/dev/null 2>&1; then
  install_plugin() { # marketplace_dir_name marketplace_ref pluginref label
    if [ "${FORCE:-0}" != "1" ] && [ -d "$HOME/.claude/plugins/marketplaces/$1" ]; then
      log "skip $4 (plugin present)"; return 0
    fi
    log "installing $4 (plugin) ..."
    claude plugin marketplace add "$2" >/dev/null 2>&1
    claude plugin install "$3" >/dev/null 2>&1 && log "  ok $4" || log "  $4 install had issues"
  }
  install_plugin caveman           JuliusBrussee/caveman        caveman@caveman              caveman
  install_plugin last30days-skill  mvanhorn/last30days-skill    last30days@last30days-skill  last30days
fi

# --------------------------------------------------------------------------
# HEAVY runtimes — opt in with INSTALL_HEAVY=1 (adds several minutes)
# --------------------------------------------------------------------------
if [ "${INSTALL_HEAVY:-0}" = "1" ]; then
  # gstack — browser-automation toolkit (bun build of a ~99MB binary + Chrome).
  if [ ! -d "$SKILLS_DIR/gstack" ] && command -v bun >/dev/null 2>&1; then
    log "installing gstack (heavy) ..."
    if git clone --single-branch --depth 1 --quiet https://github.com/garrytan/gstack.git "$SKILLS_DIR/gstack" 2>/dev/null; then
      ( cd "$SKILLS_DIR/gstack" && bun install >/dev/null 2>&1 && ./setup >/dev/null 2>&1 ) && log "  ok gstack" || log "  gstack setup had issues"
    else
      log "  FAILED clone gstack"
    fi
  fi

  # claude-mem — persistent memory system (hooks + Bun worker + MCP).
  if command -v npx >/dev/null 2>&1; then
    log "installing claude-mem (heavy) ..."
    npx --yes claude-mem install >/dev/null 2>&1 && npx --yes claude-mem start >/dev/null 2>&1 && log "  ok claude-mem" || log "  claude-mem had issues"
  fi
fi

log "done."
exit 0
