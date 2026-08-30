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

import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { loadMemories, renderMemories, encodeProjectPath } from './memory.js'
import { loadSkills, renderSkillCatalog, uniqueByName } from './skills.js'

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
  /** Maximum number of Claude Code skills to list in catalog. Default: 30. */
  maxSkills?: number
  /** Maximum number of user-defined skills to list in catalog. Default: 30. */
  maxUserSkills?: number
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
 * Registers four system prompt context sections:
 * 1. `claude-bridge:memory` — relevant memories from the current project
 * 2. `claude-bridge:skills` — Claude Code skills catalog
 * 3. `claude-bridge:user-skills` — user-defined local skill directories
 * 4. `claude-bridge:global` — global CLAUDE.md instructions
 */
export function apply(ctx: any, config: Config = {}): void {
  const claudeHome = config.claudeHome ?? join(homedir(), '.claude')
  const projectKey = config.projectKey ?? encodeProjectPath(process.cwd())
  const maxMemoryBytes = config.maxMemoryBytes ?? 8192
  const maxSkills = config.maxSkills ?? 30
  const maxUserSkills = config.maxUserSkills ?? 30
  const enableMemory = config.enableMemory !== false
  const enableSkills = config.enableSkills !== false
  const enableGlobal = config.enableGlobalInstructions !== false

  const memoryDir = join(claudeHome, 'projects', projectKey, 'memory')
  const skillsDirs = [join(claudeHome, 'skills')]
  const userSkillDirs = config.extraSkillDirs ?? []
  const globalClaudeMd = join(claudeHome, 'CLAUDE.md')

  // --- Memory context (dynamic: re-reads on each request) ---
  if (enableMemory && ctx.systemPrompt?.context) {
    ctx.systemPrompt.context({
      name: 'claude-bridge:memory',
      order: 120,
      text: () => {
        try {
          return renderMemories(loadMemories(memoryDir), maxMemoryBytes)
        } catch {
          return ''
        }
      },
    })
  }

  // --- Claude Code skills catalog (dynamic: reflects newly added skills) ---
  if (enableSkills && ctx.systemPrompt?.context) {
    ctx.systemPrompt.context({
      name: 'claude-bridge:skills',
      order: 121,
      text: () => {
        try {
          return renderSkillCatalog(loadSkills(skillsDirs).slice(0, maxSkills))
        } catch {
          return ''
        }
      },
    })
  }

  // --- User-defined local skill directories (dynamic) ---
  if (enableSkills && userSkillDirs.length > 0 && ctx.systemPrompt?.context) {
    ctx.systemPrompt.context({
      name: 'claude-bridge:user-skills',
      order: 122,
      text: () => {
        try {
          const skills = uniqueByName(loadSkills(userSkillDirs)).slice(0, maxUserSkills)
          return renderSkillCatalog(
            skills,
            'Available Skills (from local skill directories)',
            'These skills are loaded from user-defined local skill directories. Invoke them by name when relevant.',
          )
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
