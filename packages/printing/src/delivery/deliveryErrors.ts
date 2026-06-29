/**
 * Raw printer sockets (port 9100) often close immediately after accepting data.
 * ProxyBox and similar gateways may surface that as a fetch/socket error even
 * though the label was delivered.
 */
export function isConnectionRefusedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const message = err.message.toLowerCase();
  if (message.includes("econnrefused") || message.includes("enotfound")) {
    return true;
  }

  const cause = err.cause;
  if (!cause || typeof cause !== "object") return false;

  const code = (cause as { code?: string }).code;
  return code === "ECONNREFUSED" || code === "ENOTFOUND";
}

export function isLikelyPrinterDeliveryCompleteError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  if (isConnectionRefusedError(err)) {
    return false;
  }

  if (
    err.name === "AbortError" ||
    err.message.toLowerCase().includes("aborted") ||
    err.message.toLowerCase().includes("timeout")
  ) {
    return true;
  }

  const message = err.message.toLowerCase();
  if (
    message.includes("other side closed") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("fetch failed")
  ) {
    return true;
  }

  const cause = err.cause;
  if (!cause || typeof cause !== "object") return false;

  const code = (cause as { code?: string }).code;
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") {
    return true;
  }

  const socket = (cause as { socket?: { bytesWritten?: number } }).socket;
  return typeof socket?.bytesWritten === "number" && socket.bytesWritten > 0;
}
