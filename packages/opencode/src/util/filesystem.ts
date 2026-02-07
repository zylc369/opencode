import { realpathSync } from "fs"
import { dirname, join, relative } from "path"

export namespace Filesystem {
  /**
   * Check if a file or directory exists at the given path
   * @param p - Path to the file or directory
   * @returns Promise<boolean> - true if exists, false otherwise
   */
  export const exists = (p: string) =>
    Bun.file(p)
      .stat()
      .then(() => true)
      .catch(() => false)

  /**
   * Check if the given path is a directory
   * @param p - Path to check
   * @returns Promise<boolean> - true if it's a directory, false otherwise
   */
  export const isDir = (p: string) =>
    Bun.file(p)
      .stat()
      .then((s) => s.isDirectory())
      .catch(() => false)
  /**
   * On Windows, normalize a path to its canonical casing using the filesystem.
   * This is needed because Windows paths are case-insensitive but LSP servers
   * may return paths with different casing than what we send them.
   */
  export function normalizePath(p: string): string {
    if (process.platform !== "win32") return p
    try {
      return realpathSync.native(p)
    } catch {
      return p
    }
  }
  /**
   * Check if two paths overlap (one contains the other or they are the same)
   * @param a - Path a
   * @param b - Path b
   * @returns boolean - true if paths overlap
   */
  export function overlaps(a: string, b: string) {
    const relA = relative(a, b)
    const relB = relative(b, a)
    return !relA || !relA.startsWith("..") || !relB || !relB.startsWith("..")
  }

  /**
   * Check if child path is contained within parent path
   * @param parent - Parent path
   * @param child - Child path
   * @returns boolean - true if child is within parent
   */
  export function contains(parent: string, child: string) {
    return !relative(parent, child).startsWith("..")
  }

  /**
   * Search upward from start directory for target file/directory, return all matches
   * @param target - Target file name to search for
   * @param start - Starting directory path
   * @param stop - Directory path to stop searching (optional)
   * @returns Promise<string[]> - Array of all found target paths
   */
  export async function findUp(target: string, start: string, stop?: string) {
    let current = start
    const result = []
    while (true) {
      const search = join(current, target)
      if (await exists(search)) result.push(search)
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return result
  }

  /**
   * Generator version of upward search, yields matching paths one by one
   * @param options.targets - Array of target file names to search for
   * @param options.start - Starting directory path
   * @param options.stop - Directory path to stop searching (optional)
   * @returns AsyncGenerator<string> - Yields found paths one at a time
   */
  export async function* up(options: { targets: string[]; start: string; stop?: string }) {
    const { targets, start, stop } = options
    let current = start
    while (true) {
      for (const target of targets) {
        const search = join(current, target)
        if (await exists(search)) yield search
      }
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }

  /**
   * Search upward from start directory using glob pattern
   * @param pattern - Glob pattern (e.g., "*.json", "**//*.ts")
   * @param start - Starting directory path
   * @param stop - Directory path to stop searching (optional)
   * @returns Promise<string[]> - Array of all matched file paths
   */
  export async function globUp(pattern: string, start: string, stop?: string) {
    let current = start
    const result = []
    while (true) {
      try {
        const glob = new Bun.Glob(pattern)
        for await (const match of glob.scan({
          cwd: current,
          absolute: true,
          onlyFiles: true,
          followSymlinks: true,
          dot: true,
        })) {
          result.push(match)
        }
      } catch {
        // Skip invalid glob patterns
      }
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return result
  }
}
