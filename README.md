# dsh-plugin-claude-bridge

Bridge Claude Code's memory, skills, and configuration into DeepSeek Harness -- zero migration, full compatibility.

## What it does

Reads Claude Code's standard file locations directly -- no migration scripts, no file copying, no symlinks:

- `~/.claude/projects/<project>/memory/*.md` -- Injects memories as dynamic system prompt context
- `~/.claude/skills/<name>/SKILL.md` -- Adds skills to the available catalog
- `~/.claude/CLAUDE.md` -- Injects global instructions into system prompt

## Install

```sh
dsh plugin --profile your-profile add dsh-plugin-claude-bridge
```

## Configuration

Works out of the box with zero configuration. All options are optional:

```yaml
- id: claude-bridge
  name: dsh-plugin-claude-bridge
  config:
    claudeHome: '~/.claude'
    enableMemory: true
    maxMemoryBytes: 8192
    enableSkills: true
    maxSkills: 30
    maxUserSkills: 30
    enableGlobalInstructions: true
    extraSkillDirs:
      - '/Users/you/.agents/skills'
```

## How it works

### Memory injection

Claude Code stores memories as individual markdown files with YAML frontmatter. This plugin reads all memory files, sorts them by type priority (feedback > project > reference > user), and injects them as a dynamic system prompt context section. The context is re-read on each request, so new memories take effect immediately.

### Skill catalog

Skills are injected as two separate catalog sections in the system prompt, so
Claude Code's own skills and your personal skills stay distinct:

1. **Claude Code skills** — discovered from `~/.claude/skills/`, listed under
   *Available Skills (from Claude Code)*. Capped by `maxSkills`.
2. **User-defined skill directories** — discovered from each path in
   `extraSkillDirs` (e.g. `~/.agents/skills` where `npx skills add -g` installs
   ecosystem skills), listed under *Available Skills (from local skill
   directories)*, deduplicated by name, and capped by `maxUserSkills`.

Note: `extraSkillDirs` paths are passed straight to Node's `fs`, so use
absolute paths — `~` is not expanded. Use the same paths in other bridge
plugins to keep every agent's catalog in sync.

### Global instructions

The content of `~/.claude/CLAUDE.md` is injected as an early system prompt section (order 5), so global instructions and model routing rules are preserved.

## Related bridge plugins

- dsh-plugin-codex-bridge -- Bridge OpenAI Codex
- dsh-plugin-opencode-bridge -- Bridge OpenCode
- dsh-plugin-pi-bridge -- Bridge Pi Agent
- awesome-dsh-bridges -- Curated list of all bridge plugins

## License

MIT -- YYTbit
