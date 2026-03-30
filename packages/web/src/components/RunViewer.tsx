/**
 * Run viewer — renders cloud run results.
 *
 * Design spec from plan:
 * - Monospace everything (Geist Mono)
 * - max-width 720px, centered
 * - No cards, no borders, no shadows
 * - Agents are sections separated by 1px lines
 * - Typed prefixes: + green (create), ~ yellow (edit), > dim (command)
 * - Score: "N failed" green if 0, red if >0
 */

interface RunEvent {
  event: string;
  data: Record<string, unknown>;
}

interface RunData {
  id: string;
  events: RunEvent[];
  status: string;
}

interface AgentData {
  name: string;
  status: "pass" | "fail" | "error" | "running";
  duration: number;
  actions: Array<{ type: string; text: string }>;
  failed: string[];
  error?: string;
}

function parseAgents(events: RunEvent[]): {
  agents: AgentData[];
  prompt?: string;
  totalDuration?: number;
} {
  const agentMap = new Map<string, AgentData>();
  let totalDuration = 0;

  for (const e of events) {
    const agent = e.data.agent as string | undefined;

    if (e.event === "agent.started" && agent) {
      agentMap.set(agent, {
        name: agent,
        status: "running",
        duration: 0,
        actions: [],
        failed: [],
      });
    }

    if (e.event === "agent.action" && agent) {
      const a = agentMap.get(agent);
      if (a) {
        a.actions.push({
          type: (e.data.type as string) ?? "command",
          text: (e.data.text as string) ?? "",
        });
      }
    }

    if (e.event === "agent.completed" && agent) {
      const a = agentMap.get(agent);
      if (a) {
        a.status = (e.data.status as "pass" | "fail") ?? "pass";
        a.duration = (e.data.duration as number) ?? 0;
      }
    }

    if (e.event === "agent.error" && agent) {
      const a = agentMap.get(agent);
      if (a) {
        a.status = "error";
        a.duration = (e.data.duration as number) ?? 0;
        a.error = (e.data.message as string) ?? "Unknown error";
      }
    }

    if (e.event === "agent.evaluated" && agent) {
      const a = agentMap.get(agent);
      if (a) {
        const steps = (e.data.steps as Array<{ status: string; description: string }>) ?? [];
        a.failed = steps
          .filter((s) => s.status === "fail")
          .map((s) => s.description);
      }
    }

    if (e.event === "run.completed") {
      totalDuration = (e.data.duration as number) ?? 0;
    }
  }

  return { agents: Array.from(agentMap.values()), totalDuration };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ActionPrefix({ type }: { type: string }) {
  switch (type) {
    case "create":
      return <span className="text-[var(--create)]">+</span>;
    case "edit":
      return <span className="text-[var(--edit)]">~</span>;
    default:
      return <span className="text-[var(--command)]">&gt;</span>;
  }
}

function AgentSection({ agent }: { agent: AgentData }) {
  const failCount = agent.failed.length;
  const statusColor =
    agent.status === "pass"
      ? "text-[var(--pass)]"
      : agent.status === "error"
        ? "text-[var(--fail)]"
        : "text-[var(--fail)]";

  return (
    <section>
      {/* Agent header: name + duration + status */}
      <div className="flex justify-between items-baseline">
        <span className="font-semibold">{agent.name}</span>
        <span>
          <span className="text-[var(--dim)] mr-6">
            {formatDuration(agent.duration)}
          </span>
          <span className={statusColor}>
            {agent.status === "error"
              ? "ERROR"
              : agent.status === "pass"
                ? "PASS"
                : "FAIL"}
          </span>
        </span>
      </div>

      {/* Action history */}
      <div className="mt-1 text-sm">
        {agent.actions.map((action, i) => (
          <div key={i} className="pl-4">
            <ActionPrefix type={action.type} /> {action.text}
          </div>
        ))}
      </div>

      {/* Score + failures */}
      <div className="mt-1 pl-4 text-sm">
        {agent.status === "error" ? (
          <span className="text-[var(--fail)]">{agent.error}</span>
        ) : (
          <>
            <span className={failCount === 0 ? "text-[var(--pass)]" : "text-[var(--fail)]"}>
              {failCount} failed
            </span>
            {agent.failed.map((desc, i) => (
              <div key={i} className="pl-2">
                <span className="text-[var(--fail)]">-</span> {desc}
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

export function RunViewer({ run }: { run: RunData }) {
  const { agents, totalDuration } = parseAgents(run.events);
  const failedCount = agents.filter(
    (a) => a.status === "fail" || a.status === "error"
  ).length;

  return (
    <main className="max-w-[720px] mx-auto px-4 py-8">
      {/* Wordmark */}
      <div className="text-xs text-[var(--faint)] mb-8">PrePrompt</div>

      {/* Run header */}
      <h1 className="text-2xl font-semibold mb-1">{run.id.slice(0, 8)}</h1>
      <div className="text-sm text-[var(--dim)] mb-8">
        {totalDuration ? formatDuration(totalDuration) : ""}
        {" · "}
        {agents.length} agents
        {" · "}
        <span className={failedCount === 0 ? "text-[var(--pass)]" : "text-[var(--fail)]"}>
          {failedCount} failed
        </span>
      </div>

      {/* Agent sections */}
      <div className="divide-y divide-[var(--separator)]">
        {agents.map((agent) => (
          <div key={agent.name} className="py-4">
            <AgentSection agent={agent} />
          </div>
        ))}
      </div>
    </main>
  );
}
