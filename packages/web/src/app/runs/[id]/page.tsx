import { RunViewer } from "@/components/RunViewer";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

interface RunEvent {
  event: string;
  data: Record<string, unknown>;
}

interface RunData {
  id: string;
  events?: RunEvent[];
  run?: Record<string, unknown>;
  results?: Array<Record<string, unknown>>;
  status: string;
}

async function fetchRun(id: string): Promise<RunData | null> {
  try {
    const res = await fetch(`${API_URL}/api/runs/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Convert DB results format to event format for RunViewer */
function dbToEvents(data: RunData): RunData {
  if (data.events) return data;
  if (!data.results) return { ...data, events: [] };

  const events: RunEvent[] = [
    { event: "run.started", data: { runId: data.id, agents: data.results.map((r) => r.agent), criteriaCount: 0 } },
  ];

  for (const r of data.results) {
    events.push({ event: "agent.started", data: { agent: r.agent } });
    if (r.status === "error") {
      events.push({ event: "agent.error", data: { agent: r.agent, error: "execution_error", message: r.error ?? "", duration: r.duration_ms ?? r.durationMs ?? 0 } });
    } else {
      events.push({ event: "agent.completed", data: { agent: r.agent, status: r.status, duration: r.duration_ms ?? r.durationMs ?? 0, fileSummary: "" } });
    }
  }

  events.push({ event: "run.completed", data: { runId: data.id, duration: 0 } });
  return { ...data, events };
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rawData = await fetchRun(id);

  if (!rawData) {
    return (
      <main className="max-w-[720px] mx-auto px-4 py-16">
        <p className="text-[var(--dim)]">Run not found.</p>
      </main>
    );
  }

  const run = dbToEvents(rawData);
  return <RunViewer run={{ ...run, events: run.events ?? [] }} />;
}
