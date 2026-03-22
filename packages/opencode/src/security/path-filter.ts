import path from "path"
import { Global } from "@/global"

/**
 * Security module to protect sensitive opencode data from AI access.
 *
 * Prevents AI from reading/writing its own credential files and
 * filtering sensitive environment variables from shell commands.
 */

// Blocked path patterns - these paths contain sensitive data
const BLOCKED_PATH_PATTERNS = [
  /\/\.local\/share\/opencode\//i,
  /\/opencode\/auth\.json$/i,
  /\/opencode\/mcp-auth\.json$/i,
  /\/opencode\/opencode\.db$/i,
  /\/opencode\/storage\//i,
  /\/opencode\/log\//i,
]

// Blocked environment variable patterns
const BLOCKED_ENV_PATTERNS = [
  /^KEY$/i,
  /^SECRET$/i,
  /^TOKEN$/i,
  /^PASSWORD$/i,
  /^CREDENTIAL/i,
  /^API_KEY$/i,
  /^API_SECRET$/i,
  /^PRIVATE_KEY$/i,
  /^ACCESS_TOKEN$/i,
  /^REFRESH_TOKEN$/i,
  /^AUTH_TOKEN$/i,
  /^BEARER_TOKEN$/i,
  /^AWS_ACCESS_KEY/i,
  /^AWS_SECRET_KEY/i,
  /^AWS_SESSION_TOKEN/i,
  /^AWS_BEARER_TOKEN/i,
  /^ANTHROPIC_API_KEY$/i,
  /^OPENAI_API_KEY$/i,
  /^GITHUB_TOKEN$/i,
  /^GITLAB_TOKEN$/i,
  /^OPENCODE_SERVER_USERNAME$/i,
  /^OPENCODE_SERVER_PASSWORD$/i,
]

/**
 * Check if a path is blocked (contains sensitive opencode data)
 */
export function isBlockedPath(filepath: string): boolean {
  const normalized = path.normalize(filepath)

  // Check if path is within opencode data directory
  const dataDir = Global.Path.data
  if (normalized.startsWith(dataDir)) {
    return true
  }

  // Check against patterns
  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      return true
    }
  }

  return false
}

/**
 * Check if a bash command contains blocked paths or sensitive operations
 */
export function containsBlockedPath(command: string): boolean {
  // Check for opencode paths in command
  if (command.includes(".local/share/opencode")) {
    return true
  }

  // Check for auth file access patterns
  if (/auth\.json|mcp-auth\.json|opencode\.db/.test(command)) {
    return true
  }

  // Check for environment variable dumping that could expose secrets
  if (/printenv|env\s*\|/.test(command)) {
    return true
  }

  // Check for /proc/self/environ access (Linux)
  if (command.includes("/proc/self/environ")) {
    return true
  }

  return false
}

/**
 * Filter sensitive environment variables from process.env
 */
export function filterSensitiveEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const filtered: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(env)) {
    let blocked = false
    for (const pattern of BLOCKED_ENV_PATTERNS) {
      if (pattern.test(key)) {
        blocked = true
        break
      }
    }
    if (!blocked) {
      filtered[key] = value
    }
  }

  return filtered
}

/**
 * Get blocked path error message
 */
export function getBlockedPathError(filepath: string): string {
  return `Access denied: Cannot access opencode internal path "${filepath}". This path contains sensitive data and is protected from AI access.`
}

/**
 * Get blocked command error message
 */
export function getBlockedCommandError(command: string): string {
  return `Command blocked: The command appears to attempt accessing sensitive opencode data or environment variables. Command: "${command}"`
}
