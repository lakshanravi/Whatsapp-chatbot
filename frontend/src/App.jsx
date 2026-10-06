import {
  Activity,
  Bot,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  History,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Send,
  SlidersHorizontal,
  ShoppingCart,
  Trash2,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "./components/AdminShell";
import { LoginPage } from "./components/LoginPage";
import { CommercePanel } from "./components/CommercePanel";
import { DashboardOverview } from "./components/DashboardOverview";
import {
  Field,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  TextArea,
  TextInput,
} from "./components/ui";
import {
  emptyAdminForm,
  emptyCompanyForm,
  emptyLoginForm,
  emptySmsForm,
  emptyWhatsAppForm,
  widgetEmbedModeOptions,
  defaultWidgetTheme,
  widgetLauncherIconOptions,
  getCompanyWidgetTheme,
} from "./constants/forms";
import { api, formatDate, getAuthToken, setAuthToken } from "./lib/api";
import { classNames } from "./utils/classNames";

function InlineFormat({ text }) {
  return String(text || "").split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function FormattedAnswer({ text }) {
  return (
    <div className="space-y-1 text-sm leading-6">
      {String(text || "").split("\n").map((line, index) => {
        const bullet = line.match(/^\s*[-*]\s+(.+)/);
        return bullet ? (
          <div key={index} className="flex gap-2 pl-1">
            <span aria-hidden="true">•</span>
            <span><InlineFormat text={bullet[1]} /></span>
          </div>
        ) : (
          <p key={index} className={line ? "" : "h-2"}>
            <InlineFormat text={line} />
          </p>
        );
      })}
    </div>
  );
}

function sourceLabel(source) {
  if (!source?.documentName) return "";
  return source.pageNumber
    ? `${source.documentName} (page ${source.pageNumber})`
    : source.documentName;
}

function sourceSummary(sources = []) {
  return [...new Set(sources.map(sourceLabel).filter(Boolean))].join(", ");
}

function ChatDiagnostics({ diagnostics }) {
  if (!diagnostics) return null;

  const timings = diagnostics.timingsMs || diagnostics.timings_ms || {};
  const retrieval = diagnostics.retrieval || {};
  const timingEntries = Object.entries(timings).filter(([, value]) => Number.isFinite(Number(value)));
  const retrievalEntries = Object.entries(retrieval);
  const cacheHit = Boolean(diagnostics.cache?.hit);

  if (!timingEntries.length && !retrievalEntries.length && !diagnostics.cache) {
    return null;
  }

  return (
    <div className="mt-4 border rounded border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200">
        <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">Diagnostics</span>
        <span className={classNames("rounded px-2 py-0.5 text-xs", cacheHit ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600")}>
          Cache {cacheHit ? "hit" : "miss"}
        </span>
      </div>
      {timingEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-2 p-3 text-xs sm:grid-cols-3">
          {timingEntries.map(([key, value]) => (
            <div key={key} className="rounded border border-slate-200 bg-white px-2 py-1.5">
              <div className="font-semibold text-slate-700">{key.replace(/_/g, " ")}</div>
              <div className="text-slate-500">{Number(value)} ms</div>
            </div>
          ))}
        </div>
      )}
      {retrievalEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pb-3 text-xs text-slate-600">
          {retrievalEntries.map(([key, value]) => (
            <span key={key} className="rounded bg-white px-2 py-1 ring-1 ring-slate-200">
              {key.replace(/_/g, " ")}: {String(value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [loginForm, setLoginForm] = useState(emptyLoginForm);
  const [authChecked, setAuthChecked] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [backupFile, setBackupFile] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoreStatus, setRestoreStatus] = useState(null);
  const [backupProgress, setBackupProgress] = useState(null);
  const [health, setHealth] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatSessionId, setChatSessionId] = useState("");
  const [chatResult, setChatResult] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const chatMessagesEndRef = useRef(null);
  const [widgetKeyResult, setWidgetKeyResult] = useState(null);
  const [widgetApiKeyInput, setWidgetApiKeyInput] = useState("");
  const [widgetEmbedMode, setWidgetEmbedMode] = useState("all");
  const [widgetThemeForm, setWidgetThemeForm] = useState(defaultWidgetTheme);
  const [showWidgetPreview, setShowWidgetPreview] = useState(false);
  const [widgetPreviewOpen, setWidgetPreviewOpen] = useState(false);
  const [widgetTestMessage, setWidgetTestMessage] = useState("");
  const [widgetTestMessages, setWidgetTestMessages] = useState([
    { role: "assistant", content: "Hi, how can I help?" },
  ]);
  const [whatsappIntegration, setWhatsappIntegration] = useState(null);
  const [whatsappForm, setWhatsappForm] = useState(emptyWhatsAppForm);
  const [whatsappValidation, setWhatsappValidation] = useState(null);
  const [smsIntegration, setSmsIntegration] = useState(null);
  const [smsForm, setSmsForm] = useState(emptySmsForm);
  const [smsValidation, setSmsValidation] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
    const [uploadProgress, setUploadProgress] = useState(null);
    const [reindexProgress, setReindexProgress] = useState(null);
  const [loading, setLoading] = useState({
    health: false,
    companies: false,
    documents: false,
    download: false,
      upload: false,
      reindexAll: false,
    chat: false,
    widgetTest: false,
    whatsapp: false,
    sms: false,
    conversations: false,
    auth: false,
    admins: false,
    backupDownload: false,
    backupRestore: false,
  });

  const selectedCompany = useMemo(
    () => companies.find((company) => company._id === selectedId) || null,
    [companies, selectedId]
  );
  const isSuperAdmin = currentUser?.role === "superadmin";
  const navItems = isSuperAdmin
    ? [
        { id: "dashboard", label: "Dashboard", icon: Activity },
        { id: "companies", label: "Businesses", icon: Building2 },
        { id: "admins", label: "Team access", icon: Users },
        { id: "backups", label: "Backup & Restore", icon: Download },
      ]
    : [
        { id: "dashboard", label: "Dashboard", icon: Activity },
        { id: "orders", label: "Orders", icon: ShoppingCart },
        { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
        { id: "messenger", label: "Messenger", icon: MessagesSquare },
        { id: "sms", label: "SMS", icon: MessageSquare },
        { id: "documents", label: "Knowledge base", icon: FileText },
        { id: "history", label: "Conversations", icon: History },
        { id: "settings", label: "Business settings", icon: SlidersHorizontal },
        { id: "help", label: "Website assistant", icon: Search },
      ];
  const companyDashboardNav = [
    { id: "dashboard", label: "Overview", icon: Activity },
    { id: "orders", label: "Orders", icon: ShoppingCart },
    { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
    { id: "messenger", label: "Messenger", icon: MessagesSquare },
    { id: "sms", label: "SMS", icon: MessageSquare },
    { id: "documents", label: "Knowledge base", icon: FileText },
    { id: "chat", label: "Test assistant", icon: MessageSquare },
    { id: "history", label: "Conversations", icon: History },
    { id: "settings", label: "Business settings", icon: SlidersHorizontal },
    { id: "help", label: "Website assistant", icon: Search },
  ];
  const activeNavItems = isSuperAdmin && selectedCompany ? companyDashboardNav : navItems;
  const adminGroups = useMemo(() => {
    const groups = new Map();
    for (const admin of adminUsers) {
      const key =
        admin.role === "superadmin"
          ? "Superadmins"
          : admin.companyId?.name || admin.companyId || "Unassigned company";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(admin);
    }
    return Array.from(groups.entries());
  }, [adminUsers]);

  useEffect(() => {
    if (!isSuperAdmin || activeSection !== "backups") return undefined;
    let cancelled = false;
    const refresh = () => {
      api.backups.status()
        .then((status) => {
          if (!cancelled) setRestoreStatus(status);
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeSection, isSuperAdmin]);

  async function runTask(key, task, successMessage = "") {
    setLoading((current) => ({ ...current, [key]: true }));
    setError("");
    setNotice("");
    try {
      const result = await task();
      if (successMessage) setNotice(successMessage);
      return result;
    } catch (err) {
      setError(err.message || "Something went wrong");
      return null;
    } finally {
      setLoading((current) => ({ ...current, [key]: false }));
    }
  }

  async function loadHealth() {
    const result = await runTask("health", () => api.health());
    if (result) setHealth(result);
  }

  async function loadCompanies() {
    const result = await runTask("companies", () => api.companies.list());
    if (result) {
      setCompanies(result);
      if (currentUser?.role === "company_admin" && currentUser.companyId) {
        setSelectedId(String(currentUser.companyId));
      } else if (!isSuperAdmin && !selectedId && result[0]) setSelectedId(result[0]._id);
      if (selectedId && !result.some((company) => company._id === selectedId)) {
        setSelectedId(result[0]?._id || "");
      }
    }
  }

  async function loadDocuments(companyId = selectedId) {
    if (!companyId) {
      setDocuments([]);
      setSelectedDocumentIds([]);
      return;
    }
    const result = await runTask("documents", () => api.documents.list(companyId));
    if (result) {
      setDocuments(result);
      const availableIds = new Set(result.map((document) => document._id));
      setSelectedDocumentIds((current) =>
        current.filter((documentId) => availableIds.has(documentId))
      );
    }
  }

  async function loadConversations(companyId = selectedId, search = conversationSearch) {
    if (!companyId) {
      setConversations([]);
      return;
    }
    const result = await runTask("conversations", () => api.chat.conversations(companyId, search));
    if (result) setConversations(result);
  }

  async function loadWhatsAppIntegration(companyId = selectedId) {
    if (!companyId) {
      setWhatsappIntegration(null);
      setWhatsappForm(emptyWhatsAppForm);
      setWhatsappValidation(null);
      return;
    }

    setLoading((current) => ({ ...current, whatsapp: true }));
    setWhatsappValidation(null);
    try {
      const result = await api.whatsappIntegration.get(companyId);
      const integration = Array.isArray(result) ? null : result;
      setWhatsappIntegration(integration);
      setWhatsappForm({
        phoneNumberId: integration?.phoneNumberId || "",
        accessToken: "",
        isActive: integration?.isActive !== false,
      });
    } catch (err) {
      if (String(err.message || "").toLowerCase().includes("not found")) {
        setWhatsappIntegration(null);
        setWhatsappForm(emptyWhatsAppForm);
      } else {
        setError(err.message || "Failed to load WhatsApp integration");
      }
    } finally {
      setLoading((current) => ({ ...current, whatsapp: false }));
    }
  }


  async function loadSmsIntegration(companyId = selectedId) {
    if (!companyId) {
      setSmsIntegration(null);
      setSmsForm(emptySmsForm);
      setSmsValidation(null);
      return;
    }

    setLoading((current) => ({ ...current, sms: true }));
    setSmsValidation(null);
    try {
      const result = await api.smsIntegration.get(companyId);
      const integration = Array.isArray(result) ? null : result;
      setSmsIntegration(integration);
      setSmsForm({
        accountSid: integration?.accountSid || "",
        authToken: "",
        phoneNumber: integration?.phoneNumber || "",
        isActive: integration?.isActive !== false,
      });
    } catch (err) {
      if (String(err.message || "").toLowerCase().includes("not found")) {
        setSmsIntegration(null);
        setSmsForm(emptySmsForm);
      } else {
        setError(err.message || "Failed to load SMS integration");
      }
    } finally {
      setLoading((current) => ({ ...current, sms: false }));
    }
  }

  async function loadAdminUsers() {
    if (!isSuperAdmin) return;
    const result = await runTask("admins", () => api.adminUsers.list());
    if (result) setAdminUsers(result);
  }

  useEffect(() => {
    loadHealth();
    async function restoreSession() {
      if (!getAuthToken()) {
        setAuthChecked(true);
        return;
      }
      const user = await runTask("auth", () => api.auth.me());
      if (user) setCurrentUser(user);
      else setAuthToken("");
      setAuthChecked(true);
    }
    restoreSession();
  }, []);

  useEffect(() => {
    if (currentUser) {
      setActiveSection("dashboard");
      loadCompanies();
      loadAdminUsers();
    }
  }, [currentUser]);

  useEffect(() => {
    if (selectedId) {
      loadDocuments(selectedId);
      loadConversations(selectedId);
      loadWhatsAppIntegration(selectedId);
      loadSmsIntegration(selectedId);
      setSelectedConversation(null);
      setConversationSearch("");
      setChatResult(null);
      setChatMessages([]);
      setWidgetKeyResult(null);
      setWidgetApiKeyInput("");
      setWidgetEmbedMode("all");
      setWidgetThemeForm(defaultWidgetTheme);
      setShowWidgetPreview(false);
      setWidgetPreviewOpen(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (selectedCompany) {
      setWidgetThemeForm(getCompanyWidgetTheme(selectedCompany));
    } else {
      setWidgetThemeForm(defaultWidgetTheme);
    }
  }, [selectedCompany]);

  async function handleLogin(event) {
    event.preventDefault();
    const result = await runTask("auth", () => api.auth.login(loginForm), "Signed in");
    if (result) {
      setAuthToken(result.token);
      setCurrentUser(result.user);
      setSelectedId(result.user.role === "company_admin" ? String(result.user.companyId) : "");
    }
  }

  function handleLogout() {
    setAuthToken("");
    setCurrentUser(null);
    setCompanies([]);
    setSelectedId("");
    setDocuments([]);
    setConversations([]);
    setSelectedConversation(null);
    setWidgetKeyResult(null);
    setWidgetApiKeyInput("");
    setWidgetEmbedMode("all");
    setWidgetThemeForm(defaultWidgetTheme);
    setShowWidgetPreview(false);
    setWidgetPreviewOpen(false);
    setWhatsappIntegration(null);
    setWhatsappForm(emptyWhatsAppForm);
    setWhatsappValidation(null);
    setSmsIntegration(null);
    setSmsForm(emptySmsForm);
    setSmsValidation(null);
  }

  useEffect(() => {
    if (selectedCompany && editingCompany) {
      setCompanyForm({
        name: selectedCompany.name || "",
        slug: selectedCompany.slug || "",
        description: selectedCompany.description || "",
      });
    }
  }, [selectedCompany, editingCompany]);

  async function handleCreateCompany(event) {
    event.preventDefault();
    if (!isSuperAdmin) return;
    const payload = {
      name: companyForm.name.trim(),
      description: companyForm.description.trim(),
    };
    if (companyForm.slug.trim()) payload.slug = companyForm.slug.trim();

    const created = await runTask(
      "companies",
      () => api.companies.create(payload),
      "Company created"
    );
    if (created) {
      setCompanyForm(emptyCompanyForm);
      setShowCompanyModal(false);
      await loadCompanies();
    }
  }

  async function handleUpdateCompany(event) {
    event.preventDefault();
    if (!selectedCompany) return;
    const updated = await runTask(
      "companies",
      () =>
        api.companies.update(selectedCompany._id, {
          name: companyForm.name.trim(),
          description: companyForm.description.trim(),
          isActive: selectedCompany.isActive,
        }),
      "Company updated"
    );
    if (updated) {
      setEditingCompany(false);
      await loadCompanies();
    }
  }

  async function handleToggleCompany() {
    if (!selectedCompany) return;
    const updated = await runTask(
      "companies",
      () =>
        api.companies.update(selectedCompany._id, {
          name: selectedCompany.name,
          description: selectedCompany.description,
          isActive: !selectedCompany.isActive,
        }),
      "Company status updated"
    );
    if (updated) await loadCompanies();
  }

  async function handleDeleteCompany() {
    if (!selectedCompany) return;
    if (!isSuperAdmin) return;
    const ok = window.confirm(`Delete ${selectedCompany.name}?`);
    if (!ok) return;
    const result = await runTask(
      "companies",
      () => api.companies.remove(selectedCompany._id),
      "Company deleted"
    );
    if (result) {
      setSelectedId("");
      await loadCompanies();
    }
  }

  function openCompanyDashboard(companyId) {
    setSelectedId(companyId);
    setActiveSection("dashboard");
  }

  function backToSuperAdmin() {
    setSelectedId("");
    setActiveSection("dashboard");
    setDocuments([]);
    setConversations([]);
    setSelectedConversation(null);
    setChatResult(null);
    setChatMessages([]);
    setWidgetKeyResult(null);
    setWidgetApiKeyInput("");
    setWidgetEmbedMode("all");
    setWidgetThemeForm(defaultWidgetTheme);
    setShowWidgetPreview(false);
    setWidgetPreviewOpen(false);
    setWhatsappIntegration(null);
    setWhatsappForm(emptyWhatsAppForm);
    setWhatsappValidation(null);
    setSmsIntegration(null);
    setSmsForm(emptySmsForm);
    setSmsValidation(null);
  }

  async function handleGenerateWidgetApiKey() {
    if (!selectedCompany) return;
    const result = await runTask(
      "companies",
      () => api.companies.generateWidgetApiKey(selectedCompany._id),
      "Widget API key generated"
    );
    if (result) {
      setWidgetKeyResult(result);
      setWidgetApiKeyInput(result.apiKey);
      await loadCompanies();
    }
  }

  async function handleSaveWidgetTheme() {
    if (!selectedCompany) return;

    const themeToSave = normalizeWidgetThemeForm(widgetThemeForm);
    setWidgetThemeForm(themeToSave);

    const result = await runTask(
      "companies",
      () => api.companies.updateWidgetTheme(selectedCompany._id, themeToSave)
    );

    if (result) {
      const savedTheme = normalizeWidgetThemeForm(result.widgetTheme);
      const themeWasSaved = widgetThemesMatch(savedTheme, themeToSave);
      const companyWithSavedTheme = { ...result, widgetTheme: themeToSave };

      setCompanies((current) =>
        current.map((company) =>
          company._id === selectedCompany._id
            ? { ...company, ...companyWithSavedTheme }
            : company
        )
      );
      setWidgetThemeForm(themeToSave);

      if (themeWasSaved) {
        setNotice("Widget theme updated");
      } else {
        setError(
          "The backend did not return the selected widget theme. Restart or redeploy the updated backend, then save again."
        );
      }
    }
  }

  function handleResetWidgetTheme() {
    setWidgetThemeForm({ ...defaultWidgetTheme });
  }

  function normalizeWidgetThemeForm(theme = {}) {
    return {
      headerColor: theme.headerColor || defaultWidgetTheme.headerColor,
      sendButtonColor: theme.sendButtonColor || defaultWidgetTheme.sendButtonColor,
      launcherColor: theme.launcherColor || defaultWidgetTheme.launcherColor,
      launcherIcon: ["bot", "message", "question"].includes(theme.launcherIcon)
        ? theme.launcherIcon
        : defaultWidgetTheme.launcherIcon,
    };
  }

  function widgetThemesMatch(left, right) {
    const normalizedLeft = normalizeWidgetThemeForm(left);
    const normalizedRight = normalizeWidgetThemeForm(right);

    return (
      normalizedLeft.headerColor.toLowerCase() === normalizedRight.headerColor.toLowerCase() &&
      normalizedLeft.sendButtonColor.toLowerCase() === normalizedRight.sendButtonColor.toLowerCase() &&
      normalizedLeft.launcherColor.toLowerCase() === normalizedRight.launcherColor.toLowerCase() &&
      normalizedLeft.launcherIcon === normalizedRight.launcherIcon
    );
  }

  function renderLauncherIcon(size = 22) {
    if (widgetThemeForm.launcherIcon === "question") {
      return (
        <span className={classNames("font-bold leading-none", size >= 25 ? "text-2xl" : "text-lg")}>
          ?
        </span>
      );
    }

    if (widgetThemeForm.launcherIcon === "bot") {
      return <Bot size={size} />;
    }

    return <MessageSquare size={size} />;
  }

  async function copyWidgetSnippet() {
    if (!selectedCompany) return;
    const snippet = widgetSnippet();
    await navigator.clipboard.writeText(snippet);
    setNotice("Widget embed code copied");
  }

  function jsString(value) {
  return JSON.stringify(String(value || ""));
}

function widgetBaseConfigLines(apiKey, companyName) {
  const theme = widgetThemeForm || defaultWidgetTheme;

  return `    apiBaseUrl: ${jsString(api.baseUrl)},
    companyId: ${jsString(selectedCompany._id)},
    apiKey: ${jsString(apiKey)},

    title: ${jsString(`${companyName} Support`)},
    subtitle: "Ask us anything",
    accentColor: ${jsString(theme.headerColor)},
    headerColor: ${jsString(theme.headerColor)},
    sendButtonColor: ${jsString(theme.sendButtonColor)},
    launcherColor: ${jsString(theme.launcherColor)},
    launcherIcon: ${jsString(theme.launcherIcon)},
    position: "right",`;
}

function widgetScriptSrc() {
  return `<script src="https://aichatbot.pentarixlabs.com/dist-widget/rag-chat-widget.iife.js"></script>`;
}

function widgetSnippet() {
  if (!selectedCompany) return "";

  const apiKey = widgetApiKeyInput.trim() || "PASTE_WIDGET_API_KEY";
  const companyName = selectedCompany.name || "Company";
  const baseConfig = widgetBaseConfigLines(apiKey, companyName);

  if (widgetEmbedMode === "external") {
    return `<script>
  async function getChatbotExternalUserToken() {
    try {
      const response = await fetch("/api/chatbot-user-token", {
        method: "GET",
        credentials: "include"
      });

      if (!response.ok) {
        return "";
      }

      const data = await response.json();
      return data.token || "";
    } catch (error) {
      return "";
    }
  }

  window.RAG_CHAT_WIDGET = {
${baseConfig}

    showExternalLogin: true,
    externalLoginButtonText: "Login with Website Account",
    getExternalUserToken: getChatbotExternalUserToken,
    externalLoginUrl: "/login",

    showGoogleLogin: false,
    googleClientId: "",

    allowGuest: false,
    guestText: "Continue without Login",

    welcomeText: ${jsString(`Welcome to ${companyName} Support`)},
    loginText: "Login with your website account to load your saved chat history.",
    greeting: "Hi, how can I help?"
  };
</script>
${widgetScriptSrc()}`;
  }

  if (widgetEmbedMode === "google") {
    return `<script>
  window.RAG_CHAT_WIDGET = {
${baseConfig}

    showExternalLogin: false,
    externalLoginButtonText: "",
    externalLoginUrl: "",

    showGoogleLogin: true,
    googleClientId: "PASTE_GOOGLE_CLIENT_ID",

    allowGuest: false,
    guestText: "Continue without Login",

    welcomeText: ${jsString(`Welcome to ${companyName} Support`)},
    loginText: "Login with Google to load your saved chat history.",
    greeting: "Hi, how can I help?"
  };
</script>
${widgetScriptSrc()}`;
  }

  if (widgetEmbedMode === "guest") {
    return `<script>
  window.RAG_CHAT_WIDGET = {
${baseConfig}

    showExternalLogin: false,
    externalLoginButtonText: "",
    externalLoginUrl: "",

    showGoogleLogin: false,
    googleClientId: "",

    allowGuest: true,
    guestText: "Continue without Login",

    welcomeText: ${jsString(`Welcome to ${companyName} Support`)},
    loginText: "Continue without login to start chatting.",
    greeting: "Hi, how can I help?"
  };
</script>
${widgetScriptSrc()}`;
  }

  return `<script>
  async function getChatbotExternalUserToken() {
    try {
      const response = await fetch("/api/chatbot-user-token", {
        method: "GET",
        credentials: "include"
      });

      if (!response.ok) {
        return "";
      }

      const data = await response.json();
      return data.token || "";
    } catch (error) {
      return "";
    }
  }

  window.RAG_CHAT_WIDGET = {
${baseConfig}

    showExternalLogin: true,
    externalLoginButtonText: "Login with Website Account",
    getExternalUserToken: getChatbotExternalUserToken,
    externalLoginUrl: "/login",

    showGoogleLogin: true,
    googleClientId: "PASTE_GOOGLE_CLIENT_ID",

    allowGuest: true,
    guestText: "Continue without Login",

    welcomeText: ${jsString(`Welcome to ${companyName} Support`)},
    loginText: "Login to load your saved chat history, or continue without login.",
    greeting: "Hi, how can I help?"
  };
</script>
${widgetScriptSrc()}`;
}

  async function sendWidgetTestMessage(message, displayMessage = message) {
    if (!selectedCompany || !widgetApiKeyInput.trim() || !message?.trim()) return;
    message = message.trim();
    displayMessage = displayMessage?.trim() || message;
    setWidgetTestMessage("");
    setWidgetTestMessages((current) => [...current, { role: "user", content: displayMessage }]);

    const result = await runTask("widgetTest", async () => {
      const response = await fetch(`${api.baseUrl}/widget/companies/${selectedCompany._id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Widget-API-Key": widgetApiKeyInput.trim(),
        },
        body: JSON.stringify({
          message,
          sessionId: `dashboard_widget_test_${selectedCompany._id}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Widget chat failed");
      return data;
    });

    if (result) {
      setWidgetTestMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: result.answer,
          sources: result.sources || [],
          suggestions: result.suggestions || [],
          conversationId: result.conversationId,
        },
      ]);
    }
  }

  async function handleWidgetTestChat(event) {
    event.preventDefault();
    await sendWidgetTestMessage(widgetTestMessage);
  }

  async function handleSaveWhatsAppIntegration(event) {
    event.preventDefault();
    if (!selectedCompany) return;

    const phoneNumberId = whatsappForm.phoneNumberId.trim();
    const accessToken = whatsappForm.accessToken.trim();

    if (!phoneNumberId) {
      setError("WhatsApp phone number ID is required");
      return;
    }

    if (!whatsappIntegration && !accessToken) {
      setError("Access token is required when creating a WhatsApp integration");
      return;
    }

    const payload = {
      phoneNumberId,
      isActive: whatsappForm.isActive,
    };
    if (accessToken) payload.accessToken = accessToken;

    const result = await runTask(
      "whatsapp",
      () => api.whatsappIntegration.save(selectedCompany._id, payload, Boolean(whatsappIntegration)),
      whatsappIntegration ? "WhatsApp integration updated" : "WhatsApp integration saved"
    );

    if (result) {
      setWhatsappIntegration(result);
      setWhatsappForm({
        phoneNumberId: result.phoneNumberId || phoneNumberId,
        accessToken: "",
        isActive: result.isActive !== false,
      });
      setWhatsappValidation(null);
    }
  }

  async function handleValidateWhatsAppIntegration() {
    if (!selectedCompany) return;

    const result = await runTask(
      "whatsapp",
      () => api.whatsappIntegration.validate(selectedCompany._id),
      "WhatsApp integration validated"
    );

    if (result) setWhatsappValidation(result);
  }

  async function handleDeleteWhatsAppIntegration() {
    if (!selectedCompany || !whatsappIntegration) return;
    const ok = window.confirm("Delete this WhatsApp integration?");
    if (!ok) return;

    const result = await runTask(
      "whatsapp",
      () => api.whatsappIntegration.remove(selectedCompany._id),
      "WhatsApp integration deleted"
    );

    if (result) {
      setWhatsappIntegration(null);
      setWhatsappForm(emptyWhatsAppForm);
      setWhatsappValidation(null);
    }
  }



  async function handleSaveSmsIntegration(event) {
    event.preventDefault();
    if (!selectedCompany) return;

    const accountSid = smsForm.accountSid.trim();
    const authToken = smsForm.authToken.trim();
    const phoneNumber = smsForm.phoneNumber.trim();

    if (!accountSid) {
      setError("Twilio Account SID is required");
      return;
    }

    if (!phoneNumber) {
      setError("Twilio SMS phone number is required");
      return;
    }

    if (!smsIntegration && !authToken) {
      setError("Twilio Auth Token is required when creating an SMS integration");
      return;
    }

    const payload = {
      accountSid,
      phoneNumber,
      isActive: smsForm.isActive,
    };
    if (authToken) payload.authToken = authToken;

    const result = await runTask(
      "sms",
      () => api.smsIntegration.save(selectedCompany._id, payload, Boolean(smsIntegration)),
      smsIntegration ? "SMS integration updated" : "SMS integration saved"
    );

    if (result) {
      setSmsIntegration(result);
      setSmsForm({
        accountSid: result.accountSid || accountSid,
        authToken: "",
        phoneNumber: result.phoneNumber || phoneNumber,
        isActive: result.isActive !== false,
      });
      setSmsValidation(null);
    }
  }

  async function handleValidateSmsIntegration() {
    if (!selectedCompany) return;

    const result = await runTask(
      "sms",
      () => api.smsIntegration.validate(selectedCompany._id),
      "SMS integration validated"
    );

    if (result) setSmsValidation(result);
  }

  async function handleDeleteSmsIntegration() {
    if (!selectedCompany || !smsIntegration) return;
    const ok = window.confirm("Delete this SMS integration?");
    if (!ok) return;

    const result = await runTask(
      "sms",
      () => api.smsIntegration.remove(selectedCompany._id),
      "SMS integration deleted"
    );

    if (result) {
      setSmsIntegration(null);
      setSmsForm(emptySmsForm);
      setSmsValidation(null);
    }
  }

  async function handleUpload(event) {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";
    const files = selectedFiles.filter((file) => {
      const name = file.name || "";
      return file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
    });
    if (files.length === 0 || !selectedCompany) return;

    setLoading((current) => ({ ...current, upload: true }));
    setError("");
    setNotice("");
    setUploadProgress({ current: 1, total: files.length, fileName: files[0].name });

    const failures = [];
    let uploaded = 0;
    let skipped = 0;

    try {
      const normalizeDocumentName = (value) => String(value || "")
        .replace(/\\/g, "/")
        .split("/")
        .filter((part) => part && part !== "." && part !== "..")
        .join("/");
      for (const [index, file] of files.entries()) {
        const relativeName = normalizeDocumentName(file.webkitRelativePath || file.name);
        setUploadProgress({ current: index + 1, total: files.length, fileName: relativeName });
        try {
          await api.documents.upload(selectedCompany._id, [file]);
          uploaded += 1;
        } catch (err) {
          if (err.status === 409 && err.data?.duplicate) {
            skipped += 1;
          } else {
            console.error("[task] error upload", relativeName, err);
            failures.push({ fileName: relativeName, message: err.message || "Indexing failed" });
          }
        }
      }

      const refreshedDocuments = await api.documents.list(selectedCompany._id);
      setDocuments(refreshedDocuments);

      const successParts = [];
      if (uploaded) successParts.push(`${uploaded} new document${uploaded === 1 ? "" : "s"} uploaded`);
      if (skipped) successParts.push(`${skipped} exact duplicate${skipped === 1 ? "" : "s"} skipped`);
      if (successParts.length > 0) {
        setNotice(successParts.join(", "));
      }
      if (failures.length > 0) {
        const failedNames = failures.map(({ fileName }) => fileName).join(", ");
        setError(`${failures.length} upload${failures.length === 1 ? "" : "s"} failed: ${failedNames}`);
      }
    } catch (err) {
      console.error("[task] error refreshing documents", err);
      setError(err.message || "Uploads finished, but the document list could not be refreshed");
    } finally {
      setLoading((current) => ({ ...current, upload: false }));
      setUploadProgress(null);
    }
  }

  async function handleReindex(documentId) {
    const result = await runTask(
      "documents",
      () => api.documents.reindex(selectedCompany._id, documentId),
      "Document reindexed"
    );
    if (result) await loadDocuments();
  }

  async function handleDeleteDocument(documentId) {
    const ok = window.confirm("Delete this document and vectors?");
    if (!ok) return;
    const result = await runTask(
      "documents",
      () => api.documents.remove(selectedCompany._id, documentId),
      "Document deleted"
    );
    if (result) {
      setSelectedDocumentIds((current) => current.filter((id) => id !== documentId));
      await loadDocuments();
    }
  }

  function toggleDocumentSelection(documentId) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    );
  }

  function toggleAllDocuments() {
    setSelectedDocumentIds((current) =>
      current.length === documents.length
        ? []
        : documents.map((document) => document._id)
    );
  }

  async function handleBulkDeleteDocuments() {
    if (!selectedCompany || selectedDocumentIds.length === 0) return;
    const count = selectedDocumentIds.length;
    const ok = window.confirm(
      `Delete ${count} selected PDF${count === 1 ? "" : "s"} and their vectors?`
    );
    if (!ok) return;
    const result = await runTask(
      "documents",
      () => api.documents.removeBulk(selectedCompany._id, selectedDocumentIds),
      `${count} document${count === 1 ? "" : "s"} deleted`
    );
    if (result) {
      setSelectedDocumentIds([]);
      await loadDocuments();
    }
  }

  async function handleBulkDownloadDocuments() {
    if (!selectedCompany || selectedDocumentIds.length === 0) return;
    const selectedDocuments = documents.filter((document) =>
      selectedDocumentIds.includes(document._id)
    );
    const result = await runTask(
      "download",
      async () => {
        for (const document of selectedDocuments) {
          const blob = await api.documents.download(selectedCompany._id, document._id);
          const url = URL.createObjectURL(blob);
          const link = window.document.createElement("a");
          link.href = url;
          link.download = document.originalName.split(/[\\/]/).pop() || "document.pdf";
          window.document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        }
        return true;
      },
      `${selectedDocuments.length} document${selectedDocuments.length === 1 ? "" : "s"} downloaded`
    );
    if (result) setSelectedDocumentIds([]);
  }

  async function handleDeleteAllDocuments() {
    if (!selectedCompany || documents.length === 0) return;
    const ok = window.confirm(
      `Permanently delete all ${documents.length} PDFs for ${selectedCompany.name} and their vectors? This cannot be undone.`
    );
    if (!ok) return;
    const result = await runTask(
      "documents",
      () => api.documents.removeAll(selectedCompany._id),
      "All documents deleted"
    );
    if (result) {
      setSelectedDocumentIds([]);
      await loadDocuments();
    }
  }

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chatMessages, loading.chat]);

  async function sendTestChatMessage(value) {
    if (!selectedCompany || !String(value || "").trim() || loading.chat) return;
    const sentMessage = String(value).trim();
    const payload = { message: sentMessage };
    if (chatSessionId.trim()) payload.sessionId = chatSessionId.trim();
    const result = await runTask("chat", () => api.chat.ask(selectedCompany._id, payload));
    if (result) {
      setChatResult(result);
      setChatSessionId(result.sessionId || "");
      setChatMessage("");
      try {
        const history = await api.chat.history(selectedCompany._id, result.sessionId);
        const messages = [...(history.messages || [])];
        if (result.suggestions?.length && messages.length) {
          messages[messages.length - 1] = {
            ...messages[messages.length - 1],
            suggestions: result.suggestions,
          };
        }
        setChatMessages(messages);
      } catch {
        setChatMessages((current) => [
          ...current,
          { role: "user", content: sentMessage },
          { role: "assistant", content: result.answer, sources: result.sources || [], media: result.media || [], suggestions: result.suggestions || [] },
        ]);
      }
      await loadConversations();
    }
  }

  async function handleChat(event) {
    event.preventDefault();
    await sendTestChatMessage(chatMessage);
  }

  async function handleBulkReindexDocuments() {
    if (!selectedCompany || selectedDocumentIds.length === 0) return;
    const result = await runTask(
      "documents",
      async () => {
        const failures = [];
        for (const documentId of selectedDocumentIds) {
          try {
            await api.documents.reindex(selectedCompany._id, documentId);
          } catch (err) {
            if (!(err.status === 409 && err.data?.duplicate)) failures.push(err);
          }
        }
        if (failures.length) {
          throw new Error(`${failures.length} document reindex operation(s) failed`);
        }
        return true;
      },
      `${selectedDocumentIds.length} document${selectedDocumentIds.length === 1 ? "" : "s"} reindexed`
    );
    if (result) {
      setSelectedDocumentIds([]);
      await loadDocuments();
    }
  }

  async function handleDocumentActive(document) {
    const result = await runTask(
      "documents",
      () => api.documents.setActive(
        selectedCompany._id,
        document._id,
        !document.isActive
      ),
      document.isActive ? "Document deactivated" : "Document activated"
    );
    if (result) await loadDocuments();
  }

  async function handleReindexAllDocuments() {
    if (!selectedCompany || documents.length === 0) return;
    const ok = window.confirm(
      `Reindex all ${documents.length} uploaded PDFs for ${selectedCompany.name}? They will be processed one by one and this may take several minutes.`
    );
    if (!ok) return;

    const result = await runTask(
      "reindexAll",
      async () => {
        const results = [];
        for (const [index, document] of documents.entries()) {
          setReindexProgress({
            current: index + 1,
            total: documents.length,
            fileName: document.originalName,
          });
          try {
            const updated = await api.documents.reindex(selectedCompany._id, document._id);
            results.push({
              documentId: document._id,
              documentName: document.originalName,
              status: "indexed",
              chunksIndexed: updated.chunksIndexed || 0,
              error: "",
            });
          } catch (err) {
            results.push({
              documentId: document._id,
              documentName: document.originalName,
              status: err.status === 409 && err.data?.duplicate ? "skipped" : "failed",
              chunksIndexed: 0,
              error: err.data?.detail || err.message || "Reindex failed",
            });
          }
        }
        return {
          indexedCount: results.filter((item) => item.status === "indexed").length,
          skippedCount: results.filter((item) => item.status === "skipped").length,
          failedCount: results.filter((item) => item.status === "failed").length,
          results,
        };
      }
    );
    setReindexProgress(null);
    if (!result) return;

    const summary = [
      `${result.indexedCount} reindexed`,
      result.skippedCount ? `${result.skippedCount} duplicates skipped` : "",
    ].filter(Boolean).join(", ");
    setNotice(summary || "Reindex completed");
    if (result.failedCount) {
      const failed = result.results
        .filter((item) => item.status === "failed")
        .map((item) => `${item.documentName}: ${item.error}`)
        .join("; ");
      setError(`${result.failedCount} document${result.failedCount === 1 ? "" : "s"} failed. ${failed}`);
    }
    await loadDocuments();
  }

  function handleNewChatSession() {
    setChatSessionId("");
    setChatResult(null);
    setChatMessages([]);
    setChatMessage("");
  }

  async function handleConversationSearch(event) {
    event.preventDefault();
    setSelectedConversation(null);
    await loadConversations(selectedId, conversationSearch.trim());
  }

  async function clearConversationSearch() {
    setConversationSearch("");
    setSelectedConversation(null);
    await loadConversations(selectedId, "");
  }

  async function handleOpenConversation(sessionId) {
    if (!selectedCompany) return;
    const result = await runTask("conversations", () =>
      api.chat.history(selectedCompany._id, sessionId)
    );
    if (result) setSelectedConversation(result);
  }

  async function handleCreateAdmin(event) {
    event.preventDefault();
    const payload = {
      name: adminForm.name.trim(),
      email: adminForm.email.trim(),
      password: adminForm.password,
      role: adminForm.role,
      companyId: adminForm.role === "company_admin" ? adminForm.companyId : null,
    };
    const result = await runTask("admins", () => api.adminUsers.create(payload), "Admin user created");
    if (result) {
      setAdminForm(emptyAdminForm);
      await loadAdminUsers();
    }
  }

  async function handleToggleAdmin(admin) {
    const result = await runTask(
      "admins",
      () => api.adminUsers.update(admin._id, { isActive: !admin.isActive }),
      "Admin status updated"
    );
    if (result) await loadAdminUsers();
  }

  async function handleDeleteAdmin(admin) {
    const ok = window.confirm(`Delete admin ${admin.email}?`);
    if (!ok) return;
    const result = await runTask("admins", () => api.adminUsers.remove(admin._id), "Admin user deleted");
    if (result) await loadAdminUsers();
  }

  async function handleBackupDownload() {
    const suggestedName = `rag-system-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    setBackupProgress({ bytes: 0, stage: "Preparing server snapshot..." });
    if (window.showSaveFilePicker) {
      let fileHandle;
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: "Pentarix AI Assistant backup", accept: { "application/zip": [".zip"] } }],
        });
      } catch (error) {
        setBackupProgress(null);
        if (error.name === "AbortError") return;
        setError(error.message || "Could not choose a backup location");
        return;
      }
      const bytes = await runTask("backupDownload", () =>
        api.backups.downloadToFile(fileHandle, (received) =>
          setBackupProgress({ bytes: received, stage: "Downloading directly to disk" })
        )
      );
      setBackupProgress(null);
      if (bytes !== null && bytes !== undefined) setNotice("Full backup downloaded");
      return;
    }

    const blob = await runTask("backupDownload", () => api.backups.download());
    setBackupProgress(null);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice("Full backup downloaded");
  }

  async function handleBackupRestore(event) {
    event.preventDefault();
    if (!backupFile) {
      setError("Choose a backup ZIP first");
      return;
    }
    const confirmed = window.confirm(
      "Restore this backup? Current database records and uploaded PDFs will be replaced. Do not close this page while indexes rebuild."
    );
    if (!confirmed) return;
    const result = await runTask(
      "backupRestore",
      () => api.backups.restore(backupFile, restoreConfirmation),
      "Backup and existing index restored"
    );
    if (result) {
      setBackupFile(null);
      setRestoreConfirmation("");
      setNotice(result.message);
      window.setTimeout(() => window.location.reload(), 2500);
    }
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] text-slate-600">
        <Loader2 className="mr-2 animate-spin" size={18} />
        Loading
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        loading={loading}
        error={error}
        handleLogin={handleLogin}
      />
    );
  }

  return (
    <AdminShell
      currentUser={currentUser}
      health={health}
      loading={loading}
      activeNavItems={activeNavItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
      isSuperAdmin={isSuperAdmin}
      selectedCompany={selectedCompany}
      backToSuperAdmin={backToSuperAdmin}
      loadHealth={loadHealth}
      handleLogout={handleLogout}
    >

      {showCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/40">
          <section className="w-full max-w-lg overflow-hidden bg-white border shadow-2xl rounded-2xl border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Plus size={18} />
                <h2 className="font-semibold text-slate-950">Add seller business</h2>
              </div>
              <IconButton title="Close" onClick={() => setShowCompanyModal(false)}>
                <XCircle size={16} />
              </IconButton>
            </div>
            <form className="p-4 space-y-3" onSubmit={handleCreateCompany}>
              <Field label="Name">
                <TextInput
                  value={companyForm.name}
                  onChange={(event) =>
                    setCompanyForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Acme Store"
                  required
                />
              </Field>
              <Field label="Slug optional">
                <TextInput
                  value={companyForm.slug}
                  onChange={(event) =>
                    setCompanyForm((current) => ({ ...current, slug: event.target.value }))
                  }
                  placeholder="acme-store"
                />
              </Field>
              <Field label="Description">
                <TextArea
                  value={companyForm.description}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Customer support knowledge base"
                />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <SecondaryButton onClick={() => setShowCompanyModal(false)}>Cancel</SecondaryButton>
                <PrimaryButton type="submit" disabled={loading.companies}>
                  {loading.companies ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  Create
                </PrimaryButton>
              </div>
            </form>
          </section>
        </div>
      )}

      {showWidgetPreview && selectedCompany && widgetApiKeyInput.trim() && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-slate-950/55">
          <section className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} />
                <div>
                  <h2 className="font-semibold text-slate-950">Test Website Widget</h2>
                  <p className="text-xs text-slate-500">This is how the chatbot opens on a customer website.</p>
                </div>
              </div>
              <IconButton title="Close" onClick={() => setShowWidgetPreview(false)}>
                <XCircle size={16} />
              </IconButton>
            </div>
            <div className="relative flex-1 min-h-0 p-6 bg-slate-100">
              <div className="min-h-[460px] rounded border border-slate-200 bg-white p-6 shadow-sm">
                <h1 className="text-2xl font-bold text-slate-950">{selectedCompany.name}</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Example customer website page. Click the floating chat button in the bottom-right corner.
                </p>
                <div className="grid gap-3 mt-8 md:grid-cols-2">
                  <div className="p-4 border rounded border-slate-200 bg-slate-50">
                    <div className="text-sm font-semibold text-slate-900">Knowledge support</div>
                    <p className="mt-1 text-sm text-slate-500">Ask questions from uploaded documents.</p>
                  </div>
                  <div className="p-4 border rounded border-slate-200 bg-slate-50">
                    <div className="text-sm font-semibold text-slate-900">Website embed</div>
                    <p className="mt-1 text-sm text-slate-500">This preview uses the public widget API key.</p>
                  </div>
                </div>
              </div>
              {widgetPreviewOpen && (
              <div className="absolute bottom-24 right-6 flex h-[560px] w-[380px] max-w-[calc(100%-48px)] flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-2xl">
                <div className="px-4 py-3 text-white" style={{ backgroundColor: widgetThemeForm.headerColor }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold">{selectedCompany.name} Support</div>
                      <div className="text-xs text-slate-300">Widget test mode</div>
                    </div>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs text-white border rounded border-white/20"
                      onClick={() => setWidgetPreviewOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 p-4 space-y-3 overflow-y-auto bg-slate-50">
                  {widgetTestMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={classNames(
                        "max-w-[86%] rounded px-3 py-2 text-sm leading-6",
                        message.role === "user"
                          ? "ml-auto text-white"
                          : "border border-slate-200 bg-white text-slate-800"
                      )}
                      style={
                        message.role === "user"
                          ? { backgroundColor: widgetThemeForm.sendButtonColor }
                          : undefined
                      }
                    >
                      <FormattedAnswer text={message.content} />
                      {message.media?.length > 0 && (
                        <div className="mt-3 grid gap-2">
                          {message.media.map((item) => (
                            <img key={item.url} src={item.url} alt={item.altText || "Supporting document image"} className="max-h-52 w-full rounded-xl border border-slate-200 bg-white object-contain" loading="lazy" />
                          ))}
                        </div>
                      )}
                      {message.sources?.length > 0 && (
                        <div className="pt-2 mt-2 text-xs border-t border-slate-200 text-slate-500">
                          Sources: {sourceSummary(message.sources)}
                        </div>
                      )}
                      {message.role === "assistant" && message.suggestions?.length > 0 && (
                        <div className="grid gap-2 mt-3">
                          {message.suggestions.map((suggestion, suggestionIndex) => (
                            <button
                              key={`${suggestion.label}-${suggestionIndex}`}
                              type="button"
                              onClick={() => sendWidgetTestMessage(suggestion.message, suggestion.label)}
                              disabled={loading.widgetTest}
                              className="px-3 py-2 text-xs leading-5 text-left border rounded border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-500 hover:bg-slate-100 disabled:opacity-50"
                            >
                              {suggestion.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {loading.widgetTest && (
                    <div className="flex w-16 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm" aria-label="Assistant is typing">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                    </div>
                  )}
                </div>
                <form className="flex gap-2 p-3 bg-white border-t border-slate-200" onSubmit={handleWidgetTestChat}>
                  <input
                    className="flex-1 min-w-0 px-3 text-sm border rounded outline-none border-slate-200 focus:border-slate-500"
                    value={widgetTestMessage}
                    onChange={(event) => setWidgetTestMessage(event.target.value)}
                    placeholder="Type test message"
                  />
                  <button
                    type="submit"
                    className="px-4 text-sm font-semibold text-white rounded"
                    style={{ backgroundColor: widgetThemeForm.sendButtonColor }}
                    disabled={loading.widgetTest}
                  >
                    {loading.widgetTest ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                  </button>
                </form>
              </div>
              )}
              <button
                type="button"
                onClick={() => setWidgetPreviewOpen((value) => !value)}
                className="absolute flex items-center justify-center w-16 h-16 text-white transition rounded-full shadow-2xl bottom-6 right-6"
                style={{ backgroundColor: widgetThemeForm.launcherColor }}
                title="Open chat"
                aria-label="Open chat"
              >
                {renderLauncherIcon(25)}
              </button>
            </div>
          </section>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5">
          {false && isSuperAdmin && !selectedCompany && activeSection === "companies" && (
          <section className="bg-white border rounded border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Building2 size={18} />
                <h2 className="font-semibold text-slate-950">Companies</h2>
              </div>
              <IconButton title="Refresh companies" onClick={loadCompanies}>
                <RefreshCcw size={16} />
              </IconButton>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2 scrollbar-thin">
              {companies.length === 0 ? (
                <p className="px-2 py-6 text-sm text-slate-500">No companies yet.</p>
              ) : (
                companies.map((company) => (
                  <button
                    type="button"
                    key={company._id}
                    onClick={() => openCompanyDashboard(company._id)}
                    className={classNames(
                      "mb-1 w-full rounded px-3 py-3 text-left transition",
                      selectedId === company._id
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold">{company.name}</span>
                      {company.isActive ? (
                        <CheckCircle2 className="mt-0.5 shrink-0" size={15} />
                      ) : (
                        <XCircle className="mt-0.5 shrink-0" size={15} />
                      )}
                    </div>
                    <div
                      className={classNames(
                        "mt-1 truncate text-xs",
                        selectedId === company._id ? "text-slate-300" : "text-slate-500"
                      )}
                    >
                      {company.slug}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
          )}

          {isSuperAdmin && !selectedCompany && activeSection === "companies" && (
          <section className="p-4 bg-white border rounded border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Plus size={18} />
              <h2 className="font-semibold text-slate-950">New Company</h2>
            </div>
            <form className="space-y-3" onSubmit={handleCreateCompany}>
              <Field label="Name">
                <TextInput
                  value={companyForm.name}
                  onChange={(event) =>
                    setCompanyForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Acme Support"
                  required
                />
              </Field>
              <Field label="Slug optional">
                <TextInput
                  value={companyForm.slug}
                  onChange={(event) =>
                    setCompanyForm((current) => ({ ...current, slug: event.target.value }))
                  }
                  placeholder="acme-support"
                />
              </Field>
              <Field label="Description">
                <TextArea
                  value={companyForm.description}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Customer support knowledge base"
                />
              </Field>
              <PrimaryButton type="submit" className="w-full" disabled={loading.companies}>
                {loading.companies ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                Create
              </PrimaryButton>
            </form>
          </section>
          )}
        <section className="space-y-5">
          {(notice || error) && (
            <div
              className={classNames(
                    "rounded-xl border px-4 py-3 text-sm shadow-sm",
                error
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              )}
            >
              {error || notice}
            </div>
          )}

          {isSuperAdmin &&
          !selectedCompany &&
          activeSection !== "admins" &&
          activeSection !== "backups" ? (
            <>
              {activeSection === "dashboard" && (
                <section className="grid gap-4 md:grid-cols-3">
                  <div className="p-5 bg-white border shadow-sm rounded-2xl border-slate-200">
                    <div className="text-sm font-semibold text-slate-500">Seller businesses</div>
                    <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{companies.length}</div>
                  </div>
                  <div className="p-5 bg-white border shadow-sm rounded-2xl border-slate-200">
                    <div className="text-sm font-semibold text-slate-500">Admins</div>
                    <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{adminUsers.length}</div>
                  </div>
                  <div className="p-5 bg-white border shadow-sm rounded-2xl border-slate-200">
                    <div className="text-sm font-semibold text-slate-500">Platform health</div>
                    <div className="mt-2"><StatusBadge status={health?.mongodb || "unknown"} /></div>
                  </div>
                </section>
              )}
              {activeSection === "dashboard" && (
                <section className="overflow-hidden bg-white border shadow-sm rounded-2xl border-slate-200">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Building2 size={18} />
                      <h2 className="font-semibold text-slate-950">Seller businesses</h2>
                    </div>
                    <SecondaryButton onClick={() => setActiveSection("companies")}>
                      <Plus size={16} />
                      Manage
                    </SecondaryButton>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {companies.map((company) => (
                      <button
                        type="button"
                        key={company._id}
                        onClick={() => openCompanyDashboard(company._id)}
                        className="p-4 text-left transition bg-white border rounded-xl border-slate-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-950">{company.name}</div>
                            <div className="mt-1 text-sm text-slate-500">{company.slug}</div>
                          </div>
                          <StatusBadge status={company.isActive ? "active" : "inactive"} />
                        </div>
                        <p className="mt-3 text-sm line-clamp-2 text-slate-600">
                          {company.description || "No description"}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {activeSection === "companies" && (
                <section className="overflow-hidden bg-white border shadow-sm rounded-2xl border-slate-200">
                  <div className="flex flex-col gap-3 px-4 py-3 border-b border-slate-200 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 size={18} />
                      <h2 className="font-semibold text-slate-950">Seller businesses</h2>
                    </div>
                    <div className="flex gap-2">
                      <IconButton title="Refresh companies" onClick={loadCompanies}>
                        <RefreshCcw size={16} />
                      </IconButton>
                      <PrimaryButton onClick={() => setShowCompanyModal(true)}>
                        <Plus size={16} />
                        Add business
                      </PrimaryButton>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm divide-y divide-slate-200">
                      <thead className="text-xs font-semibold tracking-wide text-left uppercase bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Company</th>
                          <th className="px-4 py-3">Slug</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Created</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {companies.map((company) => (
                          <tr key={company._id}>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{company.name}</div>
                              <div className="max-w-md text-xs truncate text-slate-500">
                                {company.description || "No description"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{company.slug}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={company.isActive ? "active" : "inactive"} />
                            </td>
                            <td className="px-4 py-3 text-slate-600">{formatDate(company.createdAt)}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end">
                                <SecondaryButton onClick={() => openCompanyDashboard(company._id)}>
                                  Open
                                </SecondaryButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          ) : !selectedCompany &&
            !(isSuperAdmin && ["admins", "backups"].includes(activeSection)) ? (
            <div className="p-10 text-center bg-white border rounded border-slate-200">
              <Building2 className="mx-auto mb-3 text-slate-400" size={34} />
              <h2 className="text-lg font-semibold text-slate-950">Select or create a company</h2>
            </div>
          ) : (
            <>
              {activeSection === "dashboard" && (
                <DashboardOverview
                  company={selectedCompany}
                  documents={documents}
                  conversations={conversations}
                  setActiveSection={setActiveSection}
                />
              )}

              {["orders", "messenger"].includes(activeSection) && (
                <CommercePanel companyId={selectedCompany._id} section={activeSection} />
              )}

              {(activeSection === "settings" || activeSection === "companies") && (
              <section className="p-4 bg-white border rounded border-slate-200">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold text-slate-950">{selectedCompany.name}</h2>
                      <StatusBadge status={selectedCompany.isActive ? "active" : "inactive"} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{selectedCompany.description || "No description"}</p>
                    <p className="mt-2 text-xs text-slate-400">ID: {selectedCompany._id}</p>
                    <div className="p-3 mt-4 border rounded border-slate-200 bg-slate-50">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">Widget API Key</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Current key: {selectedCompany.widgetApiKeyPreview || "Not generated"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <SecondaryButton onClick={handleGenerateWidgetApiKey}>
                            <RefreshCcw size={16} />
                            Generate / Rotate
                          </SecondaryButton>
                          <SecondaryButton
                            onClick={copyWidgetSnippet}
                          >
                            Copy Embed
                          </SecondaryButton>
                          <SecondaryButton
                            onClick={() => {
                              setWidgetPreviewOpen(false);
                              setShowWidgetPreview(true);
                            }}
                            disabled={!widgetApiKeyInput.trim()}
                          >
                            <MessageSquare size={16} />
                            Test Widget
                          </SecondaryButton>
                        </div>
                      </div>
                      {widgetKeyResult?.apiKey && (
                        <div className="p-3 mt-3 border rounded border-amber-200 bg-amber-50">
                          <div className="text-xs font-semibold tracking-wide uppercase text-amber-700">
                            Copy this key now
                          </div>
                          <code className="block mt-2 text-xs break-all text-amber-900">
                            {widgetKeyResult.apiKey}
                          </code>
                        </div>
                      )}
                      <div className="mt-3">
                        <Field label="Widget API key for test/embed">
                          <TextInput
                            value={widgetApiKeyInput}
                            onChange={(event) => setWidgetApiKeyInput(event.target.value)}
                            placeholder="Paste generated widget API key here"
                          />
                        </Field>
                        <p className="mt-1 text-xs text-slate-500">
                          The full key is shown only once after generation. Paste it here anytime to test or copy embed code.
                        </p>
                        
                        <div className="mt-3">
  <Field label="Embed code type">
    <select
      className="w-full h-10 px-3 text-sm transition bg-white border rounded outline-none border-slate-200 text-slate-900 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      value={widgetEmbedMode}
      onChange={(event) => setWidgetEmbedMode(event.target.value)}
    >
      {widgetEmbedModeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </Field>
  <p className="mt-1 text-xs text-slate-500">
    Select the login method needed by the company website before copying the embed code.
  </p>
</div>

<div className="pt-4 mt-4 border-t border-slate-200">
  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div>
      <div className="text-sm font-semibold text-slate-900">Widget Theme</div>
      <p className="mt-1 text-xs text-slate-500">
        Choose colors for the widget header, send button, and floating launcher.
      </p>
    </div>

    <div className="flex flex-wrap gap-2">
      <SecondaryButton onClick={handleSaveWidgetTheme} disabled={loading.companies}>
        {loading.companies ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          <CheckCircle2 size={16} />
        )}
        Save Theme
      </SecondaryButton>

      <SecondaryButton onClick={handleResetWidgetTheme}>
        Reset
      </SecondaryButton>
    </div>
  </div>

  <div className="grid gap-3 mt-3 md:grid-cols-3">
    <Field label="Header color">
      <input
        type="color"
        className="w-full h-10 p-1 bg-white border rounded border-slate-200"
        value={widgetThemeForm.headerColor}
        onChange={(event) =>
          setWidgetThemeForm((current) => ({
            ...current,
            headerColor: event.target.value,
          }))
        }
      />
    </Field>

    <Field label="Send button color">
      <input
        type="color"
        className="w-full h-10 p-1 bg-white border rounded border-slate-200"
        value={widgetThemeForm.sendButtonColor}
        onChange={(event) =>
          setWidgetThemeForm((current) => ({
            ...current,
            sendButtonColor: event.target.value,
          }))
        }
      />
    </Field>

    <Field label="Launcher color">
      <input
        type="color"
        className="w-full h-10 p-1 bg-white border rounded border-slate-200"
        value={widgetThemeForm.launcherColor}
        onChange={(event) =>
          setWidgetThemeForm((current) => ({
            ...current,
            launcherColor: event.target.value,
          }))
        }
      />
    </Field>
  </div>

  <div className="grid gap-3 mt-3 md:grid-cols-[minmax(0,1fr)_220px]">
    <Field label="Launcher icon">
      <select
        className="w-full h-10 px-3 text-sm transition bg-white border rounded outline-none border-slate-200 text-slate-900 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        value={widgetThemeForm.launcherIcon}
        onChange={(event) =>
          setWidgetThemeForm((current) => ({
            ...current,
            launcherIcon: event.target.value,
          }))
        }
      >
        {widgetLauncherIconOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>

    <div>
      <span className="block mb-1 text-xs font-semibold tracking-wide uppercase text-slate-500">
        Launcher preview
      </span>

      <div
        className="flex items-center justify-center w-12 h-12 text-white rounded-full shadow"
        style={{ backgroundColor: widgetThemeForm.launcherColor }}
      >
        {renderLauncherIcon(22)}
      </div>
    </div>
  </div>
</div>

                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton onClick={() => setEditingCompany((value) => !value)}>
                      <Pencil size={16} />
                      Edit
                    </SecondaryButton>
                    <SecondaryButton onClick={handleToggleCompany}>
                      {selectedCompany.isActive ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                      {selectedCompany.isActive ? "Disable" : "Enable"}
                    </SecondaryButton>
                    {isSuperAdmin && (
                    <SecondaryButton
                      className="text-rose-700 hover:bg-rose-50"
                      onClick={handleDeleteCompany}
                    >
                      <Trash2 size={16} />
                      Delete
                    </SecondaryButton>
                    )}
                  </div>
                </div>

                {editingCompany && (
                  <form className="grid gap-3 pt-4 mt-4 border-t border-slate-200 lg:grid-cols-2" onSubmit={handleUpdateCompany}>
                    <Field label="Name">
                      <TextInput
                        value={companyForm.name}
                        onChange={(event) =>
                          setCompanyForm((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Slug">
                      <TextInput value={companyForm.slug} disabled />
                    </Field>
                    <div className="lg:col-span-2">
                      <Field label="Description">
                        <TextArea
                          value={companyForm.description}
                          onChange={(event) =>
                            setCompanyForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <div className="flex gap-2 lg:col-span-2">
                      <PrimaryButton type="submit" disabled={loading.companies}>
                        <CheckCircle2 size={16} />
                        Save
                      </PrimaryButton>
                      <SecondaryButton onClick={() => setEditingCompany(false)}>Cancel</SecondaryButton>
                    </div>
                  </form>
                )}
              </section>
              )}

              {activeSection === "whatsapp" && (
                <section className="bg-white border rounded border-slate-200">
                  <div className="flex flex-col gap-3 px-4 py-3 border-b border-slate-200 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={18} />
                      <h2 className="font-semibold text-slate-950">WhatsApp Integration</h2>
                      {whatsappIntegration && (
                        <StatusBadge status={whatsappIntegration.isActive ? "active" : "inactive"} />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <IconButton title="Refresh WhatsApp integration" onClick={() => loadWhatsAppIntegration()}>
                        <RefreshCcw size={16} />
                      </IconButton>
                      <SecondaryButton
                        onClick={handleValidateWhatsAppIntegration}
                        disabled={!whatsappIntegration || loading.whatsapp}
                      >
                        {loading.whatsapp ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                        Validate
                      </SecondaryButton>
                      {whatsappIntegration && (
                        <SecondaryButton
                          className="text-rose-700 hover:bg-rose-50"
                          onClick={handleDeleteWhatsAppIntegration}
                          disabled={loading.whatsapp}
                        >
                          <Trash2 size={16} />
                          Delete
                        </SecondaryButton>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <form className="space-y-4" onSubmit={handleSaveWhatsAppIntegration}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="WhatsApp phone number ID">
                          <TextInput
                            value={whatsappForm.phoneNumberId}
                            onChange={(event) =>
                              setWhatsappForm((current) => ({
                                ...current,
                                phoneNumberId: event.target.value,
                              }))
                            }
                            placeholder="1175322778994139"
                            required
                          />
                        </Field>
                        <Field label="Status">
                          <label className="flex items-center h-10 gap-3 px-3 text-sm bg-white border rounded border-slate-200 text-slate-700">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300"
                              checked={whatsappForm.isActive}
                              onChange={(event) =>
                                setWhatsappForm((current) => ({
                                  ...current,
                                  isActive: event.target.checked,
                                }))
                              }
                            />
                            Active for this company
                          </label>
                        </Field>
                      </div>
                      <Field label={whatsappIntegration ? "New access token optional" : "Access token"}>
                        <TextArea
                          value={whatsappForm.accessToken}
                          onChange={(event) =>
                            setWhatsappForm((current) => ({
                              ...current,
                              accessToken: event.target.value,
                            }))
                          }
                          placeholder={
                            whatsappIntegration
                              ? "Paste a new Meta access token only when rotating"
                              : "Paste Meta WhatsApp Cloud API access token"
                          }
                          required={!whatsappIntegration}
                        />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <PrimaryButton type="submit" disabled={loading.whatsapp}>
                          {loading.whatsapp ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                          {whatsappIntegration ? "Update Integration" : "Save Integration"}
                        </PrimaryButton>
                        <SecondaryButton
                          onClick={() => {
                            setWhatsappForm({
                              phoneNumberId: whatsappIntegration?.phoneNumberId || "",
                              accessToken: "",
                              isActive: whatsappIntegration?.isActive !== false,
                            });
                            setWhatsappValidation(null);
                          }}
                        >
                          Reset
                        </SecondaryButton>
                      </div>
                    </form>

                    <aside className="space-y-3">
                      <div className="p-4 border rounded border-slate-200 bg-slate-50">
                        <div className="text-sm font-semibold text-slate-900">Saved credential</div>
                        <dl className="mt-3 space-y-3 text-sm">
                          <div>
                            <dt className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                              Phone number ID
                            </dt>
                            <dd className="mt-1 break-all text-slate-800">
                              {whatsappIntegration?.phoneNumberId || "Not configured"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                              Token preview
                            </dt>
                            <dd className="mt-1 text-slate-800">
                              {whatsappIntegration?.accessTokenLast4
                                ? `Ends with ${whatsappIntegration.accessTokenLast4}`
                                : "Not saved"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                              Updated
                            </dt>
                            <dd className="mt-1 text-slate-800">
                              {formatDate(whatsappIntegration?.updatedAt)}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      {whatsappValidation && (
                        <div className="p-4 text-sm border rounded border-emerald-200 bg-emerald-50 text-emerald-800">
                          <div className="font-semibold">Validation passed</div>
                          <div className="mt-2 text-xs leading-5">
                            {whatsappValidation.metaPhoneNumber?.display_phone_number ||
                              whatsappValidation.metaPhoneNumber?.id ||
                              whatsappValidation.phoneNumberId}
                          </div>
                          {whatsappValidation.metaPhoneNumber?.quality_rating && (
                            <div className="mt-1 text-xs">
                              Quality: {whatsappValidation.metaPhoneNumber.quality_rating}
                            </div>
                          )}
                        </div>
                      )}
                    </aside>
                  </div>
                </section>
              )}



              {activeSection === "sms" && (
                <section className="bg-white border rounded border-slate-200">
                  <div className="flex flex-col gap-3 px-4 py-3 border-b border-slate-200 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={18} />
                      <h2 className="font-semibold text-slate-950">SMS Integration</h2>
                      {smsIntegration && (
                        <StatusBadge status={smsIntegration.isActive ? "active" : "inactive"} />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <IconButton title="Refresh SMS integration" onClick={() => loadSmsIntegration()}>
                        <RefreshCcw size={16} />
                      </IconButton>
                      <SecondaryButton
                        onClick={handleValidateSmsIntegration}
                        disabled={!smsIntegration || loading.sms}
                      >
                        {loading.sms ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                        Validate
                      </SecondaryButton>
                      {smsIntegration && (
                        <SecondaryButton
                          className="text-rose-700 hover:bg-rose-50"
                          onClick={handleDeleteSmsIntegration}
                          disabled={loading.sms}
                        >
                          <Trash2 size={16} />
                          Delete
                        </SecondaryButton>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <form className="space-y-4" onSubmit={handleSaveSmsIntegration}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Twilio Account SID">
                          <TextInput
                            value={smsForm.accountSid}
                            onChange={(event) =>
                              setSmsForm((current) => ({
                                ...current,
                                accountSid: event.target.value,
                              }))
                            }
                            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            required
                          />
                        </Field>
                        <Field label="Twilio phone number">
                          <TextInput
                            value={smsForm.phoneNumber}
                            onChange={(event) =>
                              setSmsForm((current) => ({
                                ...current,
                                phoneNumber: event.target.value,
                              }))
                            }
                            placeholder="+14161234567"
                            required
                          />
                        </Field>
                      </div>
                      <Field label="Status">
                        <label className="flex items-center h-10 gap-3 px-3 text-sm bg-white border rounded border-slate-200 text-slate-700">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300"
                            checked={smsForm.isActive}
                            onChange={(event) =>
                              setSmsForm((current) => ({
                                ...current,
                                isActive: event.target.checked,
                              }))
                            }
                          />
                          Active for this company
                        </label>
                      </Field>
                      <Field label={smsIntegration ? "New Auth Token optional" : "Twilio Auth Token"}>
                        <TextArea
                          value={smsForm.authToken}
                          onChange={(event) =>
                            setSmsForm((current) => ({
                              ...current,
                              authToken: event.target.value,
                            }))
                          }
                          placeholder={
                            smsIntegration
                              ? "Paste a new Twilio Auth Token only when rotating"
                              : "Paste Twilio Auth Token"
                          }
                          required={!smsIntegration}
                        />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <PrimaryButton type="submit" disabled={loading.sms}>
                          {loading.sms ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                          {smsIntegration ? "Update Integration" : "Save Integration"}
                        </PrimaryButton>
                        <SecondaryButton
                          onClick={() => {
                            setSmsForm({
                              accountSid: smsIntegration?.accountSid || "",
                              authToken: "",
                              phoneNumber: smsIntegration?.phoneNumber || "",
                              isActive: smsIntegration?.isActive !== false,
                            });
                            setSmsValidation(null);
                          }}
                        >
                          Reset
                        </SecondaryButton>
                      </div>
                    </form>

                    <aside className="space-y-3">
                      <div className="p-4 border rounded border-slate-200 bg-slate-50">
                        <div className="text-sm font-semibold text-slate-900">Saved credential</div>
                        <dl className="mt-3 space-y-3 text-sm">
                          <div>
                            <dt className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                              Account SID
                            </dt>
                            <dd className="mt-1 break-all text-slate-800">
                              {smsIntegration?.accountSid || "Not configured"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                              Phone number
                            </dt>
                            <dd className="mt-1 break-all text-slate-800">
                              {smsIntegration?.phoneNumber || "Not configured"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                              Auth token preview
                            </dt>
                            <dd className="mt-1 text-slate-800">
                              {smsIntegration?.authTokenLast4
                                ? `Ends with ${smsIntegration.authTokenLast4}`
                                : "Not saved"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                              Incoming SMS webhook
                            </dt>
                            <dd className="mt-1 break-all text-slate-800">
                              {`${api.baseUrl}/api/sms/webhook`}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                              Status callback URL
                            </dt>
                            <dd className="mt-1 break-all text-slate-800">
                              {`${api.baseUrl}/api/sms/status`}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                              Updated
                            </dt>
                            <dd className="mt-1 text-slate-800">
                              {formatDate(smsIntegration?.updatedAt)}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      {smsValidation && (
                        <div className="p-4 text-sm border rounded border-emerald-200 bg-emerald-50 text-emerald-800">
                          <div className="font-semibold">Validation passed</div>
                          <div className="mt-2 text-xs leading-5">
                            {smsValidation.phoneNumber || smsValidation.twilioPhoneNumberSid || smsValidation.accountSid}
                          </div>
                          {smsValidation.friendlyName && (
                            <div className="mt-1 text-xs">Name: {smsValidation.friendlyName}</div>
                          )}
                        </div>
                      )}
                    </aside>
                  </div>
                </section>
              )}

              {isSuperAdmin && activeSection === "admins" && (
                <section className="bg-white border rounded border-slate-200">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Building2 size={18} />
                      <h2 className="font-semibold text-slate-950">Admin Users</h2>
                    </div>
                    <IconButton title="Refresh admins" onClick={loadAdminUsers}>
                      <RefreshCcw size={16} />
                    </IconButton>
                  </div>
                  <div className="grid gap-4 p-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <form className="space-y-3" onSubmit={handleCreateAdmin}>
                      <Field label="Name">
                        <TextInput
                          value={adminForm.name}
                          onChange={(event) => setAdminForm((current) => ({ ...current, name: event.target.value }))}
                          required
                        />
                      </Field>
                      <Field label="Email">
                        <TextInput
                          type="email"
                          value={adminForm.email}
                          onChange={(event) => setAdminForm((current) => ({ ...current, email: event.target.value }))}
                          required
                        />
                      </Field>
                      <Field label="Password">
                        <TextInput
                          type="password"
                          value={adminForm.password}
                          onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))}
                          required
                        />
                      </Field>
                      <Field label="Role">
                        <select
                          className="w-full h-10 px-3 text-sm bg-white border rounded border-slate-200"
                          value={adminForm.role}
                          onChange={(event) =>
                            setAdminForm((current) => ({ ...current, role: event.target.value }))
                          }
                        >
                          <option value="company_admin">Company admin</option>
                          <option value="superadmin">Superadmin</option>
                        </select>
                      </Field>
                      {adminForm.role === "company_admin" && (
                        <Field label="Company">
                          <select
                            className="w-full h-10 px-3 text-sm bg-white border rounded border-slate-200"
                            value={adminForm.companyId}
                            onChange={(event) =>
                              setAdminForm((current) => ({ ...current, companyId: event.target.value }))
                            }
                            required
                          >
                            <option value="">Select company</option>
                            {companies.map((company) => (
                              <option key={company._id} value={company._id}>
                                {company.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      <PrimaryButton type="submit" className="w-full" disabled={loading.admins}>
                        <Plus size={16} />
                        Add Admin
                      </PrimaryButton>
                    </form>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm divide-y divide-slate-200">
                        <thead className="text-xs font-semibold tracking-wide text-left uppercase bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Admin</th>
                            <th className="px-4 py-3">Role</th>
                            <th className="px-4 py-3">Company</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {adminGroups.map(([groupName, admins]) => (
                            <Fragment key={groupName}>
                              <tr key={`${groupName}-group`} className="bg-slate-50">
                                <td className="px-4 py-2 text-xs font-semibold tracking-wide uppercase text-slate-500" colSpan={5}>
                                  {groupName}
                                </td>
                              </tr>
                              {admins.map((admin) => (
                                <tr key={admin._id}>
                                  <td className="px-4 py-3">
                                    <div className="font-semibold text-slate-900">{admin.name}</div>
                                    <div className="text-xs text-slate-500">{admin.email}</div>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">{admin.role}</td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {admin.role === "superadmin"
                                      ? "All companies"
                                      : admin.companyId?.name || admin.companyId || "-"}
                                  </td>
                                  <td className="px-4 py-3">
                                    <StatusBadge status={admin.isActive ? "active" : "inactive"} />
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex justify-end gap-2">
                                      <IconButton title="Toggle admin" onClick={() => handleToggleAdmin(admin)}>
                                        {admin.isActive ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                                      </IconButton>
                                      <IconButton
                                        title="Delete admin"
                                        className="text-rose-700 hover:bg-rose-50"
                                        onClick={() => handleDeleteAdmin(admin)}
                                      >
                                        <Trash2 size={16} />
                                      </IconButton>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}

              {isSuperAdmin && activeSection === "backups" && (
                <section className="grid gap-5 xl:grid-cols-2">
                  {restoreStatus && restoreStatus.status !== "idle" && (
                    <div className="rounded-lg border border-slate-200 bg-white p-4 xl:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">Latest restore</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {restoreStatus.status === "completed" && "Database, PDFs, chunks, and embeddings were restored directly."}
                            {restoreStatus.status === "failed" && (restoreStatus.error || "Index rebuild failed.")}
                          </div>
                        </div>
                        <StatusBadge status={restoreStatus.status} />
                      </div>
                    </div>
                  )}
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white">
                        <Download size={20} />
                      </div>
                      <div>
                        <h2 className="font-semibold text-slate-950">Download full backup</h2>
                        <p className="text-sm text-slate-500">MongoDB, PDFs, and a compact copy of active chunks and embeddings.</p>
                      </div>
                    </div>
                    <p className="mt-5 text-sm leading-6 text-slate-600">
                      Keep this ZIP private. It contains admin accounts, company configuration,
                      integration records, chat history, and source documents. Unused Chroma space
                      from deleted documents is excluded automatically without reindexing.
                    </p>
                    <PrimaryButton
                      className="mt-5"
                      onClick={handleBackupDownload}
                      disabled={loading.backupDownload || loading.backupRestore}
                    >
                      {loading.backupDownload ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                      {loading.backupDownload ? "Preparing backup..." : "Download backup ZIP"}
                    </PrimaryButton>
                    {backupProgress && (
                      <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600" role="status">
                        <div className="font-semibold text-slate-800">{backupProgress.stage}</div>
                        <div className="mt-1 tabular-nums">
                          {(backupProgress.bytes / 1024 / 1024).toFixed(1)} MB received
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-600 text-white">
                        <Upload size={20} />
                      </div>
                      <div>
                        <h2 className="font-semibold text-slate-950">Restore on this server</h2>
                        <p className="text-sm text-slate-500">Restore all data and the existing Chroma index directly.</p>
                      </div>
                    </div>
                    <form className="mt-5 space-y-4" onSubmit={handleBackupRestore}>
                      <Field label="Backup ZIP">
                        <input
                          type="file"
                          accept=".zip,application/zip"
                          onChange={(event) => setBackupFile(event.target.files?.[0] || null)}
                          disabled={loading.backupRestore}
                          className="block w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
                        />
                      </Field>
                      <Field label="Type RESTORE to confirm">
                        <TextInput
                          value={restoreConfirmation}
                          onChange={(event) => setRestoreConfirmation(event.target.value)}
                          placeholder="RESTORE"
                          autoComplete="off"
                          disabled={loading.backupRestore}
                        />
                      </Field>
                      <p className="rounded-md bg-rose-50 p-3 text-sm leading-5 text-rose-700">
                        This replaces the current database, PDFs, chunks, and embeddings. No reindexing is performed.
                      </p>
                      <PrimaryButton
                        type="submit"
                        className="bg-rose-600 hover:bg-rose-700"
                        disabled={loading.backupRestore || loading.backupDownload || restoreConfirmation !== "RESTORE" || !backupFile}
                      >
                        {loading.backupRestore ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                        {loading.backupRestore ? "Restoring backup..." : "Upload and restore"}
                      </PrimaryButton>
                    </form>
                  </div>
                </section>
              )}

              {(activeSection === "documents" || activeSection === "chat") && (
              <div className={classNames(
                "grid gap-4",
                activeSection === "chat" ? "xl:grid-cols-[420px_minmax(0,1fr)]" : "xl:grid-cols-1"
              )}>
                {activeSection === "documents" && (
                <section className="bg-white border rounded border-slate-200">
                  <div className="flex flex-col gap-3 px-4 py-3 border-b border-slate-200 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={18} />
                      <h2 className="font-semibold text-slate-950">Documents</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {documents.length > 0 && (
                        <button
                          type="button"
                          onClick={handleReindexAllDocuments}
                          disabled={loading.reindexAll || loading.documents}
                          className="inline-flex items-center justify-center gap-2 px-3 text-sm font-semibold transition bg-white border rounded shadow-sm h-9 border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loading.reindexAll
                            ? <Loader2 className="animate-spin" size={16} />
                            : <RefreshCcw size={16} />}
                          {loading.reindexAll ? "Reindexing one by one..." : `Reindex all (${documents.length})`}
                        </button>
                      )}
                      {documents.length > 0 && (
                        <button
                          type="button"
                          onClick={handleDeleteAllDocuments}
                          disabled={loading.documents}
                          className="inline-flex items-center justify-center gap-2 px-3 text-sm font-semibold transition bg-white border rounded shadow-sm h-9 border-rose-300 text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={16} />
                          Delete all ({documents.length})
                        </button>
                      )}
                      {selectedDocumentIds.length > 0 && (
                        <button
                          type="button"
                          onClick={handleBulkReindexDocuments}
                          disabled={loading.documents}
                          className="inline-flex items-center justify-center gap-2 px-3 text-sm font-semibold transition bg-white border rounded shadow-sm h-9 border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RefreshCcw size={16} />
                          Reindex selected ({selectedDocumentIds.length})
                        </button>
                      )}
                      {selectedDocumentIds.length > 0 && (
                        <button
                          type="button"
                          onClick={handleBulkDownloadDocuments}
                          disabled={loading.download}
                          className="inline-flex items-center justify-center gap-2 px-3 text-sm font-semibold transition bg-white border rounded shadow-sm h-9 border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loading.download ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                          Download selected ({selectedDocumentIds.length})
                        </button>
                      )}
                      {selectedDocumentIds.length > 0 && (
                        <button
                          type="button"
                          onClick={handleBulkDeleteDocuments}
                          disabled={loading.documents}
                          className="inline-flex items-center justify-center gap-2 px-3 text-sm font-semibold transition bg-white border rounded shadow-sm h-9 border-rose-200 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={16} />
                          Delete selected ({selectedDocumentIds.length})
                        </button>
                      )}
                      <IconButton title="Refresh documents" onClick={() => loadDocuments()}>
                        <RefreshCcw size={16} />
                      </IconButton>
                      <label className={classNames(
                        "inline-flex items-center justify-center gap-2 px-3 text-sm font-semibold text-white transition rounded shadow-sm h-9 bg-slate-900",
                        loading.upload ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-slate-800"
                      )}>
                        {loading.upload ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                        {loading.upload ? "Uploading..." : "Upload PDFs"}
                        <input
                          type="file"
                          accept="application/pdf"
                          multiple
                          className="sr-only"
                          onChange={handleUpload}
                          disabled={loading.upload}
                        />
                      </label>
                      <label className={classNames(
                        "inline-flex items-center justify-center gap-2 px-3 text-sm font-semibold transition bg-white border rounded shadow-sm h-9 border-slate-200 text-slate-700 shadow-slate-200/70",
                        loading.upload ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-slate-50 hover:border-slate-300"
                      )}>
                        {loading.upload ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                        {loading.upload ? "Uploading..." : "Upload folder"}
                        <input
                          type="file"
                          accept="application/pdf"
                          multiple
                          className="sr-only"
                          onChange={handleUpload}
                          disabled={loading.upload}
                          directory=""
                          webkitdirectory=""
                        />
                      </label>
                    </div>
                  </div>
                  {reindexProgress && (
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50" role="status" aria-live="polite">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <div className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                          <Loader2 className="shrink-0 animate-spin" size={16} />
                          <span className="truncate">Reindexing {reindexProgress.fileName}</span>
                        </div>
                        <span className="shrink-0 text-slate-500">
                          {reindexProgress.current} of {reindexProgress.total}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-900 transition-all duration-300"
                          style={{ width: `${(reindexProgress.current / reindexProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {uploadProgress && (
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50" role="status" aria-live="polite">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <div className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                          <Loader2 className="shrink-0 animate-spin" size={16} />
                          <span className="truncate">Uploading and indexing {uploadProgress.fileName}</span>
                        </div>
                        <span className="shrink-0 text-slate-500">
                          {uploadProgress.current} of {uploadProgress.total}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-900 transition-all duration-300"
                          style={{ width: `${((uploadProgress.current - 1) / uploadProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm divide-y divide-slate-200">
                      <thead className="text-xs font-semibold tracking-wide text-left uppercase bg-slate-50 text-slate-500">
                        <tr>
                          <th className="w-12 px-4 py-3">
                            <input
                              type="checkbox"
                              aria-label="Select all documents"
                              checked={documents.length > 0 && selectedDocumentIds.length === documents.length}
                              onChange={toggleAllDocuments}
                              className="w-4 h-4 rounded border-slate-300"
                            />
                          </th>
                          <th className="w-16 px-4 py-3">No.</th>
                          <th className="px-4 py-3">File</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Chunks</th>
                          <th className="px-4 py-3">Updated</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {documents.length === 0 ? (
                          <tr>
                            <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                              No documents uploaded.
                            </td>
                          </tr>
                        ) : (
                          documents.map((document, index) => (
                            <tr key={document._id}>
                              <td className="w-12 px-4 py-3">
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${document.originalName}`}
                                  checked={selectedDocumentIds.includes(document._id)}
                                  onChange={() => toggleDocumentSelection(document._id)}
                                  className="w-4 h-4 rounded border-slate-300"
                                />
                              </td>
                              <td className="w-16 px-4 py-3 font-medium tabular-nums text-slate-500">{index + 1}</td>
                              <td className="max-w-[320px] px-4 py-3">
                                <div className="font-medium truncate text-slate-900">{document.originalName}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Version {document.documentVersion || "1"}
                                </div>
                                {document.duplicateOf && (
                                  <div className="mt-1 text-xs text-amber-700">Exact duplicate</div>
                                )}
                                {document.indexError && (
                                  <div className="mt-1 text-xs truncate text-rose-600">{document.indexError}</div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  <StatusBadge status={document.status} />
                                  <span className={classNames(
                                    "rounded-full px-2 py-0.5 text-xs font-medium",
                                    document.isActive
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-slate-100 text-slate-500"
                                  )}>
                                  {document.isActive ? "active" : "inactive"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{document.chunksIndexed || 0}</td>
                              <td className="px-4 py-3 text-slate-600">{formatDate(document.updatedAt)}</td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-2">
                                  <IconButton
                                    title={document.isActive ? "Deactivate version" : "Activate version"}
                                    onClick={() => handleDocumentActive(document)}
                                  >
                                    {document.isActive ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                                  </IconButton>
                                  <IconButton title="Reindex" onClick={() => handleReindex(document._id)}>
                                    <RefreshCcw size={16} />
                                  </IconButton>
                                  <IconButton
                                    title="Delete document"
                                    className="text-rose-700 hover:bg-rose-50"
                                    onClick={() => handleDeleteDocument(document._id)}
                                  >
                                    <Trash2 size={16} />
                                  </IconButton>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                )}

                {isSuperAdmin && activeSection === "chat" && (
                <section className="mx-auto flex h-[min(760px,calc(100vh-190px))] min-h-[560px] max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Bot size={20} /></span>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-slate-950">Pentarix AI Assistant</h2>
                        <p className="truncate text-xs text-slate-500">{chatSessionId ? `Session ${chatSessionId}` : "New test conversation"}</p>
                      </div>
                    </div>
                    <SecondaryButton type="button" onClick={handleNewChatSession}>New chat</SecondaryButton>
                  </div>

                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#f4f7f6] px-4 py-5 sm:px-6">
                    {chatMessages.length === 0 && (
                      <div className="flex h-full flex-col items-center justify-center text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm"><MessagesSquare size={25} /></span>
                        <h3 className="mt-4 font-semibold text-slate-800">Start a customer conversation</h3>
                        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Test language selection, product discovery, PDF answers and ordering in one continuous chat.</p>
                      </div>
                    )}
                    {chatMessages.length > 0 && (
                      <>
                        {chatMessages.map((message, messageIndex) => (
                          <div
                            key={`${message.role}-${messageIndex}`}
                            className={classNames(
                              "max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
                              message.role === "user"
                                ? "ml-auto rounded-br-md bg-emerald-700 text-white"
                                : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                            )}
                          >
                            <FormattedAnswer text={message.content} />
                            {message.media?.length > 0 && (
                              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                                {message.media.map((item) => (
                                  <img key={item.url} src={item.url} alt={item.altText || "Supporting document image"} className="max-h-64 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain" loading="lazy" />
                                ))}
                              </div>
                            )}
                            {message.sources?.length > 0 && (
                              <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                                {message.sources.map((source, sourceIndex) => (
                                  <div key={`${source.documentId}-${sourceIndex}`} className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                                    <div className="font-semibold text-slate-700">{sourceLabel(source)}</div>
                                    <p className="mt-1 line-clamp-2 leading-5">{source.content}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {message.role === "assistant" && message.suggestions?.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                                {message.suggestions.map((suggestion) => (
                                  <button
                                    key={`${suggestion.label}-${suggestion.message}`}
                                    type="button"
                                    onClick={() => sendTestChatMessage(suggestion.message)}
                                    disabled={loading.chat}
                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-50"
                                  >
                                    {suggestion.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                    {loading.chat && (
                      <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-4 shadow-sm">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                      </div>
                    )}
                    <div ref={chatMessagesEndRef} />
                  </div>

                  <form className="border-t border-slate-200 bg-white p-3 sm:p-4" onSubmit={handleChat}>
                    <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-500/10">
                      <textarea
                        value={chatMessage}
                        onChange={(event) => setChatMessage(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            if (chatMessage.trim()) event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        placeholder="Type a message…"
                        rows={1}
                        className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                      <button type="submit" disabled={loading.chat || !chatMessage.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">
                        {loading.chat ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
                      </button>
                    </div>
                    <p className="mt-2 text-center text-[11px] text-slate-400">Enter to send · Shift + Enter for a new line</p>
                  </form>
                </section>
                )}
              </div>
              )}

              {activeSection === "history" && (
              <section className="bg-white border rounded border-slate-200">
                <div className="flex flex-col gap-3 px-4 py-3 border-b border-slate-200 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-2">
                    <History size={18} />
                    <h2 className="font-semibold text-slate-950">Conversations</h2>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <form className="flex min-w-0 gap-2" onSubmit={handleConversationSearch}>
                      <div className="relative min-w-0 flex-1 sm:w-80">
                        <Search
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={16}
                        />
                        <input
                          className="h-9 w-full rounded border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          value={conversationSearch}
                          onChange={(event) => setConversationSearch(event.target.value)}
                          placeholder="Search email, phone, employee ID, session"
                        />
                      </div>
                      <SecondaryButton type="submit" disabled={loading.conversations}>
                        Search
                      </SecondaryButton>
                      {conversationSearch.trim() && (
                        <SecondaryButton type="button" onClick={clearConversationSearch}>
                          Clear
                        </SecondaryButton>
                      )}
                    </form>
                    <IconButton title="Refresh conversations" onClick={() => loadConversations()}>
                      <RefreshCcw size={16} />
                    </IconButton>
                  </div>
                </div>
                <div className="grid gap-0 md:grid-cols-[340px_minmax(0,1fr)]">
                  <div className="max-h-[380px] overflow-y-auto border-b border-slate-200 p-2 md:border-b-0 md:border-r">
                    {conversations.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">
                        {conversationSearch.trim()
                          ? "No conversations match this search."
                          : "No conversations yet."}
                      </p>
                    ) : (
                      conversations.map((conversation) => (
                        <button
                          type="button"
                          key={conversation._id}
                          onClick={() => handleOpenConversation(conversation.sessionId)}
                          className={classNames(
                            "mb-1 flex w-full items-center gap-3 rounded px-3 py-3 text-left text-sm transition hover:bg-slate-100",
                            selectedConversation?.sessionId === conversation.sessionId && "bg-slate-100"
                          )}
                        >
                          <Search className="shrink-0 text-slate-400" size={16} />
                          <span className="min-w-0">
                            <span className="block font-semibold truncate text-slate-800">
                              {conversation.customerEmail ||
                                conversation.customerPhone ||
                                conversation.customerExternalId ||
                                conversation.sessionId}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {conversation.customerAuthProvider || conversation.channel || "web"} ·{" "}
                              {formatDate(conversation.updatedAt)}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="max-h-[380px] overflow-y-auto p-4 scrollbar-thin">
                    {!selectedConversation ? (
                      <p className="text-sm text-slate-500">Select a conversation to inspect messages.</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedConversation.messages.map((message, index) => (
                          <div
                            key={`${message.role}-${index}`}
                            className={classNames(
                              "rounded p-3",
                              message.role === "user"
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-white text-slate-800"
                            )}
                          >
                            <div className="mb-1 text-xs font-semibold uppercase opacity-70">{message.role}</div>
                            <p className="text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
                            {message.sources?.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {message.sources.map((source, sourceIndex) => (
                                  <div key={sourceIndex} className="p-2 rounded bg-slate-50 text-slate-700">
                                    <div className="text-xs font-semibold">{sourceLabel(source)}</div>
                                    <div className="mt-1 text-xs leading-5">{source.content}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
              )}

              {activeSection === "help" && (
                <section className="bg-white border rounded border-slate-200">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Search size={18} />
                      <h2 className="font-semibold text-slate-950">Connect Website Widget</h2>
                    </div>
                    <SecondaryButton onClick={copyWidgetSnippet}>
                      Copy Embed
                    </SecondaryButton>
                  </div>
                  <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_460px]">
                    <div className="space-y-4">
                      <div className="p-4 border rounded border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                          <span className="flex items-center justify-center w-6 h-6 text-xs text-white rounded bg-slate-900">1</span>
                          Generate widget API key
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          Open Business settings and click Generate / Rotate. Copy the key when it appears.
                        </p>
                      </div>
                      <div className="p-4 border rounded border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                          <span className="flex items-center justify-center w-6 h-6 text-xs text-white rounded bg-slate-900">2</span>
                          Build and host widget file
                        </div>
                        <pre className="p-3 mt-2 overflow-x-auto text-xs text-white rounded bg-slate-900">
{`cd frontend
npm run build:widget`}
                        </pre>
                        <p className="mt-2 text-sm text-slate-600">
                          Upload `dist-widget/rag-chat-widget.iife.js` to your server, CDN, or static hosting.
                        </p>
                      </div>
                      <div className="p-4 border rounded border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                          <span className="flex items-center justify-center w-6 h-6 text-xs text-white rounded bg-slate-900">3</span>
                          Paste embed code into website
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          Add the code before the closing body tag. Replace localhost URLs with deployed URLs in production.
                        </p>
                      </div>
                      <div className="p-4 border rounded border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                          <span className="flex items-center justify-center w-6 h-6 text-xs text-white rounded bg-slate-900">4</span>
                          Test from this dashboard
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          Paste the API key into Business settings, then click Test Widget to open the assistant and send a test message.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="mb-3">
  <Field label="Embed code type">
    <select
      className="w-full h-10 px-3 text-sm transition bg-white border rounded outline-none border-slate-200 text-slate-900 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      value={widgetEmbedMode}
      onChange={(event) => setWidgetEmbedMode(event.target.value)}
    >
      {widgetEmbedModeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </Field>
</div>

<div className="flex items-center justify-between mb-2">
  <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">
    Embed Code
  </span>
  <SecondaryButton onClick={copyWidgetSnippet}>
    Copy
  </SecondaryButton>
</div>

<pre className="max-h-[330px] overflow-auto rounded border border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
{widgetSnippet()}
</pre>
                        {!widgetApiKeyInput.trim() && (
                          <p className="mt-2 text-xs text-amber-700">
                            Paste or generate a key first to replace PASTE_WIDGET_API_KEY automatically.
                          </p>
                        )}
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold tracking-wide uppercase text-slate-500">
                          Small Preview
                        </div>
                        <div className="relative h-[360px] overflow-hidden rounded border border-slate-200 bg-slate-100 p-4">
                          <div className="p-4 bg-white border rounded border-slate-200">
                            <h3 className="text-lg font-bold text-slate-950">{selectedCompany.name}</h3>
                            <p className="mt-1 text-sm text-slate-500">Customer website page</p>
                          </div>
                          <div className="absolute bottom-20 right-4 flex h-[220px] w-[250px] flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-xl">
                            <div className="px-3 py-2 text-white" style={{ backgroundColor: widgetThemeForm.headerColor }}>
                              <div className="text-xs font-bold">{selectedCompany.name} Support</div>
                              <div className="text-[11px] text-slate-300">Chat widget panel</div>
                            </div>
                            <div className="flex-1 p-3 space-y-2 bg-slate-50">
                              <div className="max-w-[85%] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                                Hi, how can I help?
                              </div>
                              <div className="ml-auto max-w-[85%] rounded px-2 py-1 text-xs text-white" style={{ backgroundColor: widgetThemeForm.sendButtonColor }}>
                                Ask a question
                              </div>
                            </div>
                            <div className="p-2 border-t border-slate-200">
                              <div className="h-8 px-2 text-xs leading-8 bg-white border rounded border-slate-200 text-slate-400">
                                Type your question
                              </div>
                            </div>
                          </div>
                          <div className="absolute flex items-center justify-center text-white rounded-full shadow-xl bottom-4 right-4 h-14 w-14" style={{ backgroundColor: widgetThemeForm.launcherColor }}>
                            {renderLauncherIcon(22)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
