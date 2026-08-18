/**
 * Claude Code → DeepSeek Harness Bridge Plugin.
 *
 * Bridges Claude Code's memory, skills, and global configuration into
 * DeepSeek Harness without any manual migration. Reads files directly
 * from Claude Code's standard locations:
 *
 * - **Memory**: `~/.claude/projects/<project>/memory/*.md`
 * - **Skills**: `~/.claude/skills/<name>/SKILL.md`
 * - **Global instructions**: `~/.claude/CLAUDE.md`
 *
 * @module dsh-plugin-claude-bridge
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadMemories, renderMemories, encodeProjectPath } from './memory.js'
import { loadSkills, renderSkillCatalog } from './skills.js'

/** Plugin name for dsh diagnostics. */
export const name = 'claude-bridge'

/** Required dsh services. */
export const inject = ['systemPrompt']

/** Plugin configuration. */
export interface Config {
  /** Path to Claude Code home. Defaults to `~/.claude`. */
  claudeHome?: string
  /** Encoded project key. Auto-detected from `process.cwd()` if omitted. */
  projectKey?: string
  /** Maximum bytes of memories to inject into context. Default: 8192. */
  maxMemoryBytes?: number
  /** Maximum number of skills to list in catalog. Default: 30. */
  maxSkills?: number
  /** Enable memory injection. Default: true. */
  enableMemory?: boolean
  /** Enable skill catalog injection. Default: true. */
  enableSkills?: boolean
  /** Enable global CLAUDE.md injection. Default: true. */
  enableGlobalInstructions?: boolean
  /** Additional skill directories to scan. */
  extraSkillDirs?: string[]
}

/**
 * Plugin entry point. Called by dsh's Cordis loader.
 *
 * Registers three system prompt context sections:
 * 1. `claude-bridge:memory` — relevant memories from the current project
 * 2. `claude-bridge:skills` — available skills catalog
 * 3. `claude-bridge:global` — global CLAUDE.md instructions
 */
export function apply(ctx: any, config: Config = {}): void {
  const claudeHome = config.claudeHome ?? join(homedir(), '.claude')
  const projectKey = config.projectKey ?? encodeProjectPath(process.cwd())
  const maxMemoryBytes = config.maxMemoryBytes ?? 8192
  const maxSkills = config.maxSkills ?? 30
  const enableMemory = config.enableMemory !== false
  const enableSkills = config.enableSkills !== false
  const enableGlobal = config.enableGlobalInstructions !== false

  const memoryDir = join(claudeHome, 'projects', projectKey, 'memory')
  const skillsDirs = [
    join(claudeHome, 'skills'),
    ...(config.extraSkillDirs ?? []),
  ]
  const globalClaudeMd = join(claudeHome, 'CLAUDE.md')

  // --- Memory context (dynamic: re-reads on each request) ---
  if (enableMemory && ctx.systemPrompt?.context) {
    ctx.systemPrompt.context({
      name: 'claude-bridge:memory',
      order: 120,
      text: () => {
        try {
          const memories = loadMemories(memoryDir)
          return renderMemories(memories, maxMemoryBytes)
        } catch {
          return ''
        }
      },
    })
  }

  // --- Skills catalog (dynamic: reflects newly added skills) ---
  if (enableSkills && ctx.systemPrompt?.context) {
    ctx.systemPrompt.context({
      name: 'claude-bridge:skills',
      order: 121,
      text: () => {
        try {
          const skills = loadSkills(skillsDirs)
          return renderSkillCatalog(skills.slice(0, maxSkills))
        } catch {
          return ''
        }
      },
    })
  }

  // --- Global CLAUDE.md (static section, read lazily) ---
  if (enableGlobal && ctx.systemPrompt?.section) {
    ctx.systemPrompt.section({
      name: 'claude-bridge:global',
      order: 5,
      text: () => {
        try {
          const content = readFileSync(globalClaudeMd, 'utf8')
          return content.length > 0
            ? `# Global Instructions (from Claude Code)\n\n${content}`
            : ''
        } catch {
          return ''
        }
      },
    })
  }
}

export default { name, inject, apply }
