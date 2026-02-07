import { Server } from "../../server/server"
import { UI } from "../ui"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"
import open from "open"
import { networkInterfaces } from "os"
import { Runtime } from "@/runtime"
import { UrlHelper } from "@opencode-ai/util/url-helper"
import { Log } from "@/util/log"

function getNetworkIPs() {
  const nets = networkInterfaces()
  const results: string[] = []

  for (const name of Object.keys(nets)) {
    const net = nets[name]
    if (!net) continue

    for (const netInfo of net) {
      // Skip internal and non-IPv4 addresses
      if (netInfo.internal || netInfo.family !== "IPv4") continue

      // Skip Docker bridge networks (typically 172.x.x.x)
      if (netInfo.address.startsWith("172.")) continue

      results.push(netInfo.address)
    }
  }

  return results
}

export const WebCommand = cmd({
  command: "web",
  builder: (yargs) =>
    withNetworkOptions(yargs).option("unmatched-request-proxy", {
      type: "string",
      describe: "custom unmatched request proxy",
    }),
  describe: "start opencode server and open web interface",
  handler: async (args) => {
    const log = Log.create({ service: "WebCommand" })

    if (!Flag.OPENCODE_SERVER_PASSWORD) {
      const logContent = "!  " + "OPENCODE_SERVER_PASSWORD is not set; server is unsecured."
      UI.println(UI.Style.TEXT_WARNING_BOLD + logContent)
      log.info(logContent)
    }

    if (args.unmatchedRequestProxy) {
      const unmatchedRequestProxy = UrlHelper.getProtocolHostWithPort(args.unmatchedRequestProxy)
      Runtime.Global.setUnMatchedRequestProxy(unmatchedRequestProxy)
    }

    const opts = await resolveNetworkOptions(args)
    log.info(`opts=${JSON.stringify(opts)}`)
    // will open a server
    const server = Server.listen(opts)
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()

    if (opts.hostname === "0.0.0.0") {
      // Show localhost for local access
      const localhostUrl = `http://localhost:${server.port}`
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Local access:      ", UI.Style.TEXT_NORMAL, localhostUrl)
      log.info(`Local access: ${localhostUrl}`)

      // Show network IPs for remote access
      const networkIPs = getNetworkIPs()
      if (networkIPs.length > 0) {
        for (const ip of networkIPs) {
          const url = `http://${ip}:${server.port}`
          UI.println(UI.Style.TEXT_INFO_BOLD + "  Network access:    ", UI.Style.TEXT_NORMAL, url)
          log.info(`Network access: ${url}`)
        }
      }

      if (opts.mdns) {
        const mdns = `${opts.mdnsDomain}:${server.port}`
        UI.println(UI.Style.TEXT_INFO_BOLD + "  mDNS:              ", UI.Style.TEXT_NORMAL, mdns)
        log.info(`mDNS: ${mdns}`)
      }

      // Open localhost in browser
      log.info(`Open localhost in browser: ${localhostUrl}`)
      open(localhostUrl.toString()).catch(() => {})
    } else {
      const displayUrl = server.url.toString()
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Web interface:    ", UI.Style.TEXT_NORMAL, displayUrl)
      log.info(`Open localhost in browser: ${displayUrl}, hostname: ${opts.hostname}`)
      open(displayUrl).catch(() => {})
    }

    await new Promise(() => {})
    await server.stop()
  },
})
