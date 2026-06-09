import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  BriefcaseBusiness,
  Check,
  Code2,
  Download,
  FileCheck2,
  FileDiff,
  Globe2,
  History,
  KeyRound,
  Languages,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plus,
  Search,
  Send,
  ShieldCheck,
  TerminalSquare,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { API_URL, ApiClientError, api, getSessionToken, saveSessionToken } from "./api";
import { getDesktopRuntime, hasDesktopRuntime, type DesktopRuntime } from "./desktop";
import { locales, messages, type Locale } from "./i18n";

type Row = Record<string, unknown>;
type View = "home" | "signin" | "signup" | "app";
type AppTab = "missions" | "agents" | "evidence" | "audit" | "desktop";

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
  environment: string;
}

interface HealthStatus {
  ok: boolean;
  database: string;
  checks: {
    database: boolean;
    rust_core: boolean;
    policy_engine: string;
    sandbox_engine: string;
  };
}

interface SessionUser {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  role: string;
  language: Locale;
}

interface SessionPayload {
  token: string;
  user: SessionUser;
  organization?: Row;
  project?: Row;
}

interface MissionView {
  id: string;
  title: string;
  intent: string;
  status: string;
  riskLevel: string;
  autonomyLevel: number;
  createdAt: string;
  projectId: string;
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

const releaseUrl = "https://github.com/agentops-ai205/agentops/releases/latest";

const productCopy = {
  en: {
    start: "Start on web",
    signin: "Sign in",
    signup: "Create account",
    signout: "Sign out",
    download: "Download desktop IDE",
    heroTitle: "AgentOps",
    heroBody:
      "A real operations workspace for governed AI coding: missions, approvals, evidence, audit, and a desktop IDE when local files and terminal access are required.",
    webApp: "Use the web app",
    desktopApp: "Switch to desktop IDE",
    account: "Account",
    organization: "Organization",
    password: "Password",
    email: "Email",
    name: "Name",
    workspaceName: "Workspace name",
    noMissions: "No missions yet. Create the first real mission in your workspace.",
    createMission: "Create mission",
    missionIntent: "Mission intent",
    dashboard: "Dashboard",
    agents: "Agents",
    evidence: "Evidence",
    audit: "Audit",
    desktop: "Desktop IDE",
    liveDatabase: "Live database",
    connected: "Connected",
    notReady: "Not ready",
    newMissionTitle: "Mission title",
    newMissionIntent: "What should the agents accomplish?",
    plan: "Plan",
    runAgent: "Run agent",
    evaluate: "Evaluate",
    approve: "Approve",
    attachEvidence: "Attach evidence",
    realData: "Real workspace data",
    emptyState: "This section is empty because no records exist in the database yet.",
    desktopBody:
      "The web app manages missions and governance. Download the desktop IDE when you need native filesystem, terminal, and patch workflows.",
    status: "Status"
  },
  fr: {
    start: "Demarrer sur le web",
    signin: "Connexion",
    signup: "Creer un compte",
    signout: "Deconnexion",
    download: "Telecharger l'IDE desktop",
    heroTitle: "AgentOps",
    heroBody:
      "Un vrai espace d'operations pour coder avec IA sous gouvernance : missions, validations, preuves, audit, et IDE desktop quand il faut acceder aux fichiers locaux et au terminal.",
    webApp: "Utiliser la web app",
    desktopApp: "Basculer vers l'IDE desktop",
    account: "Compte",
    organization: "Organisation",
    password: "Mot de passe",
    email: "Email",
    name: "Nom",
    workspaceName: "Nom du workspace",
    noMissions: "Aucune mission pour l'instant. Cree la premiere vraie mission du workspace.",
    createMission: "Creer mission",
    missionIntent: "Objectif de mission",
    dashboard: "Tableau de bord",
    agents: "Agents",
    evidence: "Preuves",
    audit: "Audit",
    desktop: "IDE desktop",
    liveDatabase: "Base de donnees live",
    connected: "Connecte",
    notReady: "Pas pret",
    newMissionTitle: "Titre de mission",
    newMissionIntent: "Que doivent accomplir les agents ?",
    plan: "Planifier",
    runAgent: "Lancer agent",
    evaluate: "Evaluer",
    approve: "Approuver",
    attachEvidence: "Ajouter preuve",
    realData: "Donnees reelles du workspace",
    emptyState: "Cette section est vide parce qu'aucun enregistrement n'existe encore en base.",
    desktopBody:
      "La web app gere les missions et la gouvernance. Telecharge l'IDE desktop pour les fichiers locaux, le terminal et les patchs.",
    status: "Statut"
  },
  es: {
    start: "Empezar en web",
    signin: "Iniciar sesion",
    signup: "Crear cuenta",
    signout: "Salir",
    download: "Descargar IDE desktop",
    heroTitle: "AgentOps",
    heroBody:
      "Un espacio real de operaciones para codigo con IA gobernada: misiones, aprobaciones, evidencia, auditoria e IDE desktop para archivos locales y terminal.",
    webApp: "Usar la web app",
    desktopApp: "Cambiar al IDE desktop",
    account: "Cuenta",
    organization: "Organizacion",
    password: "Contrasena",
    email: "Email",
    name: "Nombre",
    workspaceName: "Nombre del workspace",
    noMissions: "Aun no hay misiones. Crea la primera mision real del workspace.",
    createMission: "Crear mision",
    missionIntent: "Objetivo de la mision",
    dashboard: "Panel",
    agents: "Agentes",
    evidence: "Evidencia",
    audit: "Auditoria",
    desktop: "IDE desktop",
    liveDatabase: "Base de datos live",
    connected: "Conectado",
    notReady: "No listo",
    newMissionTitle: "Titulo de mision",
    newMissionIntent: "Que deben lograr los agentes?",
    plan: "Planificar",
    runAgent: "Ejecutar agente",
    evaluate: "Evaluar",
    approve: "Aprobar",
    attachEvidence: "Adjuntar evidencia",
    realData: "Datos reales del workspace",
    emptyState: "Esta seccion esta vacia porque aun no hay registros en la base.",
    desktopBody:
      "La web app gestiona misiones y gobernanza. Descarga el IDE desktop para archivos locales, terminal y patches.",
    status: "Estado"
  },
  zh: {
    start: "使用网页版",
    signin: "登录",
    signup: "创建账户",
    signout: "退出",
    download: "下载桌面 IDE",
    heroTitle: "AgentOps",
    heroBody:
      "真实的 AI 编码治理工作区：任务、审批、证据、审计；需要本地文件和终端时切换到桌面 IDE。",
    webApp: "使用 Web App",
    desktopApp: "切换到桌面 IDE",
    account: "账户",
    organization: "组织",
    password: "密码",
    email: "邮箱",
    name: "姓名",
    workspaceName: "工作区名称",
    noMissions: "还没有任务。创建第一个真实工作区任务。",
    createMission: "创建任务",
    missionIntent: "任务目标",
    dashboard: "仪表盘",
    agents: "代理",
    evidence: "证据",
    audit: "审计",
    desktop: "桌面 IDE",
    liveDatabase: "实时数据库",
    connected: "已连接",
    notReady: "未就绪",
    newMissionTitle: "任务标题",
    newMissionIntent: "代理需要完成什么？",
    plan: "规划",
    runAgent: "运行代理",
    evaluate: "评估",
    approve: "批准",
    attachEvidence: "添加证据",
    realData: "真实工作区数据",
    emptyState: "此区域为空，因为数据库中还没有记录。",
    desktopBody:
      "Web App 管理任务和治理。需要本地文件、终端和补丁工作流时，请下载桌面 IDE。",
    status: "状态"
  }
} satisfies Record<Locale, Record<string, string>>;

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => readLocale());
  const copy = productCopy[locale];
  const baseMessages = messages[locale];
  const [view, setView] = useState<View>(() => (getSessionToken() ? "app" : "home"));
  const [activeTab, setActiveTab] = useState<AppTab>("missions");
  const [session, setSession] = useState<SessionUser | null>(null);
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [tools, setTools] = useState<Row[]>([]);
  const [providers, setProviders] = useState<Row[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [desktopRuntime, setDesktopRuntime] = useState<DesktopRuntime | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [missionSearch, setMissionSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    organization: ""
  });
  const [missionForm, setMissionForm] = useState({ title: "", intent: "" });
  const [evidenceForm, setEvidenceForm] = useState({ title: "", content: "" });

  useEffect(() => {
    try {
      localStorage.setItem("agentops.locale", locale);
    } catch {
      // Local storage can be unavailable in strict browser contexts.
    }
  }, [locale]);

  useEffect(() => {
    void refreshStatus();
    void restoreSession();
    if (!hasDesktopRuntime()) return;
    getDesktopRuntime().then(setDesktopRuntime).catch(() => setDesktopRuntime(null));
  }, []);

  const databaseReady = healthStatus?.checks?.database === true;
  const missions = useMemo(() => overview.missions.map(toMissionView), [overview.missions]);
  const filteredMissions = useMemo(() => {
    const query = missionSearch.trim().toLowerCase();
    if (!query) return missions;
    return missions.filter((mission) =>
      [mission.id, mission.title, mission.intent, mission.status, mission.riskLevel].join(" ").toLowerCase().includes(query)
    );
  }, [missionSearch, missions]);
  const activeMission = missions.find((mission) => mission.id === selectedMissionId) ?? missions[0];
  const projectId = asText(overview.project?.id);
  const activeMissionJobs = activeMission
    ? overview.jobs.filter((job) => asText(job.missionId) === activeMission.id)
    : [];
  const activeMissionEvidence = activeMission
    ? overview.evidence.filter((item) => asText(item.missionId) === activeMission.id)
    : [];
  const activeMissionAudit = activeMission
    ? overview.audit.filter((item) => asText(item.missionId) === activeMission.id)
    : [];

  async function refreshStatus() {
    const [live, health] = await Promise.all([
      api<LiveStatus>("/live").catch(() => null),
      api<HealthStatus>("/health").catch(() => null)
    ]);
    setLiveStatus(live);
    setHealthStatus(health);
  }

  async function restoreSession() {
    const token = getSessionToken();
    if (!token) return;
    try {
      const payload = await api<{ user: SessionUser }>("/v1/auth/me");
      setSession(payload.user);
      setLocale(payload.user.language);
      setView("app");
      await loadWorkspace();
    } catch {
      saveSessionToken("");
      setSession(null);
      setView("home");
    }
  }

  async function loadWorkspace() {
    const [overviewData, toolData, providerData] = await Promise.all([
      api<Overview>("/v1/overview"),
      api<Row[]>("/v1/tools").catch(() => []),
      api<Row[]>("/v1/model-providers").catch(() => [])
    ]);
    setOverview({ ...emptyOverview, ...overviewData });
    setTools(toolData);
    setProviders(providerData);
    const firstMissionId = asText(overviewData.missions[0]?.id);
    if (firstMissionId) setSelectedMissionId((current) => current || firstMissionId);
  }

  async function authenticate(path: "/v1/auth/signup" | "/v1/auth/login", event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const payload = await api<SessionPayload>(path, {
        method: "POST",
        body: JSON.stringify(
          path === "/v1/auth/signup"
            ? {
                name: authForm.name,
                email: authForm.email,
                password: authForm.password,
                organization_name: authForm.organization,
                language: locale
              }
            : {
                email: authForm.email,
                password: authForm.password
              }
        )
      });
      saveSessionToken(payload.token);
      setSession(payload.user);
      setLocale(payload.user.language);
      setView("app");
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api("/v1/auth/logout", { method: "POST" }).catch(() => undefined);
    } finally {
      saveSessionToken("");
      setSession(null);
      setOverview(emptyOverview);
      setSelectedMissionId("");
      setView("home");
      setBusy(false);
    }
  }

  async function createMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !missionForm.title.trim() || !missionForm.intent.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const mission = await api<Row>(`/v1/projects/${projectId}/missions`, {
        method: "POST",
        body: JSON.stringify({
          title: missionForm.title,
          intent: missionForm.intent,
          success_criteria: ["Mission plan recorded", "Evidence captured", "Human approval available"],
          risk_level: "medium",
          autonomy_level: 3,
          human_approval: {
            before_execution: true,
            before_merge: true,
            before_policy_change: true
          }
        })
      });
      setMissionForm({ title: "", intent: "" });
      setSelectedMissionId(asText(mission.id));
      await loadWorkspace();
      setMessage("Mission created in the database.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mission creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runMissionAction(action: "plan" | "agent" | "evaluate" | "approve" | "evidence") {
    if (!activeMission) return;
    setBusy(true);
    setMessage("");
    try {
      if (action === "plan") {
        await api(`/v1/missions/${activeMission.id}/plan`, { method: "POST" });
      }
      if (action === "agent") {
        await api(`/v1/missions/${activeMission.id}/agents/run`, {
          method: "POST",
          body: JSON.stringify({
            role: "coder",
            requested_by: session?.id ?? "human.operator",
            context: { mission_id: activeMission.id }
          })
        });
      }
      if (action === "evaluate") {
        await api(`/v1/missions/${activeMission.id}/evaluate`, { method: "POST" });
      }
      if (action === "approve") {
        await api(`/v1/missions/${activeMission.id}/approve`, {
          method: "POST",
          body: JSON.stringify({
            approver: session?.email ?? "human.operator",
            role: "owner",
            decision: "approved",
            scope: ["execution", "patch", "evaluation"],
            reason: "Approved from the AgentOps web app."
          })
        });
      }
      if (action === "evidence") {
        await api("/v1/evidence", {
          method: "POST",
          body: JSON.stringify({
            mission_id: activeMission.id,
            type: "report",
            title: evidenceForm.title || "Operator note",
            content: evidenceForm.content || "Evidence captured from the AgentOps web app.",
            metadata: { source: "web_app" },
            created_by: session?.email ?? "human.operator"
          })
        });
        setEvidenceForm({ title: "", content: "" });
      }
      await loadWorkspace();
      setMessage("Action recorded in the database.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  function renderHome() {
    return (
      <main className="publicShell">
        <AppHeader
          copy={copy}
          locale={locale}
          setLocale={setLocale}
          right={
            <>
              <button type="button" onClick={() => setView("signin")}>
                <KeyRound size={16} />
                {copy.signin}
              </button>
              <button className="primaryButton" type="button" onClick={() => setView("signup")}>
                <UserPlus size={16} />
                {copy.signup}
              </button>
            </>
          }
        />
        <section className="heroBand">
          <div className="heroCopy">
            <span>{baseMessages.brandSubtitle}</span>
            <h1>{copy.heroTitle}</h1>
            <p>{copy.heroBody}</p>
            <div className="heroActions">
              <button className="primaryButton" type="button" onClick={() => setView("signup")}>
                {copy.webApp}
                <ArrowRight size={17} />
              </button>
              <a className="buttonLike" href={releaseUrl} rel="noreferrer" target="_blank">
                <Download size={17} />
                {copy.desktopApp}
              </a>
            </div>
          </div>
          <ProductPreview copy={copy} />
        </section>
        <section className="publicFeatureGrid">
          <Feature icon={<BriefcaseBusiness size={20} />} title={baseMessages.missions} text="Persistent work records, not screenshots." />
          <Feature icon={<ShieldCheck size={20} />} title={baseMessages.policies} text="Approval gates before risky actions." />
          <Feature icon={<FileCheck2 size={20} />} title={baseMessages.evidence} text="Hash-backed evidence for each mission." />
          <Feature icon={<Download size={20} />} title={copy.desktop} text="Native IDE for files, terminal, and patches." />
        </section>
      </main>
    );
  }

  function renderAuth(mode: "signin" | "signup") {
    const isSignup = mode === "signup";
    return (
      <main className="authPage">
        <AppHeader copy={copy} locale={locale} setLocale={setLocale} right={<button type="button" onClick={() => setView("home")}>AgentOps</button>} />
        <section className="authLayout">
          <div>
            <span>{copy.account}</span>
            <h1>{isSignup ? copy.signup : copy.signin}</h1>
            <p>{copy.heroBody}</p>
          </div>
          <form className="authPanel" onSubmit={(event) => authenticate(isSignup ? "/v1/auth/signup" : "/v1/auth/login", event)}>
            {isSignup && (
              <>
                <label>
                  <span>{copy.name}</span>
                  <input required value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} />
                </label>
                <label>
                  <span>{copy.workspaceName}</span>
                  <input required value={authForm.organization} onChange={(event) => setAuthForm({ ...authForm, organization: event.target.value })} />
                </label>
              </>
            )}
            <label>
              <span>{copy.email}</span>
              <input required type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
            </label>
            <label>
              <span>{copy.password}</span>
              <input required minLength={isSignup ? 8 : 1} type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
            </label>
            {message && <p className="formError">{message}</p>}
            <button className="primaryButton" disabled={busy} type="submit">
              {isSignup ? <UserPlus size={17} /> : <KeyRound size={17} />}
              {isSignup ? copy.signup : copy.signin}
            </button>
            <button type="button" onClick={() => setView(isSignup ? "signin" : "signup")}>
              {isSignup ? copy.signin : copy.signup}
            </button>
          </form>
        </section>
      </main>
    );
  }

  function renderApp() {
    return (
      <main className="productShell">
        <aside className="appSidebar">
          <div className="brandRow">
            <div className="brandMark">A</div>
            <div>
              <strong>AgentOps</strong>
              <span>{asText(overview.organization?.name) || copy.organization}</span>
            </div>
          </div>
          <nav className="appNav" aria-label="Application">
            <NavButton active={activeTab === "missions"} icon={<LayoutDashboard size={18} />} label={copy.dashboard} onClick={() => setActiveTab("missions")} />
            <NavButton active={activeTab === "agents"} icon={<Bot size={18} />} label={copy.agents} onClick={() => setActiveTab("agents")} />
            <NavButton active={activeTab === "evidence"} icon={<FileCheck2 size={18} />} label={copy.evidence} onClick={() => setActiveTab("evidence")} />
            <NavButton active={activeTab === "audit"} icon={<History size={18} />} label={copy.audit} onClick={() => setActiveTab("audit")} />
            <NavButton active={activeTab === "desktop"} icon={<Code2 size={18} />} label={copy.desktop} onClick={() => setActiveTab("desktop")} />
          </nav>
          <div className="sidebarFooter">
            <LanguageSelect locale={locale} setLocale={setLocale} />
            <button disabled={busy} type="button" onClick={() => void logout()}>
              <LogOut size={16} />
              {copy.signout}
            </button>
          </div>
        </aside>

        <section className="appSurface">
          <header className="appTopbar">
            <div>
              <span>{copy.realData}</span>
              <h1>{copy.dashboard}</h1>
            </div>
            <div className="topbarActions">
              <SystemPill ok={Boolean(liveStatus?.ok)} label="API" value={liveStatus?.environment ?? "offline"} />
              <SystemPill ok={databaseReady} label={copy.liveDatabase} value={databaseReady ? copy.connected : copy.notReady} />
              <button disabled={busy} type="button" onClick={() => void loadWorkspace()}>
                <Activity size={16} />
                {messages[locale].refresh}
              </button>
              <a className="buttonLike" href={releaseUrl} rel="noreferrer" target="_blank">
                <Download size={16} />
                {copy.download}
              </a>
            </div>
          </header>

          {message && (
            <div className="statusBanner">
              <BadgeCheck size={17} />
              {message}
              <button type="button" onClick={() => setMessage("")}>
                <X size={15} />
              </button>
            </div>
          )}

          <section className="statsGrid">
            <Stat icon={<BriefcaseBusiness size={18} />} label={messages[locale].missions} value={missions.length} />
            <Stat icon={<Users size={18} />} label={copy.agents} value={overview.agents.length} />
            <Stat icon={<FileCheck2 size={18} />} label={copy.evidence} value={overview.evidence.length} />
            <Stat icon={<TerminalSquare size={18} />} label="Jobs" value={overview.jobs.length} />
          </section>

          {activeTab === "missions" && (
            <section className="workspaceGrid">
              <section className="missionColumn">
                <form className="createMissionForm" onSubmit={createMission}>
                  <div className="sectionHeader">
                    <div>
                      <span>{copy.createMission}</span>
                      <strong>{copy.newMissionIntent}</strong>
                    </div>
                    <Plus size={18} />
                  </div>
                  <input
                    placeholder={copy.newMissionTitle}
                    value={missionForm.title}
                    onChange={(event) => setMissionForm({ ...missionForm, title: event.target.value })}
                  />
                  <textarea
                    placeholder={copy.missionIntent}
                    value={missionForm.intent}
                    onChange={(event) => setMissionForm({ ...missionForm, intent: event.target.value })}
                  />
                  <button className="primaryButton" disabled={busy || !projectId || !missionForm.title.trim() || !missionForm.intent.trim()} type="submit">
                    <Send size={16} />
                    {copy.createMission}
                  </button>
                </form>

                <label className="searchBox">
                  <Search size={16} />
                  <input placeholder="Search missions" value={missionSearch} onChange={(event) => setMissionSearch(event.target.value)} />
                </label>

                <div className="missionList">
                  {filteredMissions.map((mission) => (
                    <button
                      className={mission.id === activeMission?.id ? "missionItem active" : "missionItem"}
                      key={mission.id}
                      type="button"
                      onClick={() => setSelectedMissionId(mission.id)}
                    >
                      <strong>{mission.title}</strong>
                      <span>{mission.intent}</span>
                      <Badge value={mission.status} />
                    </button>
                  ))}
                  {filteredMissions.length === 0 && <EmptyState text={copy.noMissions} />}
                </div>
              </section>

              <section className="detailColumn">
                {activeMission ? (
                  <>
                    <div className="missionDetailHeader">
                      <div>
                        <span>{copy.status}</span>
                        <h2>{activeMission.title}</h2>
                        <p>{activeMission.intent}</p>
                      </div>
                      <Badge value={activeMission.status} />
                    </div>
                    <div className="actionGrid">
                      <ActionButton disabled={busy} icon={<ListChecks size={18} />} label={copy.plan} onClick={() => void runMissionAction("plan")} />
                      <ActionButton disabled={busy} icon={<Bot size={18} />} label={copy.runAgent} onClick={() => void runMissionAction("agent")} />
                      <ActionButton disabled={busy} icon={<BadgeCheck size={18} />} label={copy.evaluate} onClick={() => void runMissionAction("evaluate")} />
                      <ActionButton disabled={busy} icon={<ShieldCheck size={18} />} label={copy.approve} onClick={() => void runMissionAction("approve")} />
                    </div>
                    <div className="evidenceComposer">
                      <input
                        placeholder={copy.attachEvidence}
                        value={evidenceForm.title}
                        onChange={(event) => setEvidenceForm({ ...evidenceForm, title: event.target.value })}
                      />
                      <textarea
                        placeholder={copy.missionIntent}
                        value={evidenceForm.content}
                        onChange={(event) => setEvidenceForm({ ...evidenceForm, content: event.target.value })}
                      />
                      <button disabled={busy} type="button" onClick={() => void runMissionAction("evidence")}>
                        <FileCheck2 size={16} />
                        {copy.attachEvidence}
                      </button>
                    </div>
                    <RecordList title="Jobs" rows={activeMissionJobs} emptyText={copy.emptyState} />
                    <RecordList title={copy.evidence} rows={activeMissionEvidence} emptyText={copy.emptyState} />
                    <RecordList title={copy.audit} rows={activeMissionAudit} emptyText={copy.emptyState} />
                  </>
                ) : (
                  <EmptyState text={copy.noMissions} />
                )}
              </section>
            </section>
          )}

          {activeTab === "agents" && <RecordList title={copy.agents} rows={overview.agents} emptyText={copy.emptyState} />}
          {activeTab === "evidence" && <RecordList title={copy.evidence} rows={overview.evidence} emptyText={copy.emptyState} />}
          {activeTab === "audit" && <RecordList title={copy.audit} rows={overview.audit} emptyText={copy.emptyState} />}
          {activeTab === "desktop" && <DesktopPanel copy={copy} runtime={desktopRuntime} providers={providers.length} tools={tools.length} />}
        </section>
      </main>
    );
  }

  if (view === "signin") return renderAuth("signin");
  if (view === "signup") return renderAuth("signup");
  if (view === "app" && session) return renderApp();
  return renderHome();
}

function AppHeader(props: {
  copy: Record<string, string>;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  right: ReactElement | ReactElement[];
}) {
  return (
    <header className="publicHeader">
      <div className="brandRow">
        <div className="brandMark">A</div>
        <div>
          <strong>AgentOps</strong>
          <span>{props.copy.webApp}</span>
        </div>
      </div>
      <div className="headerActions">
        <LanguageSelect locale={props.locale} setLocale={props.setLocale} />
        {props.right}
      </div>
    </header>
  );
}

function LanguageSelect(props: { locale: Locale; setLocale: (locale: Locale) => void }) {
  return (
    <label className="languageSelect">
      <Languages size={16} />
      <select value={props.locale} onChange={(event) => props.setLocale(event.target.value as Locale)}>
        {locales.map((locale) => (
          <option key={locale.code} value={locale.code}>
            {locale.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProductPreview(props: { copy: Record<string, string> }) {
  return (
    <div className="productPreview">
      <div className="previewTop">
        <span />
        <span />
        <span />
        <strong>AgentOps Web</strong>
      </div>
      <div className="previewGrid">
        <div>
          <BriefcaseBusiness size={20} />
          <strong>{props.copy.webApp}</strong>
          <small>{props.copy.realData}</small>
        </div>
        <div>
          <Code2 size={20} />
          <strong>{props.copy.desktopApp}</strong>
          <small>{props.copy.download}</small>
        </div>
        <div>
          <ShieldCheck size={20} />
          <strong>{props.copy.status}</strong>
          <small>{props.copy.liveDatabase}</small>
        </div>
      </div>
    </div>
  );
}

function Feature(props: { icon: ReactElement; title: string; text: string }) {
  return (
    <article className="featureItem">
      {props.icon}
      <strong>{props.title}</strong>
      <p>{props.text}</p>
    </article>
  );
}

function NavButton(props: { active: boolean; icon: ReactElement; label: string; onClick: () => void }) {
  return (
    <button className={props.active ? "active" : ""} type="button" onClick={props.onClick}>
      {props.icon}
      {props.label}
    </button>
  );
}

function SystemPill(props: { ok: boolean; label: string; value: string }) {
  return (
    <div className={props.ok ? "systemPill ok" : "systemPill"}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function Stat(props: { icon: ReactElement; label: string; value: number }) {
  return (
    <div className="statTile">
      {props.icon}
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ActionButton(props: { disabled: boolean; icon: ReactElement; label: string; onClick: () => void }) {
  return (
    <button disabled={props.disabled} type="button" onClick={props.onClick}>
      {props.icon}
      {props.label}
    </button>
  );
}

function Badge(props: { value: string }) {
  return <em className={`badge ${slugClass(props.value)}`}>{props.value.replace(/_/g, " ")}</em>;
}

function EmptyState(props: { text: string }) {
  return (
    <div className="emptyState">
      <Globe2 size={22} />
      <p>{props.text}</p>
    </div>
  );
}

function RecordList(props: { title: string; rows: Row[]; emptyText: string }) {
  return (
    <section className="recordPanel">
      <div className="sectionHeader">
        <div>
          <span>{props.title}</span>
          <strong>{props.rows.length}</strong>
        </div>
      </div>
      <div className="recordList">
        {props.rows.slice(0, 12).map((row, index) => (
          <div className="recordRow" key={asText(row.id) || index}>
            <FileCheck2 size={16} />
            <div>
              <strong>{asText(row.title) || asText(row.name) || asText(row.eventType) || asText(row.type) || asText(row.id) || "Record"}</strong>
              <span>{asText(row.status) || asText(row.decision) || asText(row.result) || asText(row.role) || "stored"}</span>
            </div>
            <time>{formatTime(asText(row.createdAt))}</time>
          </div>
        ))}
        {props.rows.length === 0 && <EmptyState text={props.emptyText} />}
      </div>
    </section>
  );
}

function DesktopPanel(props: { copy: Record<string, string>; runtime: DesktopRuntime | null; providers: number; tools: number }) {
  return (
    <section className="desktopPanel">
      <div>
        <span>{props.copy.desktopApp}</span>
        <h2>{props.copy.download}</h2>
        <p>{props.copy.desktopBody}</p>
        <div className="heroActions">
          <a className="buttonLike primaryButton" href={releaseUrl} rel="noreferrer" target="_blank">
            <Download size={17} />
            {props.copy.download}
          </a>
          <a className="buttonLike" href={API_URL.replace(/\/api$/, "")} rel="noreferrer" target="_blank">
            <Globe2 size={17} />
            {props.copy.webApp}
          </a>
        </div>
      </div>
      <div className="desktopStatusGrid">
        <Stat icon={<Code2 size={18} />} label="Runtime" value={props.runtime ? 1 : 0} />
        <Stat icon={<Bot size={18} />} label="Providers" value={props.providers} />
        <Stat icon={<TerminalSquare size={18} />} label="Tools" value={props.tools} />
      </div>
    </section>
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

function readLocale(): Locale {
  try {
    const stored = localStorage.getItem("agentops.locale");
    return stored === "en" || stored === "fr" || stored === "es" || stored === "zh" ? stored : "en";
  } catch {
    return "en";
  }
}

function formatTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
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
