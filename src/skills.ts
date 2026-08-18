/**
 * Claude Code skill file loader.
 * Reads skills from `~/.claude/skills/<name>/SKILL.md` or `.claude/skills/<name>/SKILL.md`.
 * @module dsh-plugin-claude-bridge/skills
 */

import { readdirSync, statSync, existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillEntry } from './types.ts'
import { parseFrontmatter } from './parser.js'

/**
 * Discover skill directories in a given root.
 * Skills can be either:
 *   - `<root>/<name>/SKILL.md` (directory bundle)
 *   - `<root>/<name>.md` (flat file)
 */
function discoverSkillPaths(root: string): string[] {
  const paths: string[] = []

  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return []
  }

  for (const entry of entries) {
    const fullPath = join(root, entry)
    try {
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        // Directory bundle: look for SKILL.md
        const skillFile = join(fullPath, 'SKILL.md')
        if (existsSync(skillFile)) {
          paths.push(skillFile)
        }
      } else if (stat.isFile() && entry.endsWith('.md') && entry !== 'MEMORY.md') {
        // Flat file skill
        paths.push(fullPath)
      }
    } catch {
      // Skip inaccessible entries
    }
  }

  return paths
}

/**
 * Load all skills from one or more directories.
 *
 * Synchronous by design: dsh renders system-prompt `text` synchronously
 * (it does not await the provider), so the caller must return a plain string.
 */
export function loadSkills(dirs: string[]): SkillEntry[] {
  const skills: SkillEntry[] = []

  for (const dir of dirs) {
    const paths = discoverSkillPaths(dir)
    for (const skillPath of paths) {
      try {
        const content = readFileSync(skillPath, 'utf8')
        const { meta, body } = parseFrontmatter(content)
        if (body.length === 0) continue

        skills.push({
          name: meta.name ?? skillPath.split('/').pop()?.replace(/\.md$/, '') ?? 'unknown',
          description: meta.description ?? '',
          argumentHint: meta['argument-hint'],
          level: meta.level ? parseInt(meta.level, 10) : undefined,
          content: body,
          sourcePath: skillPath,
        })
      } catch {
        // Skip unreadable files
      }
    }
  }

  return skills
}

/**
 * Render skills into a catalog block for the system prompt.
 * Only includes name and description (not full content) to keep context small.
 */
export function renderSkillCatalog(skills: SkillEntry[]): string {
  if (skills.length === 0) return ''

  const lines: string[] = [
    '# Available Skills (from Claude Code)',
    '',
    'These skills are loaded from Claude Code. Invoke them by name when relevant.',
    '',
  ]

  for (const skill of skills.sort((a, b) => (a.level ?? 99) - (b.level ?? 99))) {
    const hint = skill.argumentHint ? ` \`${skill.argumentHint}\`` : ''
    lines.push(`- **${skill.name}**${hint}: ${skill.description}`)
  }

  return lines.join('\n')
}

/**
 * Render a single skill's full content for injection when invoked.
 */
export function renderSkillContent(skill: SkillEntry): string {
  return `# Skill: ${skill.name}\n\n${skill.content}`
}
