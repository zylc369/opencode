import { Log } from "@/util/log"

let GLOBAL_RUNTIME_UNMATCHED_REQUEST_PROXY = "https://app.opencode.ai"

export namespace Runtime {
  const log = Log.create({ service: "server" })

  export const Global = {
    getUnMatchedRequestProxy() {
      return GLOBAL_RUNTIME_UNMATCHED_REQUEST_PROXY
    },
    setUnMatchedRequestProxy(newProxy: string) {
      log.info(`Change unmatched request proxy. ${GLOBAL_RUNTIME_UNMATCHED_REQUEST_PROXY} -> ${newProxy}`)
      GLOBAL_RUNTIME_UNMATCHED_REQUEST_PROXY = newProxy
    },
  }
}
