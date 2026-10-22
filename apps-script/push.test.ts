import { createDecipheriv, createECDH, createHmac, createHash, createPublicKey, randomUUID, verify } from "node:crypto"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

// The Sheet script runs in Apps Script, so this loads it with just enough of Apps Script's Utilities to test
// the Web Push encryption and signing against Node's own crypto. Apps Script byte arrays are signed.
const signed = (buf: Buffer) => Array.from(buf, (b) => (b > 127 ? b - 256 : b))
const buf = (bytes: number[]) => Buffer.from(bytes.map((b) => b & 255))

const Utilities = {
  DigestAlgorithm: { SHA_256: "sha256" },
  computeDigest: (_alg: string, data: number[]) => signed(createHash("sha256").update(buf(data)).digest()),
  computeHmacSha256Signature: (data: number[], key: number[]) =>
    signed(createHmac("sha256", buf(key)).update(buf(data)).digest()),
  base64EncodeWebSafe: (data: number[]) => buf(data).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
  base64DecodeWebSafe: (text: string) => signed(Buffer.from(text, "base64url")),
  newBlob: (text: string) => ({ getBytes: () => signed(Buffer.from(text, "utf8")) }),
  getUuid: () => randomUUID(),
}

const source = readFileSync(new URL("./Code.gs", import.meta.url), "utf8")
/** Runs the script in a fresh context. Its top-level functions become properties of the context object. */
const load = (globals: Record<string, unknown> = {}) =>
  runInNewContext(source + "\nthis", { Utilities, BigInt, ...globals }) as Record<string, (...a: unknown[]) => unknown>
const gs = load()

const call = <T>(name: string, ...args: unknown[]) => gs[name](...args) as T
const b64 = (s: string) => Array.from(Buffer.from(s, "base64url"))

/** Decrypts an aes128gcm push body the way a browser does, with Node's crypto (RFC 8291). */
function decrypt(body: Buffer, uaPrivate: Buffer, uaPublic: Buffer, auth: Buffer) {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const asPublic = body.subarray(21, 21 + idlen)
  const ecdh = createECDH("prime256v1")
  ecdh.setPrivateKey(uaPrivate)
  const shared = ecdh.computeSecret(asPublic)
  const hkdf = (s: Buffer, ikm: Buffer, info: Buffer, len: number) => {
    const prk = createHmac("sha256", s).update(ikm).digest()
    return createHmac("sha256", prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len)
  }
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32)
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16)
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12)
  const sealed = body.subarray(21 + idlen)
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce)
  decipher.setAuthTag(sealed.subarray(sealed.length - 16))
  const plain = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()])
  expect(plain[plain.length - 1]).toBe(2)
  return plain.subarray(0, plain.length - 1).toString("utf8")
}

describe("Web Push in the Sheet script", () => {
  it("matches the worked example in RFC 8291", () => {
    const body = call<number[]>(
      "encryptPush_",
      Array.from(Buffer.from("When I grow up, I want to be a watermelon")),
      b64("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
      b64("BTBZMqHH6r4Tts7J_aSIgg"),
      { d: b64("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"), salt: b64("DGv6ra1nlYgDCS1FRnbzlw") },
    )
    expect(Buffer.from(body).toString("base64url")).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    )
  })

  it("encrypts a message a phone can decrypt", () => {
    const phone = createECDH("prime256v1")
    const uaPublic = phone.generateKeys()
    const auth = Buffer.from(randomUUID().replace(/-/g, ""), "hex")
    const message = JSON.stringify({ web_push: 8030, notification: { title: "Carolina", body: "🍼 Feeding window is open ".repeat(20) } })
    const body = call<number[]>("encryptPush_", call("utf8_", message), Array.from(uaPublic), Array.from(auth))
    expect(decrypt(Buffer.from(body), phone.getPrivateKey(), uaPublic, auth)).toBe(message)
  })

  it("signs a VAPID token that verifies with its public key", () => {
    const pair = call<{ d: number[]; pub: number[] }>("ecKeyPair_")
    const jwt = call<string>("vapidJwt_", { aud: "https://web.push.apple.com", exp: 1, sub: "https://example.com/" }, pair.d)
    const [header, claims, sig] = jwt.split(".")
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" })
    expect(JSON.parse(Buffer.from(claims, "base64url").toString()).aud).toBe("https://web.push.apple.com")
    const pub = Buffer.from(pair.pub)
    const key = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") },
      format: "jwk",
    })
    const ok = verify("sha256", Buffer.from(header + "." + claims), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))
    expect(ok).toBe(true)
  })

  it("makes the same public key as Node for a private key", () => {
    const node = createECDH("prime256v1")
    node.generateKeys()
    const pub = call<{ x: bigint; y: bigint }>("ecMul_", BigInt("0x" + node.getPrivateKey("hex")), call<{ g: unknown }>("curve_").g)
    expect(Buffer.from(call<number[]>("ecEncode_", pub)).equals(node.getPublicKey())).toBe(true)
  })

  it("refuses a key that isn't on the curve", () => {
    const bad = Array.from(createECDH("prime256v1").generateKeys())
    bad[64] ^= 1
    expect(() => call("ecPoint_", bad)).toThrow(/P-256/)
  })

  it("turns Discord text into lock screen text", () => {
    // plain_ formats clock times in the script's time zone, so give it one.
    const withTz = load({
      Utilities: { ...Utilities, formatDate: (d: Date) => d.toISOString().slice(11, 16) },
      Session: { getScriptTimeZone: () => "UTC" },
    })
    const now = Date.UTC(2026, 0, 1, 12, 0)
    expect(withTz.plain_("Mom can take **Tylenol** now. Last dose at <t:" + (now / 1000 - 3600) + ":t>.", now)).toBe(
      "Mom can take Tylenol now. Last dose at 11:00.",
    )
    expect(withTz.plain_("Last checked <t:" + (now / 1000 - 9000) + ":R>.", now)).toBe("Last checked 2.5 hours ago.")
    expect(withTz.plain_("<t:" + (now / 1000 - 600) + ":R>", now)).toBe("10 min ago")
  })

  it("sends to every signed-up phone and forgets ones that are gone", () => {
    const props: Record<string, string> = {}
    const sent: { url: string; headers: Record<string, string>; body: Buffer }[] = []
    const phones = [0, 1].map(() => createECDH("prime256v1"))
    const auth = Buffer.alloc(16, 7)
    const script = load({
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k: string) => props[k] ?? null,
          setProperty: (k: string, v: string) => (props[k] = v),
        }),
      },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      ScriptApp: { getProjectTriggers: () => [] },
      SpreadsheetApp: { getActive: () => ({ getSheetByName: () => null }) },
      Logger: { log() {} },
      Utilities: {
        ...Utilities,
        newBlob: (data: string | number[]) =>
          typeof data === "string" ? Utilities.newBlob(data) : { bytes: buf(data) },
      },
      UrlFetchApp: {
        fetch: (url: string, opts: { headers: Record<string, string>; payload: { bytes: Buffer } }) => {
          sent.push({ url, headers: opts.headers, body: opts.payload.bytes })
          return { getResponseCode: () => (url.includes("gone") ? 410 : 201), getContentText: () => "" }
        },
      },
    })
    const subscribe = (endpoint: string, phone: (typeof phones)[number]) =>
      script.pushSubscribe_(
        { endpoint, keys: { p256dh: phone.generateKeys().toString("base64url"), auth: auth.toString("base64url") } },
        "Abel",
      )
    expect(subscribe("https://web.push.apple.com/abc", phones[0])).toEqual({ reminders: false })
    subscribe("https://fcm.googleapis.com/fcm/send/gone", phones[1])

    const s = { babyName: "Carolina", appUrl: "https://atpia.github.io/carolina-tracker/" }
    expect(script.pushAll_("Time for a diaper check.", "diaper", 1, s)).toBe(true)
    expect(sent.map((r) => r.url)).toEqual(["https://web.push.apple.com/abc", "https://fcm.googleapis.com/fcm/send/gone"])
    expect(sent[0].headers["Content-Encoding"]).toBe("aes128gcm")
    expect(sent[0].headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/)
    const jwt = sent[0].headers.Authorization.slice(8).split(",")[0]
    expect(JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).aud).toBe("https://web.push.apple.com")
    const message = JSON.parse(decrypt(sent[0].body, phones[0].getPrivateKey(), phones[0].getPublicKey(), auth))
    expect(message).toEqual({
      web_push: 8030,
      notification: {
        title: "Carolina",
        body: "Time for a diaper check.",
        navigate: "https://atpia.github.io/carolina-tracker/",
        tag: "diaper",
        lang: "en-US",
        app_badge: 1,
      },
    })
    // The 410 phone is dropped; the other stays.
    expect(JSON.parse(props.pushSubs).map((p: { endpoint: string }) => p.endpoint)).toEqual([
      "https://web.push.apple.com/abc",
    ])
  })
})
