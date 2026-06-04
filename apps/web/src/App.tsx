import {
  Activity,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  GitBranch,
  KeyRound,
  Lock,
  LogOut,
  MemoryStick,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  TerminalSquare
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { API_URL, ApiClientError, api, getOperatorToken, saveOperatorToken } from "./api";
import { locales, messages, type Locale } from "./i18n";

type Row = Record<string, any>;

interface Overview {
  project?: Row;
  missions: Row[];
  agents: Row[];
  policies: Row[];
  approvals: Row[];
  evidence: Row[];
  audit: Row[];
  memory: Row[];
  evaluations: Row[];
  improvements: Row[];
  patches: Row[];
  jobs: Row[];
}

const emptyOverview: Overview = {
  missions: [],
  agents: [],
  policies: [],
  approvals: [],
  evidence: [],
  audit: [],
  memory: [],
  evaluations: [],
  improvements: [],
  patches: [],
  jobs: []
};

const agentRoles = ["planner", "tester", "reviewer"] as const;

export default function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [modelProviders, setModelProviders] = useState<Row[]>([]);
  const [selectedMission, setSelectedMission] = useState("AOS-MIS-2026-BOOT01");
  const [agentRole, setAgentRole] = useState<(typeof agentRoles)[number]>("planner");
  const [providerId, setProviderId] = useState("manual");
  const [policyPath, setPolicyPath] = useState("auth/session.ts");
  const [policyResult, setPolicyResult] = useState<Row | null>(null);
  const [status, setStatus] = useState(messages.en.apiConnecting);
  const [busy, setBusy] = useState(false);
  const [operatorToken, setOperatorTokenState] = useState(() => getOperatorToken());
  const [tokenInput, setTokenInput] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const t = messages[locale];

  async function refresh() {
    try {
      const [data, providers] = await Promise.all([
        api<Overview>("/v1/overview"),
        api<Row[]>("/v1/model-providers").catch(() => [])
      ]);
      setOverview({ ...emptyOverview, ...data });
      setModelProviders(providers);
      setProviderId((current) => current || providers[0]?.id || "manual");
      setSelectedMission((current) => current || data.missions[0]?.id || "");
      setStatus(`${t.apiActive}: ${API_URL}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        saveOperatorToken("");
        setOperatorTokenState("");
        setAuthRequired(true);
      }
      setStatus(error instanceof Error ? error.message : "API indisponible");
    }
  }

  useEffect(() => {
    refresh();
  }, [t.apiActive]);

  const mission = useMemo(
    () => overview.missions.find((item) => item.id === selectedMission) ?? overview.missions[0],
    [overview.missions, selectedMission]
  );

  const missionId = mission?.id ?? "";
  const missionJobs = overview.jobs.filter((item) => item.missionId === missionId);
  const missionPatches = overview.patches.filter((item) => item.missionId === missionId);
  const missionEvidence = overview.evidence.filter((item) => item.missionId === missionId);
  const missionAudit = overview.audit.filter((item) => item.missionId === missionId);
  const latestPatch = missionPatches[0];

  const metrics = useMemo(() => {
    const waiting = overview.missions.filter((item) => item.status === "WAITING_APPROVAL").length;
    const activeJobs = overview.jobs.filter((item) => ["queued", "running"].includes(item.status)).length;
    const patchQueue = overview.patches.filter((item) =>
      ["proposed", "waiting_approval", "ready_to_apply"].includes(item.status)
    ).length;
    const blockedPolicies = overview.audit.filter((item) =>
      ["deny", "require_approval", "require_sandbox", "require_review"].includes(item.policyDecision)
    ).length;
    const evidenceCompleteness = overview.missions.length
      ? Math.round((overview.evidence.length / overview.missions.length) * 100)
      : 0;
    return { waiting, activeJobs, patchQueue, blockedPolicies, evidenceCompleteness };
  }, [overview]);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setStatus(label);
    try {
      await fn();
      await refresh();
      setStatus(`${label}: ${t.done}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        saveOperatorToken("");
        setOperatorTokenState("");
        setAuthRequired(true);
      }
      setStatus(error instanceof Error ? error.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">AOS</div>
          <div>
            <strong>AgentOps OS</strong>
            <span>{t.brandSubtitle}</span>
          </div>
        </div>
        <nav>
          <a href="#missions"><ClipboardCheck size={18} /> {t.missions}</a>
          <a href="#operations"><Activity size={18} /> Operations</a>
          <a href="#agents"><Bot size={18} /> {t.agents}</a>
          <a href="#patches"><GitBranch size={18} /> Patches</a>
          <a href="#evidence"><FileCheck2 size={18} /> {t.evidence}</a>
          <a href="#audit"><TerminalSquare size={18} /> {t.audit}</a>
        </nav>
        <select className="languageSelect" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
          {locales.map((item) => (
            <option key={item.code} value={item.code}>{item.label}</option>
          ))}
        </select>
        <button className="ghost" onClick={refresh}>
          <RefreshCw size={16} /> {t.refresh}
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Web cockpit now, IDE companion next</p>
            <h1>{overview.project?.name ?? "AgentOps OS"}</h1>
          </div>
          <div className="statusLine">
            <Database size={16} />
            <span>{status}</span>
          </div>
          <div className="operatorControls">
            <Badge value={operatorToken ? "operator" : "open"} />
            {operatorToken ? (
              <button className="iconButton" title="Lock" onClick={clearOperatorToken}>
                <LogOut size={16} />
              </button>
            ) : (
              <button className="iconButton" title="Operator token" onClick={() => setAuthRequired(true)}>
                <Lock size={16} />
              </button>
            )}
          </div>
        </header>

        {authRequired && !operatorToken && (
          <section className="authGate">
            <div className="authMark">
              <KeyRound size={26} />
            </div>
            <form onSubmit={submitOperatorToken}>
              <label>
                <span>Operator token</span>
                <input
                  autoFocus
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  type="password"
                />
              </label>
              <button disabled={!tokenInput.trim()}>
                <Lock size={16} /> Unlock
              </button>
            </form>
          </section>
        )}

        <section className="metrics">
          <Metric icon={<ClipboardCheck />} label={t.metricMissions} value={overview.missions.length} detail={`${metrics.waiting} ${t.waitingApproval}`} />
          <Metric icon={<Activity />} label="Active jobs" value={metrics.activeJobs} detail={`${overview.jobs.length} total jobs`} />
          <Metric icon={<GitBranch />} label="Patch queue" value={metrics.patchQueue} detail={`${overview.patches.length} proposals`} />
          <Metric icon={<Bot />} label="Providers" value={modelProviders.length} detail={providerId} />
          <Metric icon={<FileCheck2 />} label={t.evidence} value={`${metrics.evidenceCompleteness}%`} detail={t.evidenceCompleteness} />
        </section>

        <section className="grid two" id="missions">
          <article className="panel large">
            <div className="panelHead">
              <div>
                <p className="eyebrow">{t.missionManager}</p>
                <h2>{t.controlledCycle}</h2>
              </div>
              <button disabled={busy || !overview.project?.id} onClick={() => act(t.createMissionStatus, createMission)}>
                <Plus size={16} /> {t.missionButton}
              </button>
            </div>
            <div className="missionList">
              {overview.missions.map((item) => (
                <button key={item.id} className={item.id === mission?.id ? "mission active" : "mission"} onClick={() => setSelectedMission(item.id)}>
                  <span className={`dot ${String(item.riskLevel).toLowerCase()}`} />
                  <strong>{item.title}</strong>
                  <span>{item.id}</span>
                  <Badge value={item.status} />
                </button>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">{t.approvalLayer}</p>
                <h2>{t.activeMission}</h2>
              </div>
              {mission && <Badge value={mission.status} />}
            </div>
            {mission ? (
              <div className="stack">
                <div className="missionDetail">
                  <span>{mission.id}</span>
                  <h3>{mission.title}</h3>
                  <p>{mission.intent}</p>
                  <div className="detailGrid">
                    <Mini label="Risk" value={mission.riskLevel} />
                    <Mini label="Autonomy" value={mission.autonomyLevel} />
                    <Mini label="Jobs" value={missionJobs.length} />
                    <Mini label="Evidence" value={missionEvidence.length} />
                  </div>
                </div>
                <div className="controlStrip">
                  <label>
                    <span>Agent</span>
                    <select value={agentRole} onChange={(event) => setAgentRole(event.target.value as typeof agentRole)}>
                      {agentRoles.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Provider</span>
                    <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                      {(modelProviders.length ? modelProviders : [{ id: "manual" }]).map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.id}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="buttonRow">
                  <button disabled={busy} onClick={() => act(t.planStatus, () => api(`/v1/missions/${mission.id}/plan`, { method: "POST" }))}>
                    <GitBranch size={16} /> {t.plan}
                  </button>
                  <button disabled={busy} onClick={() => act(t.approvalStatus, approveMission)}>
                    <CheckCircle2 size={16} /> {t.approve}
                  </button>
                  <button disabled={busy} onClick={() => act("Agent run", runAgent)}>
                    <Bot size={16} /> Agent
                  </button>
                  <button disabled={busy} onClick={() => act("Queue tests", queueTests)}>
                    <Play size={16} /> Test job
                  </button>
                  <button disabled={busy} onClick={() => act(t.evaluateStatus, () => api(`/v1/missions/${mission.id}/evaluate`, { method: "POST" }))}>
                    <Activity size={16} /> Eval job
                  </button>
                  <button disabled={busy} onClick={() => act(t.evidenceStatus, attachManualEvidence)}>
                    <FileCheck2 size={16} /> {t.attachEvidence}
                  </button>
                  <button disabled={busy} onClick={() => act("Patch proposal", proposePatch)}>
                    <Plus size={16} /> Patch
                  </button>
                </div>
              </div>
            ) : (
              <p>{t.noMission}</p>
            )}
          </article>
        </section>

        <section className="grid three" id="operations">
          <article className="panel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">Job queue</p>
                <h2>Async operations</h2>
              </div>
              <Activity size={20} />
            </div>
            <RichList items={missionJobs.length ? missionJobs : overview.jobs} primary="type" secondary="status" meta={["id", "lastError"]} />
          </article>

          <article className="panel" id="patches">
            <div className="panelHead">
              <div>
                <p className="eyebrow">Patch-first</p>
                <h2>Proposals</h2>
              </div>
              <button disabled={busy || !latestPatch} onClick={() => act("Approve latest patch", approveLatestPatch)}>
                <CheckCircle2 size={16} /> Approve latest
              </button>
            </div>
            <RichList items={missionPatches.length ? missionPatches : overview.patches} primary="title" secondary="status" meta={["policyDecision", "evidenceId"]} />
          </article>

          <article className="panel" id="agents">
            <div className="panelHead">
              <div>
                <p className="eyebrow">{t.agentRouter}</p>
                <h2>Agents and providers</h2>
              </div>
              <Bot size={20} />
            </div>
            <RichList items={overview.agents} primary="name" secondary="role" meta={["status", "score"]} />
            <div className="divider" />
            <RichList items={modelProviders} primary="id" secondary="kind" meta={["capabilities"]} />
          </article>
        </section>

        <section className="grid three">
          <article className="panel" id="policies">
            <div className="panelHead">
              <div>
                <p className="eyebrow">{t.policyEngine}</p>
                <h2>{t.deterministicEvaluation}</h2>
              </div>
            </div>
            <div className="policyForm">
              <input value={policyPath} onChange={(event) => setPolicyPath(event.target.value)} />
              <button disabled={busy} onClick={() => act(t.policyStatus, checkPolicy)}>
                <ShieldCheck size={16} /> {t.check}
              </button>
            </div>
            {policyResult && (
              <div className={`decision ${policyResult.decision}`}>
                <strong>{policyResult.decision}</strong>
                <span>{policyResult.reason}</span>
              </div>
            )}
            <RichList items={overview.policies} primary="name" secondary="decision" meta={["severity"]} />
          </article>

          <article className="panel" id="evidence">
            <div className="panelHead">
              <div>
                <p className="eyebrow">{t.evidenceStore}</p>
                <h2>{t.hashedProofs}</h2>
              </div>
            </div>
            <RichList items={missionEvidence.length ? missionEvidence : overview.evidence} primary="title" secondary="type" meta={["hash", "createdBy"]} />
          </article>

          <article className="panel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">{t.evaluationEngine}</p>
                <h2>{t.recentScores}</h2>
              </div>
            </div>
            <RichList items={overview.evaluations} primary="decision" secondary="missionId" meta={["id"]} />
          </article>
        </section>

        <section className="grid two">
          <article className="panel" id="audit">
            <div className="panelHead">
              <div>
                <p className="eyebrow">{t.appendOnlyAudit}</p>
                <h2>Hash chain events</h2>
              </div>
              <TerminalSquare size={20} />
            </div>
            <RichList items={missionAudit.length ? missionAudit : overview.audit} primary="eventType" secondary="policyDecision" meta={["actorId", "eventHash"]} />
          </article>

          <article className="panel" id="memory">
            <div className="panelHead">
              <div>
                <p className="eyebrow">{t.memoryEngine}</p>
                <h2>{t.controlledLearning}</h2>
              </div>
              <MemoryStick size={20} />
            </div>
            <RichList items={overview.memory} primary="content" secondary="type" meta={["confidence", "source"]} />
          </article>
        </section>
      </section>
    </main>
  );

  function createMission() {
    return api(`/v1/projects/${overview.project?.id}/missions`, {
      method: "POST",
      body: JSON.stringify({
        title: "Auditer un changement gouverne",
        intent: "Verifier qu'une action agentique produit policy, approval, evidence et audit.",
        scope: { include: ["apps/**", ".agentops/**"], exclude: [".env*", "secrets/**"] },
        constraints: { no_raw_secrets: true },
        success_criteria: ["Policy evaluated", "Evidence attached", "Audit event stored"],
        risk_level: "medium",
        autonomy_level: 4
      })
    });
  }

  function approveMission() {
    return api(`/v1/missions/${mission?.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        approver: "technical-owner@example.com",
        role: "technical_owner",
        decision: "approved",
        scope: ["execution"],
        reason: "Scope limite, policies visibles, evidence requise."
      })
    });
  }

  function runAgent() {
    return api(`/v1/missions/${mission?.id}/agents/run`, {
      method: "POST",
      body: JSON.stringify({
        role: agentRole,
        provider_id: providerId,
        requested_by: "human.operator",
        context: { source: "web_cockpit" }
      })
    });
  }

  function queueTests() {
    return api(`/v1/missions/${mission?.id}/execute`, {
      method: "POST",
      body: JSON.stringify({ command: "npm run test", agent_id: "agent.tester" })
    });
  }

  function attachManualEvidence() {
    return api("/v1/evidence", {
      method: "POST",
      body: JSON.stringify({
        mission_id: mission?.id,
        type: "report",
        title: "Manual cockpit evidence",
        content: "Mission reviewed in AgentOps cockpit with visible policy, approval and audit state.",
        metadata: { source: "web_cockpit" },
        created_by: "human.operator"
      })
    });
  }

  function proposePatch() {
    return api(`/v1/missions/${mission?.id}/patches/propose`, {
      method: "POST",
      body: JSON.stringify({
        title: "Cockpit placeholder patch",
        summary: "Demonstrate patch-first proposal without direct filesystem mutation.",
        files: [{ path: "apps/web/src/App.tsx", change_type: "modify" }],
        unified_diff: [
          "diff --git a/apps/web/src/App.tsx b/apps/web/src/App.tsx",
          "--- a/apps/web/src/App.tsx",
          "+++ b/apps/web/src/App.tsx",
          "@@",
          "+// Patch proposal generated from cockpit"
        ].join("\n"),
        risk_level: "medium",
        generated_by: "agent.coder",
        agent_role: "coder"
      })
    });
  }

  function approveLatestPatch() {
    return api(`/v1/missions/${mission?.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        approver: "technical-owner@example.com",
        role: "technical_owner",
        decision: "approved",
        scope: [`patch:${latestPatch?.id}`, "patch_apply"],
        reason: "Patch proposal inspected in cockpit."
      })
    });
  }

  async function checkPolicy() {
    const result = await api<Row>(
      `/v1/policies/evaluate?type=file_write&path=${encodeURIComponent(policyPath)}&agent_role=coder&autonomy_level=4&risk_level=medium`
    );
    setPolicyResult(result);
  }

  function submitOperatorToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = tokenInput.trim();
    if (!token) return;
    saveOperatorToken(token);
    setOperatorTokenState(token);
    setTokenInput("");
    setAuthRequired(false);
    void refresh();
  }

  function clearOperatorToken() {
    saveOperatorToken("");
    setOperatorTokenState("");
    setAuthRequired(true);
    setStatus("Operator locked");
  }
}

function Metric(props: { icon: ReactElement; label: string; value: string | number; detail: string }) {
  return (
    <article className="metric">
      <div className="metricIcon">{props.icon}</div>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <em>{props.detail}</em>
    </article>
  );
}

function Mini(props: { label: string; value: string | number }) {
  return (
    <div className="mini">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function Badge(props: { value: string }) {
  const value = String(props.value ?? "unknown");
  return <em className={`badge ${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{value}</em>;
}

function RichList(props: { items: Row[]; primary: string; secondary: string; meta?: string[] }) {
  if (!props.items?.length) return <p className="muted">No items.</p>;
  return (
    <div className="list">
      {props.items.slice(0, 9).map((item, index) => (
        <div className="row rich" key={item.id ?? index}>
          <div>
            <strong title={String(item[props.primary] ?? item.name ?? item.id ?? "item")}>
              {String(item[props.primary] ?? item.name ?? item.id ?? "item")}
            </strong>
            <div className="rowMeta">
              {(props.meta ?? []).map((key) => (
                <span key={key}>{key}: {formatValue(item[key])}</span>
              ))}
            </div>
          </div>
          <Badge value={String(item[props.secondary] ?? item.status ?? "")} />
        </div>
      ))}
    </div>
  );
}

function formatValue(value: unknown) {
  if (value == null || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
