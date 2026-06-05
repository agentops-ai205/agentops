import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Code2,
  FileCheck2,
  HelpCircle,
  Inbox,
  KeyRound,
  ListChecks,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  TerminalSquare,
  UserCircle2,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { API_URL, ApiClientError, api, getOperatorToken, saveOperatorToken } from "./api";

type Row = Record<string, any>;
type IdeMode = "agent" | "terminal" | "patch" | "evidence";

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

const previewMissions = [
  {
    id: "AOS-RUN-001",
    title: "Prepare production control plane",
    intent: "Ship the AgentOps web app + IDE control plane with policy gates, evidence, audit and a safe deployment path.",
    status: "IN_PROGRESS",
    riskLevel: "Medium",
    autonomyLevel: 4,
    stage: "3 / 7 stages",
    createdAt: "2026-06-04T10:42:00.000Z"
  },
  {
    id: "AOS-RUN-000",
    title: "Upgrade policy engine",
    intent: "Upgrade deterministic policy checks before allowing higher autonomy runs.",
    status: "REVIEW",
    riskLevel: "Medium",
    autonomyLevel: 3,
    stage: "5 / 7 stages",
    createdAt: "2026-06-04T09:30:00.000Z"
  },
  {
    id: "AOS-RUN-099",
    title: "Rotate signing keys",
    intent: "Rotate signing material and capture audit evidence for release security.",
    status: "APPROVED",
    riskLevel: "High",
    autonomyLevel: 2,
    stage: "7 / 7 stages",
    createdAt: "2026-06-03T15:10:00.000Z"
  },
  {
    id: "AOS-RUN-098",
    title: "Sandbox model rollout",
    intent: "Roll out sandboxed provider routing for model evaluation.",
    status: "COMPLETED",
    riskLevel: "Low",
    autonomyLevel: 3,
    stage: "7 / 7 stages",
    createdAt: "2026-06-02T12:00:00.000Z"
  }
];

const stages = [
  { label: "Request", state: "done", time: "May 24 10:42" },
  { label: "Plan", state: "active", time: "In progress" },
  { label: "Policy Check", state: "pending", time: "Pending" },
  { label: "Evidence", state: "pending", time: "Pending" },
  { label: "Approval", state: "pending", time: "Pending" },
  { label: "Execute", state: "pending", time: "Pending" },
  { label: "Deploy", state: "pending", time: "Pending" }
];

const timeline = [
  { step: 1, title: "Read mission context and available surfaces", status: "Completed", owner: "Agent", eta: "May 24, 10:42 AM", active: false },
  { step: 2, title: "Select model/provider without making it authority", status: "In progress", owner: "Agent", eta: "Est. 3m", active: true },
  { step: 3, title: "Evaluate policy before any tool call", status: "Pending", owner: "Agent", eta: "Est. 2m", active: false },
  { step: 4, title: "Prepare patch-first output and evidence", status: "Pending", owner: "Agent", eta: "Est. 4m", active: false },
  { step: 5, title: "Ask human approval before apply or deploy", status: "Pending", owner: "Human", eta: "Est. 2m", active: false },
  { step: 6, title: "Execute and deploy to production", status: "Pending", owner: "Agent", eta: "Est. 8m", active: false }
];

const evidence = [
  { title: "Policy scan", detail: "Passed - 12 checks", time: "10:45 AM" },
  { title: "Context snapshot", detail: "Surfaces captured", time: "10:44 AM" },
  { title: "Plan generated", detail: "v1 - 5 steps", time: "10:43 AM" }
];

const previewPolicies = [
  { name: "No critical policy violations", decision: "allow", severity: "info" },
  { name: "1 medium-severity warning", decision: "require_review", severity: "medium" },
  { name: "All required evidence available", decision: "allow", severity: "info" }
];

export default function App() {
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [status, setStatus] = useState("Connecting API...");
  const [selectedMission, setSelectedMission] = useState(previewMissions[0].id);
  const [operatorToken, setOperatorTokenState] = useState(() => getOperatorToken());
  const [tokenInput, setTokenInput] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missionQuery, setMissionQuery] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [newMissionOpen, setNewMissionOpen] = useState(false);
  const [newMissionTitle, setNewMissionTitle] = useState("");
  const [newMissionIntent, setNewMissionIntent] = useState("");
  const [formError, setFormError] = useState("");
  const [activityFilter, setActivityFilter] = useState<"latest" | "all">("latest");
  const [ideMode, setIdeMode] = useState<IdeMode>("agent");
  const [agentRole, setAgentRole] = useState("coder");
  const [agentInstruction, setAgentInstruction] = useState(
    "Inspect the mission, produce the next safe patch-first step, and record the evidence needed before execution."
  );
  const [commandInput, setCommandInput] = useState("npm test -- --run");
  const [patchTitle, setPatchTitle] = useState("Production control plane hardening");
  const [patchPath, setPatchPath] = useState("apps/web/src/App.tsx");
  const [patchDiff, setPatchDiff] = useState(
    "diff --git a/apps/web/src/App.tsx b/apps/web/src/App.tsx\n--- a/apps/web/src/App.tsx\n+++ b/apps/web/src/App.tsx\n@@\n- preview-only action\n+ governed action"
  );
  const [evidenceTitle, setEvidenceTitle] = useState("Manual verification note");
  const [evidenceContent, setEvidenceContent] = useState("Desktop and mobile UI verified before production deploy.");
  const [ideMessage, setIdeMessage] = useState("IDE control is ready. Mutations unlock when the backend is live.");

  async function refresh() {
    try {
      const data = await api<Overview>("/v1/overview");
      setOverview({ ...emptyOverview, ...data });
      setStatus(`Live API: ${API_URL}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        saveOperatorToken("");
        setOperatorTokenState("");
        setAuthRequired(true);
      }
      setStatus("Preview mode - backend pending");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const missions = overview.missions.length
    ? overview.missions.map((mission) => ({
        id: mission.id,
        title: mission.title,
        intent: mission.intent,
        status: mission.status,
        riskLevel: mission.riskLevel ?? "Medium",
        autonomyLevel: mission.autonomyLevel ?? 4,
        stage: stageProgress(mission.status),
        createdAt: mission.createdAt
      }))
    : previewMissions;

  const activeMission = useMemo(
    () => missions.find((mission) => mission.id === selectedMission) ?? missions[0],
    [missions, selectedMission]
  );
  const filteredMissions = useMemo(() => {
    const query = missionQuery.trim().toLowerCase();
    if (!query) return missions;
    return missions.filter((mission) =>
      [mission.title, mission.id, mission.status, mission.riskLevel]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [missionQuery, missions]);

  const liveReady = status.startsWith("Live API");
  const projectId = typeof overview.project?.id === "string" ? overview.project.id : undefined;
  const canApprove = liveReady && activeMission.status !== "COMPLETED";
  const activeJobs = overview.jobs.filter((job) => job.missionId === activeMission.id);
  const activeEvidence = overview.evidence.filter((item) => item.missionId === activeMission.id);
  const activeApprovals = overview.approvals.filter((item) => item.missionId === activeMission.id);
  const activeAudit = overview.audit.filter((item) => item.missionId === activeMission.id);
  const activePatches = overview.patches.filter((item) => item.missionId === activeMission.id);
  const visibleEvidence = liveReady
    ? activeEvidence.map((item) => ({
        title: item.title,
        detail: `${item.type} - ${shortHash(item.hash)}`,
        time: formatTime(item.createdAt)
      }))
    : evidence;
  const visiblePolicies = overview.policies.length ? overview.policies : previewPolicies;
  const blockers = visiblePolicies.filter((item) => item.decision === "deny").length;
  const requiredApproval = activeMission.status === "WAITING_APPROVAL" || activeMission.status === "IN_PROGRESS";

  async function approveRun() {
    if (!canApprove) return;
    setBusy(true);
    try {
      await api(`/v1/missions/${activeMission.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          approver: "human.operator",
          role: "technical_owner",
          decision: "approved",
          scope: ["execution", "deploy"],
          reason: "Decision center approval after policy and evidence review."
        })
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function decideRun(decision: "approved" | "rejected", reason: string, scope: string[]) {
    if (!canApprove) return;
    setBusy(true);
    try {
      await api(`/v1/missions/${activeMission.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          approver: "human.operator",
          role: "technical_owner",
          decision,
          scope,
          reason
        })
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!liveReady || !projectId) {
      setFormError("Production backend must be connected before creating missions.");
      return;
    }

    const title = newMissionTitle.trim();
    const intent = newMissionIntent.trim();
    if (!title || !intent) {
      setFormError("Title and intent are required.");
      return;
    }

    setBusy(true);
    setFormError("");
    try {
      const mission = await api<Row>(`/v1/projects/${projectId}/missions`, {
        method: "POST",
        body: JSON.stringify({
          title,
          intent,
          success_criteria: ["Policy passes", "Evidence is captured", "Human approval is recorded"],
          risk_level: "medium",
          autonomy_level: 4,
          human_approval: {
            before_execution: true,
            before_merge: true,
            before_policy_change: true
          }
        })
      });
      setSelectedMission(mission.id);
      setNewMissionTitle("");
      setNewMissionIntent("");
      setNewMissionOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runIdeAction(action: () => Promise<unknown>, success: string) {
    if (!liveReady) {
      setIdeMessage("Backend is not connected yet. IDE actions are locked in preview mode.");
      return;
    }

    setBusy(true);
    setIdeMessage("Running governed IDE action...");
    try {
      await action();
      setIdeMessage(success);
      await refresh();
    } catch (error) {
      setIdeMessage(error instanceof Error ? error.message : "IDE action failed.");
    } finally {
      setBusy(false);
    }
  }

  function planRun() {
    void runIdeAction(
      () => api(`/v1/missions/${activeMission.id}/plan`, { method: "POST" }),
      "Mission plan generated and audit evidence recorded."
    );
  }

  function runAgent() {
    void runIdeAction(
      () =>
        api(`/v1/missions/${activeMission.id}/agents/run`, {
          method: "POST",
          body: JSON.stringify({
            role: agentRole,
            requested_by: "human.operator",
            max_tokens: 1200,
            context: {
              instruction: agentInstruction,
              mission_id: activeMission.id,
              surface: "web+ide"
            }
          })
        }),
      `${agentRole} agent queued under policy control.`
    );
  }

  function runCommand() {
    void runIdeAction(
      () =>
        api(`/v1/missions/${activeMission.id}/execute`, {
          method: "POST",
          body: JSON.stringify({
            command: commandInput,
            agent_id: "agent.tester"
          })
        }),
      "Sandbox command queued after policy evaluation."
    );
  }

  function runEvaluation() {
    void runIdeAction(
      () => api(`/v1/missions/${activeMission.id}/evaluate`, { method: "POST" }),
      "Mission evaluation queued."
    );
  }

  function proposePatchFromIde() {
    void runIdeAction(
      () =>
        api(`/v1/missions/${activeMission.id}/patches/propose`, {
          method: "POST",
          body: JSON.stringify({
            title: patchTitle,
            summary: `IDE proposal for ${patchPath}`,
            files: [{ path: patchPath, change_type: "modify" }],
            unified_diff: patchDiff,
            risk_level: "medium",
            generated_by: "agent.coder",
            agent_role: "coder"
          })
        }),
      "Patch proposal created with policy findings and evidence hash."
    );
  }

  function attachEvidenceFromIde() {
    void runIdeAction(
      () =>
        api("/v1/evidence", {
          method: "POST",
          body: JSON.stringify({
            mission_id: activeMission.id,
            type: "report",
            title: evidenceTitle,
            content: evidenceContent,
            metadata: { source: "agentops_ide" },
            created_by: "human.operator"
          })
        }),
      "Evidence attached and hashed."
    );
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">A</div>
          <strong>AgentOps</strong>
        </div>
        <div className="workspaceSwitch" role="status">
          <ClipboardCheck size={17} />
          Platform Ops
        </div>
        <div className="envPill">
          <span>Environment</span>
          <i />
          <strong>Production</strong>
          <ChevronDown size={14} />
        </div>
        <label className="globalSearch">
          <Search size={18} />
          <input
            placeholder="Search missions, evidence, policies..."
            value={missionQuery}
            onChange={(event) => setMissionQuery(event.target.value)}
          />
          <kbd>⌘K</kbd>
        </label>
        <div className="topIcons">
          <span title="Notifications"><Bell size={19} /></span>
          <span title="Inbox" className="withCount"><Inbox size={19} /><i>3</i></span>
          <button title="Help" onClick={() => setDetailsOpen((open) => !open)}><HelpCircle size={19} /></button>
          <UserCircle2 size={34} />
        </div>
      </header>

      <section className="layout">
        <aside className="leftPane">
          <label className="sideSearch">
            <Search size={17} />
            <input
              placeholder="Search missions..."
              value={missionQuery}
              onChange={(event) => setMissionQuery(event.target.value)}
            />
            <kbd>⌘K</kbd>
          </label>

          <div className="paneHead">
            <span>Missions</span>
            {liveReady ? (
              <button onClick={() => setNewMissionOpen((open) => !open)}><Plus size={16} /> New mission</button>
            ) : (
              <small>Preview data</small>
            )}
          </div>

          <div className="missionList">
            {filteredMissions.map((mission) => (
              <button
                key={mission.id}
                className={mission.id === activeMission.id ? "missionCard active" : "missionCard"}
                onClick={() => setSelectedMission(mission.id)}
              >
                <div>
                  <strong>{mission.title}</strong>
                  <span>{mission.id}</span>
                </div>
                <Badge value={mission.status} />
                <p>Risk: {mission.riskLevel} · Autonomy: {mission.autonomyLevel}</p>
                {mission.id === activeMission.id && (
                  <div className="progress">
                    <i />
                    <span>{mission.stage}</span>
                  </div>
                )}
              </button>
            ))}
            {filteredMissions.length === 0 && <p className="emptyState">No mission matches this search.</p>}
          </div>

          <section className="healthCard">
            <span>System health</span>
            <strong><i /> All systems operational</strong>
            <div className="healthGrid">
              <Metric icon={<Zap />} label="Agents" value={overview.agents.length || 46} detail="Online" />
              <Metric icon={<ShieldCheck />} label="Policy" value={overview.policies.length || 128} detail="Active" />
              <Metric icon={<FileCheck2 />} label="Evidence" value={overview.evidence.length || "3.2k"} detail="Stored" />
              <Metric icon={<Clock3 />} label="Runs" value="98%" detail="Success" />
            </div>
          </section>

          <section className="osCard">
            <div className="miniMark">A</div>
            <strong>AgentOps OS</strong>
            <Badge value="production" />
          </section>
        </aside>

        <section className="centerPane">
          {newMissionOpen && (
            <article className="composerCard">
              <CardTitle icon={<Plus size={20} />} title="New mission" />
              <form onSubmit={createMission}>
                <input
                  placeholder="Mission title"
                  value={newMissionTitle}
                  onChange={(event) => setNewMissionTitle(event.target.value)}
                />
                <textarea
                  placeholder="Intent, constraints and expected outcome"
                  value={newMissionIntent}
                  onChange={(event) => setNewMissionIntent(event.target.value)}
                />
                {formError && <p>{formError}</p>}
                <div>
                  <button type="button" onClick={() => setNewMissionOpen(false)}>Cancel</button>
                  <button disabled={busy || !newMissionTitle.trim() || !newMissionIntent.trim()}>
                    Create mission
                  </button>
                </div>
              </form>
            </article>
          )}

          <article className="heroRun">
            <div className="crumb">
              <span>Missions</span>
              <Zap size={13} />
              <strong>{activeMission.id}</strong>
            </div>
            <h1>{activeMission.title}</h1>
            <p>{activeMission.intent}</p>
            <div className="metaLine">
              <span>Requested by <UserCircle2 size={20} /> Alex Morgan</span>
              <span><CalendarDays size={15} /> {formatDate(activeMission.createdAt)}</span>
              <span><Code2 size={15} /> Production</span>
              <button onClick={() => setDetailsOpen((open) => !open)}><ListChecks size={16} /> Mission details</button>
            </div>

            <div className="stageTrack">
              {missionStages(activeMission.status).map((stage, index) => (
                <div className={`stage ${stage.state}`} key={stage.label}>
                  <div>{stage.state === "done" ? <Check size={18} /> : index + 1}</div>
                  <strong>{stage.label}</strong>
                  <span>{stage.time}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="briefCard">
            <div className="iconBox"><FileCheck2 size={22} /></div>
            <div>
              <span>Mission brief</span>
              <p>Plan and prepare for shipping the AgentOps control plane to production with all required policy gates, evidence collection and human approval.</p>
            </div>
            <Badge value="Medium risk" />
          </article>

          {detailsOpen && (
            <article className="detailsCard">
              <CardTitle icon={<ListChecks size={20} />} title="Mission details" />
              <div className="detailsGrid">
                <Mini label="Target domain" value="agentops.ai" />
                <Mini label="Surface" value="Web + IDE" />
                <Mini label="Backend" value={liveReady ? "Connected" : "Pending"} />
                <Mini label="Database" value="Supabase ready" />
              </div>
            </article>
          )}

          <article className="timelineCard">
            <CardTitle title="Plan & timeline" />
            <div className="timeline">
              {(liveReady ? liveTimeline(activeMission, activeJobs, activeEvidence, activeApprovals) : timeline).map((item) => (
                <div className={item.active ? "timelineRow active" : "timelineRow"} key={item.step}>
                  <span>{item.step}</span>
                  <div className="stepDot">{item.status === "Completed" ? <Check size={15} /> : item.step}</div>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.status} · {item.eta}</p>
                  </div>
                  <em>{item.owner}</em>
                  <ActivityWave active={item.active} />
                </div>
              ))}
            </div>
          </article>

          <article className="ideCard">
            <div className="ideHeader">
              <CardTitle icon={<TerminalSquare size={20} />} title="IDE control" />
              <Badge value={liveReady ? "backend live" : "preview locked"} />
            </div>

            <div className="ideToolbar">
              {(["agent", "terminal", "patch", "evidence"] as IdeMode[]).map((mode) => (
                <button
                  className={ideMode === mode ? "modeButton active" : "modeButton"}
                  key={mode}
                  onClick={() => setIdeMode(mode)}
                >
                  {modeLabel(mode)}
                </button>
              ))}
            </div>

            <div className="ideWorkspace">
              <div className="ideEditor">
                {ideMode === "agent" && (
                  <>
                    <div className="fieldGrid">
                      <label>
                        <span>Agent role</span>
                        <select value={agentRole} onChange={(event) => setAgentRole(event.target.value)}>
                          <option value="planner">planner</option>
                          <option value="architect">architect</option>
                          <option value="coder">coder</option>
                          <option value="tester">tester</option>
                          <option value="security">security</option>
                          <option value="reviewer">reviewer</option>
                          <option value="release">release</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      <span>Instruction</span>
                      <textarea value={agentInstruction} onChange={(event) => setAgentInstruction(event.target.value)} />
                    </label>
                    <div className="ideActions">
                      <button disabled={busy || !liveReady} onClick={planRun}><ListChecks size={16} /> Plan</button>
                      <button disabled={busy || !liveReady} onClick={runAgent}><Zap size={16} /> Run agent</button>
                      <button disabled={busy || !liveReady} onClick={runEvaluation}><Activity size={16} /> Evaluate</button>
                    </div>
                  </>
                )}

                {ideMode === "terminal" && (
                  <>
                    <label>
                      <span>Sandbox command</span>
                      <input value={commandInput} onChange={(event) => setCommandInput(event.target.value)} />
                    </label>
                    <pre>{`$ ${commandInput}\npolicy: evaluated before enqueue\nsandbox: rust_core\nstatus: ${liveReady ? "ready to queue" : "locked until API is live"}`}</pre>
                    <div className="ideActions">
                      <button disabled={busy || !liveReady || !commandInput.trim()} onClick={runCommand}>
                        <TerminalSquare size={16} /> Queue command
                      </button>
                    </div>
                  </>
                )}

                {ideMode === "patch" && (
                  <>
                    <div className="fieldGrid">
                      <label>
                        <span>Patch title</span>
                        <input value={patchTitle} onChange={(event) => setPatchTitle(event.target.value)} />
                      </label>
                      <label>
                        <span>File path</span>
                        <input value={patchPath} onChange={(event) => setPatchPath(event.target.value)} />
                      </label>
                    </div>
                    <label>
                      <span>Unified diff</span>
                      <textarea className="codeArea" value={patchDiff} onChange={(event) => setPatchDiff(event.target.value)} />
                    </label>
                    <div className="ideActions">
                      <button disabled={busy || !liveReady || !patchTitle.trim() || !patchPath.trim() || !patchDiff.trim()} onClick={proposePatchFromIde}>
                        <Code2 size={16} /> Propose patch
                      </button>
                    </div>
                  </>
                )}

                {ideMode === "evidence" && (
                  <>
                    <label>
                      <span>Evidence title</span>
                      <input value={evidenceTitle} onChange={(event) => setEvidenceTitle(event.target.value)} />
                    </label>
                    <label>
                      <span>Evidence content</span>
                      <textarea value={evidenceContent} onChange={(event) => setEvidenceContent(event.target.value)} />
                    </label>
                    <div className="ideActions">
                      <button disabled={busy || !liveReady || !evidenceTitle.trim() || !evidenceContent.trim()} onClick={attachEvidenceFromIde}>
                        <FileCheck2 size={16} /> Attach evidence
                      </button>
                    </div>
                  </>
                )}
              </div>

              <aside className="ideConsole">
                <span>Control output</span>
                <strong>{ideMessage}</strong>
                <div>
                  <Mini label="Jobs" value={activeJobs.length} />
                  <Mini label="Patches" value={activePatches.length} />
                  <Mini label="Audit" value={activeAudit.length} />
                  <Mini label="Evidence" value={activeEvidence.length} />
                </div>
              </aside>
            </div>
          </article>

          <article className="activityCard">
            <div className="activityHeader">
              <CardTitle title="Evidence & activity" />
              <button onClick={() => setActivityFilter((filter) => filter === "latest" ? "all" : "latest")}>
                {activityFilter === "latest" ? "View all evidence" : "Show latest"} <ChevronDown size={15} />
              </button>
            </div>
            {(activityFilter === "latest" ? visibleEvidence.slice(0, 2) : visibleEvidence).map((item) => (
              <div className="activityRow" key={item.title}>
                <FileCheck2 size={18} />
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
                <time>{item.time}</time>
                <span className="viewState">Available</span>
              </div>
            ))}
          </article>
        </section>

        <aside className="rightPane">
          {authRequired && !operatorToken && (
            <section className="authGate">
              <KeyRound size={22} />
              <form onSubmit={submitOperatorToken}>
                <input
                  autoFocus
                  placeholder="Operator token"
                  type="password"
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                />
                <button disabled={!tokenInput.trim()}>Unlock</button>
              </form>
            </section>
          )}

          <article className="decisionCard">
            <CardTitle icon={<Shield size={21} />} title="Decision center" />
            <section className="approvalBox">
              <ShieldCheck size={36} />
              <div>
                <strong>Human approval is required</strong>
                <p>Your approval is required to proceed past this stage.</p>
              </div>
              <div className="decisionGrid">
                <Mini label="Risk level" value="Medium" />
                <Mini label="Autonomy" value={`${activeMission.autonomyLevel} / 5`} />
                <Mini label="Jobs" value={liveReady ? activeJobs.length : 3} />
                <Mini label="Key evidence" value={liveReady ? activeEvidence.length : 8} />
                <Mini label="Required approval" value={requiredApproval ? "Yes" : "No"} />
                <Mini label="Blockers" value={blockers ? String(blockers) : "0 Clear"} />
              </div>
            </section>

            <section className="policyFindings">
              <span>Top policy findings</span>
              {visiblePolicies.slice(0, 3).map((policy) => (
                <p key={policy.name}>
                  {policy.decision === "deny" ? <Shield size={15} /> : policy.decision === "allow" ? <Check size={15} /> : <Activity size={15} />}
                  {policy.name}
                </p>
              ))}
              {policyOpen && (
                <div className="policyReport">
                  <Mini label="Mode" value="Patch-first" />
                  <Mini label="Deny findings" value={blockers} />
                  <Mini label="Evidence records" value={liveReady ? activeEvidence.length : 8} />
                  <Mini label="Decision" value={blockers ? "Blocked" : "Reviewable"} />
                </div>
              )}
              <button className="textButton" onClick={() => setPolicyOpen((open) => !open)}>
                {policyOpen ? "Hide policy report" : "View policy report"} →
              </button>
            </section>

            <button className="approveButton" disabled={!canApprove || busy} onClick={approveRun}>
              <ShieldCheck size={22} />
              {liveReady ? "Approve run" : "Connect backend to approve"}
              <span>{liveReady ? "This will allow execution to continue." : "Preview mode keeps actions locked."}</span>
            </button>
            <div className="decisionActions">
              {canApprove ? (
                <>
                  <button onClick={() => decideRun("rejected", "Changes requested before execution.", ["revision_required"])}>Request changes</button>
                  <button className="reject" onClick={() => decideRun("rejected", "Run rejected by human operator.", ["execution", "deploy"])}>Reject run</button>
                </>
              ) : (
                <p className="lockedNote">Decision actions unlock after the production backend is connected.</p>
              )}
            </div>
          </article>

          <article className="policyCard">
            <CardTitle icon={<TerminalSquare size={20} />} title="Policy engine" />
            <div className="policyRow">
              <span>Policy file</span>
              <strong>apps/api/src/index.ts</strong>
              <Badge value="up to date" />
            </div>
            <div className="policyRow">
              <span>Mode</span>
              <strong>Patch-first execution</strong>
            </div>
            <div className="policyRow">
              <span>Sandbox</span>
              <strong>Enabled</strong>
            </div>
            {policyOpen && (
              <section className="policyReport compact">
                <Mini label="Allowed origins" value={liveReady ? "Configured" : "Pending"} />
                <Mini label="Operator auth" value={liveReady ? "Required" : "Preview"} />
                <Mini label="Rust core" value="Policy + sandbox" />
                <Mini label="API status" value={liveReady ? "Live" : "Locked"} />
              </section>
            )}
            <button className="textButton" onClick={() => setPolicyOpen((open) => !open)}>
              {policyOpen ? "Hide details" : "View details"} →
            </button>
          </article>
        </aside>
      </section>
    </main>
  );

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
}

function stageProgress(status: string) {
  const normalized = String(status).toUpperCase();
  if (normalized === "CLOSED" || normalized === "COMPLETED") return "7 / 7 stages";
  if (normalized === "APPROVED") return "5 / 7 stages";
  if (normalized === "WAITING_APPROVAL") return "4 / 7 stages";
  if (normalized === "PLANNED" || normalized === "IN_PROGRESS") return "3 / 7 stages";
  return "2 / 7 stages";
}

function missionStages(status: string) {
  const normalized = String(status).toUpperCase();
  const activeIndex =
    normalized === "CLOSED" || normalized === "COMPLETED" ? 6 :
    normalized === "APPROVED" ? 4 :
    normalized === "WAITING_APPROVAL" ? 4 :
    normalized === "PLANNED" || normalized === "IN_PROGRESS" ? 1 :
    1;
  return stages.map((stage, index) => ({
    ...stage,
    state: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
    time: index < activeIndex ? stage.time : index === activeIndex ? "In progress" : "Pending"
  }));
}

function liveTimeline(
  mission: { status: string; createdAt?: string },
  jobs: Row[],
  evidenceItems: Row[],
  approvals: Row[]
) {
  const createdAt = formatDate(mission.createdAt);
  return [
    { step: 1, title: "Mission accepted by control plane", status: "Completed", owner: "System", eta: createdAt, active: false },
    { step: 2, title: "Plan and policy state evaluated", status: mission.status, owner: "Agent", eta: jobs.length ? `${jobs.length} jobs` : "No jobs yet", active: mission.status === "PLANNED" || mission.status === "IN_PROGRESS" },
    { step: 3, title: "Evidence collected", status: evidenceItems.length ? "Available" : "Pending", owner: "Agent", eta: `${evidenceItems.length} records`, active: false },
    { step: 4, title: "Human decision", status: approvals.length ? "Recorded" : "Waiting", owner: "Human", eta: `${approvals.length} approvals`, active: mission.status === "WAITING_APPROVAL" },
    { step: 5, title: "Execute and deploy", status: mission.status === "APPROVED" ? "Ready" : "Locked", owner: "Agent", eta: "Requires approval", active: false }
  ];
}

function formatDate(value?: string) {
  if (!value) return "June 4, 2026 · 10:42 AM";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "June 4, 2026 · 10:42 AM";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatTime(value?: string) {
  if (!value) return "now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
}

function shortHash(value?: string) {
  if (!value) return "no hash";
  return value.length > 14 ? `${value.slice(0, 10)}...${value.slice(-4)}` : value;
}

function modeLabel(mode: IdeMode) {
  if (mode === "agent") return "Agent";
  if (mode === "terminal") return "Terminal";
  if (mode === "patch") return "Patch";
  return "Evidence";
}

function CardTitle(props: { title: string; icon?: ReactElement }) {
  return (
    <div className="cardTitle">
      {props.icon}
      <strong>{props.title}</strong>
    </div>
  );
}

function Badge(props: { value: string }) {
  return <em className={`badge ${props.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{props.value}</em>;
}

function Mini(props: { label: string; value: string | number }) {
  return (
    <div className="mini">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function Metric(props: { icon: ReactElement; label: string; value: string | number; detail: string }) {
  return (
    <div className="metric">
      {props.icon}
      <strong>{props.value}</strong>
      <span>{props.label}</span>
      <em>{props.detail}</em>
    </div>
  );
}

function ActivityWave(props: { active?: boolean }) {
  return (
    <svg className={props.active ? "wave active" : "wave"} viewBox="0 0 84 20" aria-hidden="true">
      <polyline points="0,10 8,10 12,7 16,13 22,10 30,10 34,4 40,16 46,9 52,11 58,5 64,13 70,8 76,10 84,6" />
    </svg>
  );
}
