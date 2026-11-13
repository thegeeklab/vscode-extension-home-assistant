/**
 * Translate a connection error into a human-readable message with an actionable
 * hint for the most common failure modes (DNS, refused, timeout, TLS).
 */
export function describeConnectionError(error: unknown): string {
  if (!error) {
    return "Unknown error"
  }

  const err = error as NodeJS.ErrnoException
  // Node http/https errors carry a `.code` directly, while fetch (undici) hides
  // the real failure under `error.cause`. Unwrap both so the user sees the cause.
  const cause = (err.cause as NodeJS.ErrnoException | undefined) ?? err
  const code = cause.code ?? err.code
  const baseMessage = cause.message ?? err.message ?? String(error)

  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `${baseMessage} — the hostname could not be resolved. Check the URL/DNS. mDNS '.local' names often don't resolve from the editor; try the IP address instead.`
    case "ECONNREFUSED":
      return `${baseMessage} — connection refused. Make sure Home Assistant is running and reachable at this host and port.`
    case "ETIMEDOUT":
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return `${baseMessage} — could not reach the host. Check your network/firewall and that the port is correct.`
    case "CERT_HAS_EXPIRED":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
      return `${baseMessage} — TLS certificate problem. For a self-signed certificate, set 'home-assistant.ignoreCertificates' to true.`
    default:
      return code ? `${baseMessage} (${code})` : baseMessage
  }
}
