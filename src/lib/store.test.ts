import { describe, expect, it } from "vitest"

import { addToQueue, upsert, withQueued, without, type QueuedOp } from "./store"
import type { LogEvent } from "./types"

const ev = (id: string, extra: Partial<LogEvent> = {}): LogEvent => ({
  id,
  type: "diaper",
  kind: "wet",
  start: "2026-11-09T10:00:00.000Z",
  by: "Mom",
  ...extra,
})

describe("addToQueue", () => {
  it("keeps only the newest save of an entry", () => {
    let q: QueuedOp[] = []
    q = addToQueue(q, { op: "save", event: ev("a", { kind: "wet" }) }, "1")
    q = addToQueue(q, { op: "save", event: ev("b") }, "2")
    q = addToQueue(q, { op: "save", event: ev("a", { kind: "stool" }) }, "3")
    expect(q.map((op) => op.qid)).toEqual(["2", "3"])
    expect(q[1]).toMatchObject({ op: "save", event: { id: "a", kind: "stool" } })
  })

  it("keeps a delete after the save it follows", () => {
    let q: QueuedOp[] = []
    q = addToQueue(q, { op: "save", event: ev("a") }, "1")
    q = addToQueue(q, { op: "delete", id: "a" }, "2")
    expect(q.map((op) => op.op)).toEqual(["save", "delete"])
  })
})

describe("withQueued", () => {
  it("lays waiting saves and deletes over the Sheet's list in order", () => {
    const list = [ev("a"), ev("b")]
    const queue: QueuedOp[] = [
      { op: "save", event: ev("c"), qid: "1" },
      { op: "save", event: ev("a", { kind: "dry" }), qid: "2" },
      { op: "delete", id: "b", qid: "3" },
    ]
    const out = withQueued(list, queue)
    expect(out.map((e) => e.id).sort()).toEqual(["a", "c"])
    expect(out.find((e) => e.id === "a")?.kind).toBe("dry")
  })
})

describe("upsert and without", () => {
  it("replace by id and remove by id", () => {
    expect(upsert([ev("a"), ev("b")], ev("a", { kind: "both" })).map((e) => [e.id, e.kind])).toEqual([
      ["b", "wet"],
      ["a", "both"],
    ])
    expect(without([ev("a"), ev("b")], "a").map((e) => e.id)).toEqual(["b"])
  })
})
