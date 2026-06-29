import { isLikelyPrinterDeliveryCompleteError } from "./deliveryErrors";

function deliveryTimeoutMs(content: string | Buffer | Uint8Array): number {
  const bytes =
    typeof content === "string"
      ? Buffer.byteLength(content)
      : content.byteLength;
  // Rasterized 4x6 shipping labels are often 100KB–2MB.
  return Math.min(
    120_000,
    Math.max(15_000, 15_000 + Math.floor(bytes / 25_000) * 1000)
  );
}

export async function sendToProxyBox({
  url,
  apiKey,
  content
}: {
  url: string;
  apiKey?: string | null;
  content: string | Buffer;
}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream"
  };

  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const body = typeof content === "string" ? content : new Uint8Array(content);
  const timeoutMs = deliveryTimeoutMs(body);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" ||
        err.message.toLowerCase().includes("timeout"))
    ) {
      throw new Error(
        `Printer delivery timed out after ${Math.round(timeoutMs / 1000)}s — label may be too large or the printer is unreachable`
      );
    }
    if (isLikelyPrinterDeliveryCompleteError(err)) {
      return { success: true, assumedDelivered: true };
    }
    throw err;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `ProxyBox delivery failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`
    );
  }

  return { success: true };
}
