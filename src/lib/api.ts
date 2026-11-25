import { NextResponse } from 'next/server'

/**
 * Q1.5 — structured error envelopes.
 *
 * Every non-2xx API response now carries a consistent, machine-readable
 * shape: { error, code, retryable, ...extra }. `code` lets clients branch
 * precisely (e.g. storage-warming-up → auto-retry, key-invalid → open key
 * settings); `retryable` distinguishes transient upstream failures from
 * permanent request errors. Extra payload fields (items: [], removed, …)
 * ride along unchanged so existing clients keep working.
 */

export type ApiErrorCode =
  | 'bad-request'
  | 'not-found'
  | 'payload-too-large'
  | 'key-required'
  | 'key-invalid'
  | 'upstream-unavailable'
  | 'storage-warming-up'
  | 'rate-limited'
  | 'server-error'

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  400: 'bad-request',
  404: 'not-found',
  413: 'payload-too-large',
  429: 'rate-limited',
  502: 'upstream-unavailable',
  503: 'storage-warming-up',
  504: 'upstream-unavailable',
}

/** Statuses worth retrying (transient upstream/infra failures). */
function defaultRetryable(status: number): boolean {
  return status >= 500
}

export function apiError(
  message: string,
  opts: {
    status?: number
    code?: ApiErrorCode
    retryable?: boolean
    /** Extra fields merged into the body (items: [], removed, reason…). */
    [key: string]: unknown
  } = {}
): NextResponse {
  const { status = 500, code, retryable, ...extra } = opts
  const body = {
    error: message,
    code: code ?? CODE_BY_STATUS[status] ?? 'server-error',
    retryable: retryable ?? defaultRetryable(status),
    ...extra,
  }
  return NextResponse.json(body, { status })
}
