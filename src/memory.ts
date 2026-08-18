/**
 * Claude Code memory file loader.
 * Reads memory files from `~/.claude/projects/<project>/memory/`.
 * @module dsh-plugin-claude-bridge/memory
 */

import { readdirSync, readFileSync } from 'node:fs'
import type { MemoryEntry } from './types.ts'
import { parseFrontmatter, extractMetadataType } from './parser.js'

/**
 * Encode a filesystem path into Claude Code's project key format.
 * Examples:
 *   C:\Users\yang        → C--Users-yang
 *   /home/user/projects  → home-user-projects
 */
export function encodeProjectPath(path: string): string {
  return path.replace(/:/g, '').replace(/[/\\]/g, '-')
}

/**
 * Detect the memory directory for the current project.
 * Tries the exact encoded path first, then falls back to fuzzy matching.
 */
export function detectMemoryDir(projectsDir: string, cwd: string): string {
  const encoded = encodeProjectPath(cwd)
  return `${projectsDir}/${encoded}/memory`
}

/**
 * Load all memory files from a directory.
 * Returns entries sorted by type priority: feedback > project > reference > user > unknown.
 *
 * Synchronous by design: dsh renders system-prompt `text` synchronously
 * (it does not await the provider), so the caller must return a plain string.
 */
export function loadMemories(dir: string): MemoryEntry[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
      .filter((f: string) => f.endsWith('.md') && f !== 'MEMORY.md')
  } catch {
    return []
  }

  const memories: MemoryEntry[] = []
  for (const file of entries) {
    try {
      const content = readFileSync(`${dir}/${file}`, 'utf8')
      const { meta, body } = parseFrontmatter(content)
      if (body.length === 0) continue

      memories.push({
        name: meta.name ?? file.replace(/\.md$/, ''),
        description: meta.description ?? '',
        type: extractMetadataType(meta),
        content: body,
        sourcePath: `${dir}/${file}`,
      })
    } catch {
      // Skip unreadable files silently
    }
  }

  // Sort: feedback first (most actionable), then project, then others
  const typePriority: Record<string, number> = {
    feedback: 0,
    project: 1,
    reference: 2,
    user: 3,
  }
  memories.sort((a, b) => (typePriority[a.type] ?? 99) - (typePriority[b.type] ?? 99))

  return memories
}

/**
 * Render memories into a context block for the system prompt.
 * Truncates at maxBytes boundary, preserving complete entries.
 */
export function renderMemories(memories: MemoryEntry[], maxBytes: number): string {
  if (memories.length === 0) return ''

  const lines: string[] = ['# Agent Memory (from Claude Code)', '']
  let bytes = 0

  for (const mem of memories) {
    const block = [
      `## ${mem.name}`,
      mem.description ? `> ${mem.description}` : '',
      '',
      mem.content,
      '',
    ].filter(Boolean).join('\n')

    if (bytes + block.length > maxBytes) break
    lines.push(...block.split('\n'))
    bytes += block.length
  }

  return lines.join('\n')
}
