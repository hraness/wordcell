export type PdfCaptureErrorCode = "invalid-input" | "encrypted" | "limit-exceeded" | "tool-unavailable" | "extraction-failed" | "timeout" | "cancelled" | "integrity" | "unsupported-schema" | "unknown";

/** Codes describe observed failures; unknown errors are never classified from their prose. */
export class PdfCaptureError extends Error {
  readonly code: PdfCaptureErrorCode;
  constructor(code: PdfCaptureErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "PdfCaptureError";
  }
}
