import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AuthError,
  connectErrorMessage,
  createBackend,
  isAuthError,
  isRetryable,
  NetworkError,
  ServerError,
} from "./api"

const backend = createBackend({ api: "https://script.example/exec", code: "abcd-efgh-jkmn" })

function reply(body: string, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  )
}

async function failure(): Promise<unknown> {
  try {
    await backend.list(7)
  } catch (e) {
    return e
  }
  throw new Error("expected the call to fail")
}

afterEach(() => vi.unstubAllGlobals())

describe("RemoteBackend errors", () => {
  it("returns the result of a good reply", async () => {
    reply(JSON.stringify({ ok: true, result: [] }))
    await expect(backend.list(7)).resolves.toEqual([])
  })

  it("retries an error status", async () => {
    reply("Internal error", 500)
    const e = await failure()
    expect(e).toBeInstanceOf(ServerError)
    expect(isRetryable(e)).toBe(true)
  })

  it("retries an HTML page sent with status 200", async () => {
    reply("<!doctype html><title>Sign in to the wifi</title>")
    const e = await failure()
    expect(e).toBeInstanceOf(ServerError)
    expect((e as ServerError).reason).toBe("format")
    expect(isRetryable(e)).toBe(true)
  })

  it("retries when the script asks for it", async () => {
    reply(JSON.stringify({ ok: false, error: "The Sheet is busy. Try again in a moment.", retry: true }))
    const e = await failure()
    expect(isRetryable(e)).toBe(true)
    expect((e as Error).message).toBe("The Sheet is busy. Try again in a moment.")
  })

  it("treats a refusal without retry as permanent", async () => {
    reply(JSON.stringify({ ok: false, error: "Unknown entry type" }))
    const e = await failure()
    expect(isRetryable(e)).toBe(false)
    expect(isAuthError(e)).toBe(false)
    expect((e as Error).message).toBe("Unknown entry type")
  })

  it("retries when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      }),
    )
    const e = await failure()
    expect(e).toBeInstanceOf(NetworkError)
    expect(isRetryable(e)).toBe(true)
  })

  it("flags a code the Sheet no longer accepts", async () => {
    reply(JSON.stringify({ ok: false, error: "That code is not valid. Ask for your personal setup link.", auth: true }))
    const e = await failure()
    expect(e).toBeInstanceOf(AuthError)
    expect(isRetryable(e)).toBe(false)
  })

  it("recognizes the invalid code message from older scripts", async () => {
    reply(JSON.stringify({ ok: false, error: "That code is not valid. Ask for your personal setup link." }))
    expect(isAuthError(await failure())).toBe(true)
  })
})

describe("connectErrorMessage", () => {
  const notScript = "That link doesn't look like the tracker's script URL. It should end in /exec."

  it("explains a link to the app page instead of the script", async () => {
    reply("Method not allowed", 405)
    expect(connectErrorMessage(await failure())).toBe(notScript)
  })

  it("explains a link to some other page", async () => {
    reply("<html>Hello</html>")
    expect(connectErrorMessage(await failure())).toBe(notScript)
  })

  it("passes on the script's own message", async () => {
    reply(JSON.stringify({ ok: false, error: "That code is not valid. Ask for your personal setup link." }))
    expect(connectErrorMessage(await failure())).toBe("That code is not valid. Ask for your personal setup link.")
  })
})
