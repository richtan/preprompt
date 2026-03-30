import { describe, it, expect, vi } from "vitest"
import { eventStore } from "../src/events.js"

describe("EventStore", () => {
  it("stores and retrieves events", () => {
    eventStore.push("run-1", { event: "run.started", data: { runId: "run-1" } })
    eventStore.push("run-1", { event: "agent.started", data: { agent: "claude-code" } })

    const events = eventStore.getAll("run-1")
    expect(events).toHaveLength(2)
    expect(events[0].event.event).toBe("run.started")
    expect(events[1].event.event).toBe("agent.started")
    expect(events[0].id).toBe("0")
    expect(events[1].id).toBe("1")
  })

  it("replays events on subscribe", () => {
    const received: string[] = []

    eventStore.push("run-2", { event: "run.started", data: { runId: "run-2" } })
    eventStore.push("run-2", { event: "agent.started", data: { agent: "codex" } })

    eventStore.subscribe("run-2", (e) => received.push(e.event.event))

    expect(received).toEqual(["run.started", "agent.started"])
  })

  it("replays from specific event ID", () => {
    const received: string[] = []

    eventStore.push("run-3", { event: "run.started", data: {} })
    eventStore.push("run-3", { event: "agent.started", data: {} })
    eventStore.push("run-3", { event: "agent.completed", data: {} })

    eventStore.subscribe("run-3", (e) => received.push(e.event.event), "0")

    // Should skip event 0, replay from event 1 onwards
    expect(received).toEqual(["agent.started", "agent.completed"])
  })

  it("delivers live events to subscribers", () => {
    const received: string[] = []

    eventStore.subscribe("run-4", (e) => received.push(e.event.event))
    eventStore.push("run-4", { event: "run.started", data: {} })
    eventStore.push("run-4", { event: "agent.started", data: {} })

    expect(received).toEqual(["run.started", "agent.started"])
  })

  it("unsubscribe stops delivery", () => {
    const received: string[] = []

    const unsub = eventStore.subscribe("run-5", (e) => received.push(e.event.event))
    eventStore.push("run-5", { event: "run.started", data: {} })
    unsub()
    eventStore.push("run-5", { event: "agent.started", data: {} })

    expect(received).toEqual(["run.started"])
  })

  it("has() returns correct status", () => {
    expect(eventStore.has("nonexistent")).toBe(false)
    eventStore.push("run-6", { event: "run.started", data: {} })
    expect(eventStore.has("run-6")).toBe(true)
  })
})
