import { RunViewer } from "@/components/RunViewer";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

interface RunEvent {
  event: string;
  data: Record<string, unknown>;
}

interface RunData {
  id: string;
  events: RunEvent[];
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

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await fetchRun(id);

  if (!run) {
    return (
      <main className="max-w-[720px] mx-auto px-4 py-16">
        <p className="text-[var(--dim)]">Run not found.</p>
      </main>
    );
  }

  return <RunViewer run={run} />;
}
