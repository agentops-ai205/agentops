import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Code2,
  FileCheck2,
  FileDiff,
  Gauge,
  Hammer,
  History,
  Home,
  KeyRound,
  ListChecks,
  Mic,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  UserCircle2,
  Wrench,
  X
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { API_URL, ApiClientError, api, getOperatorToken, saveOperatorToken } from "./api";

type Row = Record<string, unknown>;
type WorkMode = "agent" | "terminal" | "patch" | "evidence";

interface IdeEntry {
  name: string;
  path: string;
  type: "directory" | "file";
}

interface IdeFileResponse {
  path: string;
  bytes: number;
  language: string;
  content: string;
}

interface IdeTerminalResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}

interface Overview {
  organization?: Row;
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

interface LiveStatus {
  ok: boolean;
  service: string;
  environment: string;
}

interface HealthStatus {
  ok: boolean;
  service: string;
  environment: string;
  database: string;
  checks: {
    database: boolean;
    rust_core: boolean;
    default_organization: boolean;
    policy_engine: string;
    sandbox_engine: string;
  };
}

interface MissionView {
  id: string;
  title: string;
  intent: string;
  status: string;
  riskLevel: string;
  autonomyLevel: number;
  createdAt?: string;
  projectId?: string;
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

const previewMissions: MissionView[] = [
  {
    id: "AOS-RUN-001",
    title: "Revenue analytics refactor",
    intent:
      "Refactor the analytics surface, propose a safe patch, run sandbox checks, capture evidence and prepare approval.",
    status: "IN_PROGRESS",
    riskLevel: "medium",
    autonomyLevel: 4,
    createdAt: "2026-06-04T10:42:00.000Z",
    projectId: "com.agentops.os"
  },
  {
    id: "AOS-RUN-002",
    title: "Auth security review",
    intent:
      "Inspect authentication changes, detect risk, and require human approval before execution.",
    status: "WAITING_APPROVAL",
    riskLevel: "high",
    autonomyLevel: 3,
    createdAt: "2026-06-04T09:20:00.000Z",
    projectId: "com.agentops.os"
  },
  {
    id: "AOS-RUN-003",
    title: "Database migration gate",
    intent:
      "Validate migration scope, verify rollback evidence, and prepare release owner review.",
    status: "APPROVED",
    riskLevel: "medium",
    autonomyLevel: 2,
    createdAt: "2026-06-03T15:10:00.000Z",
    projectId: "com.agentops.os"
  }
];

const previewEvidence = [
  { title: "Policy scan", type: "review", hash: "a42f7e819d9a0031", createdAt: "2026-06-04T10:45:00.000Z" },
  { title: "Sandbox test result", type: "test_result", hash: "c5916fb21108e12c", createdAt: "2026-06-04T10:46:00.000Z" },
  { title: "Patch proposal", type: "patch", hash: "9e21cf76853cfab0", createdAt: "2026-06-04T10:47:00.000Z" }
];

const previewJobs = [
  { id: "job_001", type: "agent.run", status: "succeeded", createdAt: "2026-06-04T10:42:00.000Z" },
  { id: "job_002", type: "tool.run_command", status: "running", createdAt: "2026-06-04T10:44:00.000Z" },
  { id: "job_003", type: "evaluation.run", status: "queued", createdAt: "2026-06-04T10:45:00.000Z" },
  { id: "job_004", type: "patch.apply_guarded", status: "queued", createdAt: "2026-06-04T10:47:00.000Z" }
];

const previewPatch = {
  id: "patch_001",
  title: "Mission service hardening",
  summary: "Policy-gated patch proposal for the AgentOps mission workflow.",
  status: "waiting_approval",
  riskLevel: "medium",
  policyDecision: "require_review",
  unifiedDiff: `diff --git a/apps/api/src/services/missionService.ts b/apps/api/src/services/missionService.ts
@@
-  return transitionMission(mission, "CLOSED", { closedAt: new Date() });
+  await assertEvidenceAndEvaluation(mission.id);
+  return transitionMission(mission, "CLOSED", { closedAt: new Date() });
@@
+  audit: "hash-chain captured",
+  approval: "technical_owner required"`
};

const navItems = [
  { label: "Dashboard", icon: <Home size={18} /> },
  { label: "Missions", icon: <BriefcaseBusiness size={18} /> },
  { label: "Agents", icon: <Bot size={18} /> },
  { label: "Tools", icon: <Wrench size={18} /> },
  { label: "Policies", icon: <Shield size={18} /> },
  { label: "Evidence", icon: <FileCheck2 size={18} /> },
  { label: "Audit", icon: <History size={18} /> },
  { label: "Reports", icon: <Gauge size={18} /> }
];

const workspaceTabs = ["Mission Cockpit", "Desktop IDE", "Agent Runner", "Patch Review", "Sandbox", "Audit Ledger"];

export default function App() {
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [tools, setTools] = useState<Row[]>([]);
  const [providers, setProviders] = useState<Row[]>([]);
  const [status, setStatus] = useState("Connecting API...");
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState("");
  const [selectedMissionId, setSelectedMissionId] = useState(previewMissions[0].id);
  const [missionSearch, setMissionSearch] = useState("");
  const [operatorToken, setOperatorTokenState] = useState(() => getOperatorToken());
  const [tokenInput, setTokenInput] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newMissionOpen, setNewMissionOpen] = useState(false);
  const [missionIntent, setMissionIntent] = useState("");
  const [newMissionTitle, setNewMissionTitle] = useState("");
  const [newMissionBody, setNewMissionBody] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode>("agent");
  const [agentRole, setAgentRole] = useState("coder");
  const [agentInstruction, setAgentInstruction] = useState(
    "Inspect the current mission and return a patch-first next step with evidence requirements."
  );
  const [commandInput, setCommandInput] = useState("npm run test");
  const [patchTitle, setPatchTitle] = useState("Mission cockpit production polish");
  const [patchPath, setPatchPath] = useState("apps/web/src/App.tsx");
  const [patchDiff, setPatchDiff] = useState(previewPatch.unifiedDiff);
  const [evidenceTitle, setEvidenceTitle] = useState("Operator validation note");
  const [evidenceContent, setEvidenceContent] = useState(
    "UI, mission workflow, patch review, sandbox jobs and audit evidence reviewed before deployment."
  );
  const [controlMessage, setControlMessage] = useState("Control plane ready. Actions are governed by policy.");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState(workspaceTabs[0]);
  const [ideEntries, setIdeEntries] = useState<IdeEntry[]>([]);
  const [ideDirectory, setIdeDirectory] = useState("");
  const [activeFilePath, setActiveFilePath] = useState("apps/web/src/App.tsx");
  const [activeFileContent, setActiveFileContent] = useState("");
  const [activeFileLanguage, setActiveFileLanguage] = useState("typescript");
  const [ideCommand, setIdeCommand] = useState("npm test");
  const [ideOutput, setIdeOutput] = useState("Local IDE runtime is waiting for the API connection.");
  const [ideMessage, setIdeMessage] = useState("Desktop IDE runtime pending.");

  async function refresh() {
    const [liveData, healthData] = await Promise.all([
      api<LiveStatus>("/live").catch(() => null),
      api<HealthStatus>("/health").catch(() => null)
    ]);
    setLiveStatus(liveData);
    setHealthStatus(healthData);
    setLastCheckedAt(new Date().toISOString());

    try {
      const [overviewData, toolData, providerData] = await Promise.all([
        api<Overview>("/v1/overview"),
        api<Row[]>("/v1/tools").catch(() => []),
        api<Row[]>("/v1/model-providers").catch(() => [])
      ]);
      setOverview({ ...emptyOverview, ...overviewData });
      setTools(toolData);
      setProviders(providerData);
      setStatus(`Live API: ${API_URL}`);
      setAuthRequired(false);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        saveOperatorToken("");
        setOperatorTokenState("");
        setAuthRequired(true);
        setStatus(healthData?.ok ? "Operator token required" : "Preview mode - backend pending");
        return;
      }
      setStatus("Preview mode - backend pending");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const liveReady = status.startsWith("Live API");
  const apiReachable = Boolean(liveStatus?.ok);
  const databaseReady = healthStatus?.checks.database === true;
  const operatorUnlocked = liveReady && Boolean(operatorToken);
  const policyEngine = healthStatus?.checks.policy_engine || "unknown";
  const sandboxEngine = healthStatus?.checks.sandbox_engine || "unknown";
  const desktopIdeActive = activeWorkspaceTab === "Desktop IDE";
  const missions = overview.missions.length ? overview.missions.map(toMissionView) : previewMissions;
  const filteredMissions = useMemo(() => {
    const query = missionSearch.trim().toLowerCase();
    if (!query) return missions;
    return missions.filter((mission) =>
      [mission.id, mission.title, mission.intent, mission.status, mission.riskLevel]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [missionSearch, missions]);

  const activeMission = useMemo(
    () => missions.find((mission) => mission.id === selectedMissionId) ?? missions[0] ?? previewMissions[0],
    [missions, selectedMissionId]
  );

  const projectId = asText(overview.project?.id) || activeMission.projectId;
  const missionJobs = liveReady
    ? overview.jobs.filter((job) => asText(job.missionId) === activeMission.id)
    : previewJobs;
  const missionEvidence = liveReady
    ? overview.evidence.filter((item) => asText(item.missionId) === activeMission.id)
    : previewEvidence;
  const missionApprovals = liveReady
    ? overview.approvals.filter((item) => asText(item.missionId) === activeMission.id)
    : [];
  const missionAudit = liveReady
    ? overview.audit.filter((item) => asText(item.missionId) === activeMission.id)
    : [];
  const missionPatches = liveReady
    ? overview.patches.filter((item) => asText(item.missionId) === activeMission.id)
    : [previewPatch];
  const selectedPatch = missionPatches[0] ?? previewPatch;
  const policies = overview.policies.length ? overview.policies : previewPolicyRows();
  const blockers = policies.filter((policy) => asText(policy.decision) === "deny").length;
  const pendingApprovals = overview.missions.filter((mission) => asText(mission.status) === "WAITING_APPROVAL").length;
  const succeededJobs = overview.jobs.filter((job) => asText(job.status) === "succeeded").length;
  const throughput = overview.jobs.length ? Math.round((succeededJobs / overview.jobs.length) * 100) : 92;
  const riskScore = riskScoreFor(activeMission.riskLevel, blockers);

  useEffect(() => {
    if (liveReady) {
      void refreshIde("");
      void openIdeFile(activeFilePath);
    }
  }, [liveReady]);

  async function runControlAction(action: () => Promise<unknown>, success: string) {
    if (!liveReady) {
      setControlMessage("Backend is not connected. Preview mode keeps governed actions locked.");
      return;
    }

    setBusy(true);
    setControlMessage("Running governed action...");
    try {
      await action();
      setControlMessage(success);
      await refresh();
    } catch (error) {
      setControlMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  function planMission() {
    void runControlAction(
      () => api(`/v1/missions/${activeMission.id}/plan`, { method: "POST" }),
      "Mission plan generated and audit record captured."
    );
  }

  function runAgent() {
    void runControlAction(
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
              interface: "agentops_v3_cockpit"
            }
          })
        }),
      `${agentRole} agent job queued under policy control.`
    );
  }

  function queueCommand() {
    void runControlAction(
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
    void runControlAction(
      () => api(`/v1/missions/${activeMission.id}/evaluate`, { method: "POST" }),
      "Mission evaluation job queued."
    );
  }

  function approveMission(decision: "approved" | "rejected", reason: string, scope: string[]) {
    void runControlAction(
      () =>
        api(`/v1/missions/${activeMission.id}/approve`, {
          method: "POST",
          body: JSON.stringify({
            approver: "human.operator",
            role: "technical_owner",
            decision,
            scope,
            reason
          })
        }),
      decision === "approved" ? "Human approval recorded." : "Human rejection recorded."
    );
  }

  function proposePatch() {
    void runControlAction(
      () =>
        api(`/v1/missions/${activeMission.id}/patches/propose`, {
          method: "POST",
          body: JSON.stringify({
            title: patchTitle,
            summary: `Cockpit proposal for ${patchPath}`,
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

  function applyPatchGuarded() {
    const patchId = asText(selectedPatch.id);
    if (!patchId) return;
    void runControlAction(
      () =>
        api(`/v1/patches/${patchId}/apply`, {
          method: "POST",
          body: JSON.stringify({
            actor_id: "human.operator",
            role: "technical_owner",
            agent_role: "reviewer",
            reason: "Guarded patch application requested from AgentOps cockpit."
          })
        }),
      "Patch marked ready for guarded application."
    );
  }

  function attachEvidence() {
    void runControlAction(
      () =>
        api("/v1/evidence", {
          method: "POST",
          body: JSON.stringify({
            mission_id: activeMission.id,
            type: "report",
            title: evidenceTitle,
            content: evidenceContent,
            metadata: { source: "agentops_v3_cockpit" },
            created_by: "human.operator"
          })
        }),
      "Evidence attached and hashed."
    );
  }

  function bootstrapControlPlane() {
    void runControlAction(
      () => api("/v1/bootstrap", { method: "POST" }),
      "Bootstrap completed and production seed data verified."
    );
  }

  function clearOperatorToken() {
    saveOperatorToken("");
    setOperatorTokenState("");
    setAuthRequired(true);
    setStatus(apiReachable ? "Operator token required" : "Preview mode - backend pending");
  }

  async function refreshIde(directory = ideDirectory) {
    if (!liveReady) {
      setIdeMessage("Connect the local API before using the desktop IDE runtime.");
      return;
    }
    try {
      const data = await api<{ entries: IdeEntry[]; path: string }>(
        `/v1/ide/files?path=${encodeURIComponent(directory)}`
      );
      setIdeEntries(data.entries);
      setIdeDirectory(data.path);
      setIdeMessage(data.path ? `Browsing ${data.path}` : "Browsing project root");
    } catch (error) {
      setIdeMessage(error instanceof Error ? error.message : "Unable to load workspace files.");
    }
  }

  async function openIdeFile(path: string) {
    if (!liveReady || !path) return;
    try {
      const file = await api<IdeFileResponse>(`/v1/ide/file?path=${encodeURIComponent(path)}`);
      setActiveFilePath(file.path);
      setActiveFileLanguage(file.language);
      setActiveFileContent(file.content);
      setIdeMessage(`Opened ${file.path} (${file.bytes} bytes)`);
    } catch (error) {
      setIdeMessage(error instanceof Error ? error.message : "Unable to open file.");
    }
  }

  async function saveIdeFile() {
    if (!liveReady || !activeFilePath) return;
    setBusy(true);
    try {
      await api("/v1/ide/file", {
        method: "PUT",
        body: JSON.stringify({
          path: activeFilePath,
          content: activeFileContent,
          mission_id: activeMission.id,
          actor_id: "human.operator"
        })
      });
      setIdeMessage(`Saved ${activeFilePath} and attached evidence.`);
      await refresh();
    } catch (error) {
      setIdeMessage(error instanceof Error ? error.message : "Unable to save file.");
    } finally {
      setBusy(false);
    }
  }

  async function runIdeCommand() {
    if (!liveReady || !ideCommand.trim()) return;
    setBusy(true);
    setIdeOutput(`$ ${ideCommand}\nRunning...`);
    try {
      const result = await api<IdeTerminalResult>("/v1/ide/terminal/run", {
        method: "POST",
        body: JSON.stringify({
          command: ideCommand,
          cwd: "",
          mission_id: activeMission.id,
          actor_id: "human.operator"
        })
      });
      setIdeOutput(formatTerminalResult(result));
      setIdeMessage(result.exitCode === 0 ? "Command completed and evidence captured." : "Command failed and evidence captured.");
      await refresh();
    } catch (error) {
      setIdeOutput(error instanceof Error ? error.message : "Command failed.");
      setIdeMessage("Terminal execution failed.");
    } finally {
      setBusy(false);
    }
  }

  async function applyIdePatch() {
    if (!liveReady || !patchDiff.trim()) return;
    setBusy(true);
    try {
      const result = await api<{ applied: boolean; stdout: string; stderr: string; exitCode: number | null }>(
        "/v1/ide/patch/apply",
        {
          method: "POST",
          body: JSON.stringify({
            unified_diff: patchDiff,
            mission_id: activeMission.id,
            actor_id: "human.operator",
            confirmed: true
          })
        }
      );
      setIdeOutput(`${result.applied ? "Patch applied" : "Patch failed"}\n${result.stdout}\n${result.stderr}`.trim());
      setIdeMessage(result.applied ? "Patch applied locally and evidence captured." : "Patch apply failed; evidence captured.");
      await refresh();
      if (activeFilePath) await openIdeFile(activeFilePath);
    } catch (error) {
      setIdeMessage(error instanceof Error ? error.message : "Unable to apply patch.");
    } finally {
      setBusy(false);
    }
  }

  async function createMission(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const title = (newMissionTitle || titleFromIntent(missionIntent)).trim();
    const intent = (newMissionBody || missionIntent).trim();

    if (!liveReady || !projectId) {
      setControlMessage("Connect the backend before creating a mission.");
      return;
    }
    if (!title || !intent) {
      setControlMessage("Mission title and intent are required.");
      return;
    }

    setBusy(true);
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
      setSelectedMissionId(asText(mission.id));
      setMissionIntent("");
      setNewMissionTitle("");
      setNewMissionBody("");
      setNewMissionOpen(false);
      setControlMessage("Mission created in the control plane.");
      await refresh();
    } catch (error) {
      setControlMessage(error instanceof Error ? error.message : "Mission creation failed.");
    } finally {
      setBusy(false);
    }
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

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brandMark">A</div>
          <button className="brandButton" type="button">
            <strong>AgentOps</strong>
            <ChevronDown size={15} />
          </button>
        </div>

        <button className="newMissionButton" type="button" onClick={() => setNewMissionOpen(true)}>
          <Plus size={18} />
          New Mission
        </button>

        <nav className="mainNav" aria-label="Main navigation">
          {navItems.map((item, index) => (
            <button className={index === 0 ? "active" : ""} key={item.label} type="button">
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <section className="sideSection">
          <span>Reports</span>
          {["Revenue Analytics", "Auth Security Review", "Database Migration", "Release Gate"].map((item) => (
            <button key={item} type="button">
              <CircleDot size={15} />
              {item}
            </button>
          ))}
        </section>

        <div className="workspaceUser">
          <UserCircle2 size={34} />
          <div>
            <strong>Alex Morgan</strong>
            <span>{liveReady ? "Operator online" : "Preview workspace"}</span>
          </div>
        </div>
      </aside>

      <section className="mainSurface">
        <header className="topbar">
          <div className="workspaceTabs">
            {workspaceTabs.map((tab) => (
              <button
                className={activeWorkspaceTab === tab ? "active" : ""}
                key={tab}
                type="button"
                onClick={() => setActiveWorkspaceTab(tab)}
              >
                {tabIcon(tab)}
                {tab}
              </button>
            ))}
          </div>
          <div className="systemStatus">
            <span className={liveReady ? "statusDot live" : "statusDot"} />
            <strong>{liveReady ? "All systems governed" : "Preview mode"}</strong>
            <button title="Refresh" type="button" onClick={() => void refresh()}>
              <Activity size={17} />
            </button>
            <div className="operatorAvatar">AM</div>
          </div>
        </header>

        {authRequired && !operatorToken && (
          <form className="authStrip" onSubmit={submitOperatorToken}>
            <KeyRound size={18} />
            <input
              autoFocus
              placeholder="Operator token"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
            />
            <button disabled={!tokenInput.trim()} type="submit">
              Unlock
            </button>
          </form>
        )}

        <section className="productionStrip" aria-label="Production control">
          <ProductionStat
            icon={<Activity size={17} />}
            label="API"
            tone={apiReachable ? "green" : "amber"}
            value={apiReachable ? healthStatus?.environment || liveStatus?.environment || "live" : "offline"}
          />
          <ProductionStat
            icon={<BadgeCheck size={17} />}
            label="Database"
            tone={databaseReady ? "green" : "amber"}
            value={databaseReady ? healthStatus?.database || "postgresql" : "pending"}
          />
          <ProductionStat
            icon={<KeyRound size={17} />}
            label="Operator"
            tone={operatorUnlocked ? "green" : "amber"}
            value={operatorUnlocked ? "unlocked" : authRequired ? "locked" : "checking"}
          />
          <ProductionStat
            icon={<ShieldCheck size={17} />}
            label="Engines"
            tone={healthStatus?.ok ? "green" : "amber"}
            value={`${policyEngine} / ${sandboxEngine}`}
          />
          <ProductionStat
            icon={<Clock3 size={17} />}
            label="Last check"
            tone={apiReachable ? "green" : "amber"}
            value={formatDateTime(lastCheckedAt)}
          />
          <div className="productionActions">
            <button disabled={busy} title="Refresh status" type="button" onClick={() => void refresh()}>
              <Activity size={16} />
              Check
            </button>
            <button disabled={busy || !operatorUnlocked} title="Bootstrap control plane" type="button" onClick={bootstrapControlPlane}>
              <BadgeCheck size={16} />
              Bootstrap
            </button>
            {operatorToken && (
              <button title="Lock operator session" type="button" onClick={clearOperatorToken}>
                <KeyRound size={16} />
                Lock
              </button>
            )}
          </div>
        </section>

        <section className={desktopIdeActive ? "cockpitGrid hiddenSurface" : "cockpitGrid"}>
          <section className="missionPanel">
            <div className="panelHeader">
              <div>
                <span>Mission cockpit</span>
                <h1>Good morning, Alex</h1>
                <p>What should the agents accomplish today?</p>
              </div>
              <Badge value={liveReady ? "API live" : "Preview"} />
            </div>

            <label className="searchBox">
              <Search size={17} />
              <input
                placeholder="Search missions..."
                value={missionSearch}
                onChange={(event) => setMissionSearch(event.target.value)}
              />
            </label>

            <div className="missionList">
              {filteredMissions.slice(0, 5).map((mission) => (
                <button
                  className={mission.id === activeMission.id ? "missionItem active" : "missionItem"}
                  key={mission.id}
                  type="button"
                  onClick={() => setSelectedMissionId(mission.id)}
                >
                  <span>{statusIcon(mission.status)}</span>
                  <div>
                    <strong>{mission.title}</strong>
                    <small>{mission.intent}</small>
                  </div>
                  <Badge value={mission.status} />
                </button>
              ))}
            </div>

            <div className="agentActions">
              <ActionButton icon={<Sparkles size={18} />} title="Architect" detail="Analyze impact" onClick={planMission} />
              <ActionButton icon={<Code2 size={18} />} title="Coder" detail="Propose patch" onClick={() => setWorkMode("patch")} />
              <ActionButton icon={<TerminalSquare size={18} />} title="Tester" detail="Run sandbox" onClick={() => setWorkMode("terminal")} />
              <ActionButton icon={<ShieldCheck size={18} />} title="Security" detail="Review risk" onClick={runEvaluation} />
            </div>

            <form className="missionComposer" onSubmit={createMission}>
              <textarea
                placeholder="Describe mission intent..."
                value={missionIntent}
                onChange={(event) => setMissionIntent(event.target.value)}
              />
              <div>
                <button title="Add context" type="button">
                  <Plus size={18} />
                </button>
                <button title="Tools" type="button">
                  <SlidersHorizontal size={18} />
                </button>
                <button title="Voice note" type="button">
                  <Mic size={18} />
                </button>
                <button className="sendButton" disabled={busy || !missionIntent.trim() || !liveReady} type="submit">
                  <Send size={18} />
                </button>
              </div>
            </form>
          </section>

          <section className="patchPanel">
            <div className="panelHeader compact">
              <div>
                <span>Patch Review</span>
                <h2>{asText(selectedPatch.title) || patchTitle}</h2>
                <p>{asText(selectedPatch.summary) || "Patch-first output before any guarded mutation."}</p>
              </div>
              <Badge value={asText(selectedPatch.policyDecision) || "policy checked"} />
            </div>

            <div className="repoBar">
              <Code2 size={16} />
              <strong>agentops-os / {activeMission.id}</strong>
              <span>{asText(selectedPatch.status) || "proposed"}</span>
            </div>

            <div className="workTabs">
              {(["agent", "terminal", "patch", "evidence"] as WorkMode[]).map((mode) => (
                <button className={workMode === mode ? "active" : ""} key={mode} type="button" onClick={() => setWorkMode(mode)}>
                  {modeIcon(mode)}
                  {modeLabel(mode)}
                </button>
              ))}
            </div>

            <div className="workSurface">
              {workMode === "agent" && (
                <section className="agentRunForm">
                  <div className="fieldGrid">
                    <label>
                      <span>Role</span>
                      <select value={agentRole} onChange={(event) => setAgentRole(event.target.value)}>
                        <option value="planner">planner</option>
                        <option value="architect">architect</option>
                        <option value="coder">coder</option>
                        <option value="tester">tester</option>
                        <option value="security">security</option>
                        <option value="reviewer">reviewer</option>
                        <option value="documenter">documenter</option>
                        <option value="release">release</option>
                      </select>
                    </label>
                    <MetricTile label="Providers" value={providers.length || 4} />
                  </div>
                  <label>
                    <span>Instruction</span>
                    <textarea value={agentInstruction} onChange={(event) => setAgentInstruction(event.target.value)} />
                  </label>
                  <div className="buttonRow">
                    <button disabled={busy || !liveReady} type="button" onClick={planMission}>
                      <ListChecks size={16} />
                      Plan
                    </button>
                    <button disabled={busy || !liveReady} type="button" onClick={runAgent}>
                      <Bot size={16} />
                      Run agent
                    </button>
                    <button disabled={busy || !liveReady} type="button" onClick={runEvaluation}>
                      <BadgeCheck size={16} />
                      Evaluate
                    </button>
                  </div>
                </section>
              )}

              {workMode === "terminal" && (
                <section className="terminalForm">
                  <label>
                    <span>Sandbox command</span>
                    <input value={commandInput} onChange={(event) => setCommandInput(event.target.value)} />
                  </label>
                  <pre>{`$ ${commandInput}
policy: ${liveReady ? "evaluated before enqueue" : "locked in preview"}
sandbox: rust_core
output: evidence hash captured after execution`}</pre>
                  <div className="buttonRow">
                    <button disabled={busy || !liveReady || !commandInput.trim()} type="button" onClick={queueCommand}>
                      <TerminalSquare size={16} />
                      Queue command
                    </button>
                  </div>
                </section>
              )}

              {workMode === "patch" && (
                <section className="patchForm">
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
                    <textarea className="diffInput" value={patchDiff} onChange={(event) => setPatchDiff(event.target.value)} />
                  </label>
                  <div className="buttonRow">
                    <button disabled={busy || !liveReady || !patchTitle.trim() || !patchPath.trim() || !patchDiff.trim()} type="button" onClick={proposePatch}>
                      <FileDiff size={16} />
                      Propose patch
                    </button>
                    <button disabled={busy || !liveReady || !asText(selectedPatch.id)} type="button" onClick={applyPatchGuarded}>
                      <Hammer size={16} />
                      Mark ready
                    </button>
                  </div>
                </section>
              )}

              {workMode === "evidence" && (
                <section className="evidenceForm">
                  <label>
                    <span>Evidence title</span>
                    <input value={evidenceTitle} onChange={(event) => setEvidenceTitle(event.target.value)} />
                  </label>
                  <label>
                    <span>Evidence content</span>
                    <textarea value={evidenceContent} onChange={(event) => setEvidenceContent(event.target.value)} />
                  </label>
                  <div className="buttonRow">
                    <button disabled={busy || !liveReady || !evidenceTitle.trim() || !evidenceContent.trim()} type="button" onClick={attachEvidence}>
                      <FileCheck2 size={16} />
                      Attach evidence
                    </button>
                  </div>
                </section>
              )}
            </div>

            <div className="terminalOutput">
              <span>Control output</span>
              <strong>{controlMessage}</strong>
              <small>{liveReady ? API_URL : "Preview data active"}</small>
            </div>
          </section>

          <section className="dashboardPanel">
            <div className="browserChrome">
              <span />
              <span />
              <span />
              <strong>Operational Dashboard</strong>
              <button type="button">Live</button>
            </div>

            <div className="metricsGrid">
              <MetricTile label="Active Missions" value={overview.missions.length || missions.length} trend="+12%" />
              <MetricTile label="Approval Queue" value={pendingApprovals || missionApprovals.length || 1} trend="human gated" tone="amber" />
              <MetricTile label="Governed Tools" value={tools.length || 6} trend="registered" />
              <MetricTile label="Risk Score" value={`${riskScore}%`} trend={blockers ? "blocked" : "reviewable"} tone={riskScore > 70 ? "amber" : "green"} />
            </div>

            <section className="chartPanel">
              <div>
                <span>Mission throughput</span>
                <strong>{throughput}% succeeded</strong>
              </div>
              <ThroughputChart />
            </section>

            <section className="jobsPanel">
              <div className="sectionHeader">
                <div>
                  <span>Sandbox Jobs</span>
                  <strong>{missionJobs.length} tracked</strong>
                </div>
                <button title="Pause jobs" type="button">
                  <Pause size={16} />
                  Pause
                </button>
              </div>
              <div className="jobList">
                {missionJobs.slice(0, 6).map((job, index) => (
                  <div className="jobRow" key={asText(job.id) || index}>
                    {jobIcon(asText(job.type))}
                    <div>
                      <strong>{asText(job.type) || "agent.run"}</strong>
                      <span>{formatTime(asText(job.createdAt))}</span>
                    </div>
                    <Badge value={asText(job.status) || "queued"} />
                  </div>
                ))}
              </div>
            </section>

            <section className="approvalPanel">
              <div className="sectionHeader">
                <div>
                  <span>Human gate</span>
                  <strong>{activeMission.status}</strong>
                </div>
                <Badge value={`${activeMission.autonomyLevel} autonomy`} />
              </div>
              <div className="approvalActions">
                <button disabled={busy || !liveReady} type="button" onClick={() => approveMission("approved", "Operator approved controlled execution.", ["execution", "patch", "evaluation"])}>
                  <ShieldCheck size={16} />
                  Approve
                </button>
                <button disabled={busy || !liveReady} type="button" onClick={() => approveMission("rejected", "Changes requested before execution.", ["revision_required"])}>
                  <AlertTriangle size={16} />
                  Request changes
                </button>
                <button disabled={busy || !liveReady} type="button" onClick={() => approveMission("rejected", "Mission rejected by human operator.", ["execution", "patch", "deployment"])}>
                  <X size={16} />
                  Reject
                </button>
              </div>
            </section>

            <section className="evidencePanel">
              <div className="sectionHeader">
                <div>
                  <span>Evidence & audit</span>
                  <strong>{missionEvidence.length} evidence records</strong>
                </div>
                <Badge value={`${missionAudit.length || 4} audit`} />
              </div>
              <div className="evidenceList">
                {missionEvidence.slice(0, 4).map((item, index) => (
                  <div className="evidenceRow" key={`${asText(item.title)}-${index}`}>
                    <FileCheck2 size={17} />
                    <div>
                      <strong>{asText(item.title) || "Evidence"}</strong>
                      <span>
                        {asText(item.type) || "report"} - {shortHash(asText(item.hash))}
                      </span>
                    </div>
                    <time>{formatTime(asText(item.createdAt))}</time>
                  </div>
                ))}
              </div>
            </section>
          </section>
        </section>

        {desktopIdeActive && (
          <section className="ideGrid">
            <section className="ideExplorer">
              <div className="sectionHeader">
                <div>
                  <span>Workspace</span>
                  <strong>{ideDirectory || "Project root"}</strong>
                </div>
                <button disabled={!liveReady} title="Refresh files" type="button" onClick={() => void refreshIde()}>
                  <Activity size={16} />
                </button>
              </div>
              {ideDirectory && (
                <button className="fileRow directory" type="button" onClick={() => void refreshIde(parentPath(ideDirectory))}>
                  <BriefcaseBusiness size={16} />
                  ..
                </button>
              )}
              <div className="fileTree">
                {ideEntries.map((entry) => (
                  <button
                    className={`fileRow ${entry.type}`}
                    key={entry.path}
                    type="button"
                    onClick={() => (entry.type === "directory" ? void refreshIde(entry.path) : void openIdeFile(entry.path))}
                  >
                    {entry.type === "directory" ? <BriefcaseBusiness size={16} /> : <FileCheck2 size={16} />}
                    <span>{entry.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="ideEditor">
              <div className="ideEditorHeader">
                <div>
                  <span>Editor</span>
                  <strong>{activeFilePath}</strong>
                  <small>{activeFileLanguage}</small>
                </div>
                <div className="buttonRow">
                  <button disabled={!liveReady || busy || !activeFilePath} type="button" onClick={() => void openIdeFile(activeFilePath)}>
                    <Activity size={16} />
                    Reload
                  </button>
                  <button disabled={!liveReady || busy || !activeFilePath} type="button" onClick={() => void saveIdeFile()}>
                    <FileCheck2 size={16} />
                    Save
                  </button>
                </div>
              </div>
              <textarea
                className="codeEditor"
                spellCheck={false}
                value={activeFileContent}
                onChange={(event) => setActiveFileContent(event.target.value)}
              />
            </section>

            <section className="ideRuntime">
              <div className="terminalCard">
                <div className="sectionHeader">
                  <div>
                    <span>Terminal</span>
                    <strong>Local governed runtime</strong>
                  </div>
                  <Badge value={liveReady ? "API live" : "offline"} />
                </div>
                <label>
                  <span>Command</span>
                  <input value={ideCommand} onChange={(event) => setIdeCommand(event.target.value)} />
                </label>
                <div className="buttonRow">
                  <button disabled={!liveReady || busy || !ideCommand.trim()} type="button" onClick={() => void runIdeCommand()}>
                    <TerminalSquare size={16} />
                    Run
                  </button>
                  <button disabled={!liveReady || busy || !patchDiff.trim()} type="button" onClick={() => void applyIdePatch()}>
                    <Hammer size={16} />
                    Apply patch
                  </button>
                </div>
                <pre>{ideOutput}</pre>
              </div>

              <div className="ideStatus">
                <span>Runtime status</span>
                <strong>{ideMessage}</strong>
                <small>{liveReady ? API_URL : "Local API required for desktop runtime"}</small>
              </div>

              <div className="ideGovernance">
                <div>
                  <ShieldCheck size={17} />
                  <span>Path guard</span>
                  <strong>Project-scoped</strong>
                </div>
                <div>
                  <FileDiff size={17} />
                  <span>Patch mode</span>
                  <strong>Approval-first</strong>
                </div>
                <div>
                  <History size={17} />
                  <span>Evidence</span>
                  <strong>{missionEvidence.length} linked</strong>
                </div>
              </div>
            </section>
          </section>
        )}
      </section>

      {newMissionOpen && (
        <section className="modalBackdrop" role="presentation">
          <form className="missionModal" onSubmit={createMission}>
            <div className="sectionHeader">
              <div>
                <span>New mission</span>
                <strong>Create governed work</strong>
              </div>
              <button type="button" onClick={() => setNewMissionOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <label>
              <span>Title</span>
              <input value={newMissionTitle} onChange={(event) => setNewMissionTitle(event.target.value)} />
            </label>
            <label>
              <span>Intent</span>
              <textarea value={newMissionBody} onChange={(event) => setNewMissionBody(event.target.value)} />
            </label>
            <div className="buttonRow">
              <button type="button" onClick={() => setNewMissionOpen(false)}>
                Cancel
              </button>
              <button disabled={busy || !liveReady || !newMissionTitle.trim() || !newMissionBody.trim()} type="submit">
                Create mission
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

function ActionButton(props: { icon: ReactElement; title: string; detail: string; onClick: () => void }) {
  return (
    <button className="actionCard" type="button" onClick={props.onClick}>
      {props.icon}
      <div>
        <strong>{props.title}</strong>
        <span>{props.detail}</span>
      </div>
      <ArrowUpRight size={15} />
    </button>
  );
}

function Badge(props: { value: string }) {
  return <em className={`badge ${slugClass(props.value)}`}>{displayStatus(props.value)}</em>;
}

function MetricTile(props: { label: string; value: string | number; trend?: string; tone?: "green" | "amber" }) {
  return (
    <div className={`metricTile ${props.tone ?? "green"}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.trend && <em>{props.trend}</em>}
    </div>
  );
}

function ProductionStat(props: { icon: ReactElement; label: string; value: string; tone: "green" | "amber" }) {
  return (
    <div className={`productionStat ${props.tone}`}>
      {props.icon}
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ThroughputChart() {
  const points = "0,94 34,78 68,82 102,62 136,70 170,48 204,54 238,34 272,42 306,24 340,18";
  return (
    <svg className="throughputChart" viewBox="0 0 360 120" aria-hidden="true">
      <path d="M0 100H360M0 72H360M0 44H360M0 16H360" />
      <polyline points={points} />
      <circle cx="238" cy="34" r="4" />
      <circle cx="340" cy="18" r="4" />
    </svg>
  );
}

function toMissionView(row: Row): MissionView {
  return {
    id: asText(row.id),
    title: asText(row.title) || "Untitled mission",
    intent: asText(row.intent) || "No intent recorded.",
    status: asText(row.status) || "DRAFT",
    riskLevel: asText(row.riskLevel) || "medium",
    autonomyLevel: asNumber(row.autonomyLevel, 2),
    createdAt: asText(row.createdAt),
    projectId: asText(row.projectId)
  };
}

function previewPolicyRows(): Row[] {
  return [
    { name: "Patch-first output required", decision: "allow", severity: "info" },
    { name: "Human approval before execution", decision: "require_approval", severity: "medium" },
    { name: "Sandbox required for commands", decision: "require_sandbox", severity: "medium" }
  ];
}

function tabIcon(tab: string) {
  if (tab.includes("Agent")) return <Bot size={16} />;
  if (tab.includes("Patch")) return <FileDiff size={16} />;
  if (tab.includes("Sandbox")) return <TerminalSquare size={16} />;
  if (tab.includes("Audit")) return <History size={16} />;
  return <Sparkles size={16} />;
}

function modeIcon(mode: WorkMode) {
  if (mode === "agent") return <Bot size={16} />;
  if (mode === "terminal") return <TerminalSquare size={16} />;
  if (mode === "patch") return <FileDiff size={16} />;
  return <FileCheck2 size={16} />;
}

function modeLabel(mode: WorkMode) {
  if (mode === "agent") return "Agent";
  if (mode === "terminal") return "Terminal";
  if (mode === "patch") return "Diff";
  return "Evidence";
}

function statusIcon(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("approved") || normalized.includes("closed")) return <Check size={16} />;
  if (normalized.includes("waiting") || normalized.includes("review")) return <Clock3 size={16} />;
  if (normalized.includes("failed") || normalized.includes("risk")) return <AlertTriangle size={16} />;
  return <Play size={16} />;
}

function jobIcon(type: string) {
  if (type.includes("command")) return <TerminalSquare size={18} />;
  if (type.includes("evaluation")) return <BadgeCheck size={18} />;
  if (type.includes("patch")) return <FileDiff size={18} />;
  if (type.includes("tool")) return <Wrench size={18} />;
  return <Bot size={18} />;
}

function parentPath(input: string) {
  const parts = input.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function formatTerminalResult(result: IdeTerminalResult) {
  const header = `$ ${result.command}\nexit: ${result.exitCode ?? "signal"} | ${result.durationMs}ms`;
  const stdout = result.stdout ? `\n\nstdout\n${result.stdout}` : "";
  const stderr = result.stderr ? `\n\nstderr\n${result.stderr}` : "";
  const truncated = result.truncated ? "\n\n[output truncated]" : "";
  return `${header}${stdout}${stderr}${truncated}`.trim();
}

function titleFromIntent(intent: string) {
  const trimmed = intent.trim();
  if (!trimmed) return "";
  return trimmed.length > 58 ? `${trimmed.slice(0, 58)}...` : trimmed;
}

function riskScoreFor(risk: string, blockers: number) {
  const normalized = risk.toLowerCase();
  const base = normalized.includes("critical") ? 92 : normalized.includes("high") ? 76 : normalized.includes("medium") ? 48 : 24;
  return Math.min(99, base + blockers * 12);
}

function displayStatus(value: string) {
  return value.replace(/_/g, " ");
}

function shortHash(value: string) {
  if (!value) return "no hash";
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function formatTime(value: string) {
  if (!value) return "now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDateTime(value: string) {
  if (!value) return "pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "pending";
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function slugClass(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function asText(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
