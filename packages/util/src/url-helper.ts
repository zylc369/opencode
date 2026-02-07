export namespace UrlHelper {
  export function getProtocolHostWithPort(url: string): string {
    if (!url?.trim()) return ""

    // 确保有协议
    const normalizedUrl = url.includes("://") ? url : `http://${url}`
    try {
      const urlObj = new URL(normalizedUrl)

      // 如果有端口号，返回 hostname:port，否则只返回 hostname
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ""}`
    } catch {
      // 如果解析失败，尝试使用字符串匹配
      // 提取到第一个 / 或 ? 或 # 之前的部分
      const hostPart = normalizedUrl.split(/[/?#]/)[0]
      return hostPart
    }
  }

  /**
   * 提取完整主机（hostname:port）
   * 对于 localhost:3000 会返回 "localhost:3000"
   * 对于 https://app.opencode.ai 会返回 "app.opencode.ai"
   * @param url - 完整的URL或主机字符串
   * @returns 主机名（包含端口）
   */
  export function getHostWithPort(url: string): string {
    if (!url?.trim()) return ""

    try {
      // 确保有协议
      const normalizedUrl = url.includes("://") ? url : `http://${url}`
      const urlObj = new URL(normalizedUrl)

      // 如果有端口号，返回 hostname:port，否则只返回 hostname
      return `${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ""}`
    } catch {
      // 如果解析失败，尝试直接提取主机部分
      // 移除协议
      const withoutProtocol = url.replace(/^([a-zA-Z]+:\/\/)?/, "")
      // 提取到第一个 / 或 ? 或 # 之前的部分
      const hostPart = withoutProtocol.split(/[/?#]/)[0]
      return hostPart
    }
  }

  /**
   * 仅提取主机名（不包含端口）- 原来的 getBaseDomain
   */
  export function getHostnameOnly(url: string): string {
    const fullHost = getHostWithPort(url)
    return fullHost.split(":")[0] // 去掉端口部分
  }
}
