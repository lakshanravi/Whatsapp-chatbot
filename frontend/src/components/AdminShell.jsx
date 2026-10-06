import {
  Activity,
  Building2,
  ChevronLeft,
  LogOut,
  RefreshCcw,
  ShoppingBag,
} from "lucide-react";
import { classNames } from "../utils/classNames";

const sectionDescriptions = {
  dashboard: "Your business activity and channel health at a glance.",
  companies: "Manage seller workspaces and access.",
  products: "Keep the catalogue customers can discover and order from up to date.",
  orders: "Review incoming orders and move them through fulfilment.",
  whatsapp: "Connect and manage the seller's WhatsApp Business account.",
  messenger: "Connect a Facebook Page for automated conversations and orders.",
  sms: "Manage Twilio messaging for customer support.",
  documents: "Maintain the trusted knowledge used for support answers.",
  chat: "Test knowledge answers before customers see them.",
  history: "Review conversations across every connected channel.",
  settings: "Configure the company and website assistant experience.",
  help: "Install and test the website assistant.",
  admins: "Manage administrative access across seller workspaces.",
  backups: "Protect and restore business data.",
};

const groupForSection = {
  dashboard: "Overview",
  orders: "Commerce",
  products: "Commerce",
  whatsapp: "Channels",
  messenger: "Channels",
  sms: "Channels",
  documents: "Knowledge & tools",
  chat: "Knowledge & tools",
  history: "Knowledge & tools",
  help: "Knowledge & tools",
  settings: "Workspace",
  companies: "Management",
  admins: "Management",
  backups: "Management",
};

function NavButton({ item, active, onClick, compact = false }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        compact
          ? "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
          : "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition",
        active
          ? "bg-white text-slate-950 shadow-lg shadow-black/10"
          : "text-slate-400 hover:bg-white/[0.07] hover:text-white"
      )}
    >
      <Icon size={compact ? 16 : 17} strokeWidth={active ? 2.4 : 2} />
      <span className="truncate">{item.label}</span>
      {!compact && active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />}
    </button>
  );
}

export function AdminShell({
  children,
  currentUser,
  health,
  loading,
  activeNavItems,
  activeSection,
  setActiveSection,
  isSuperAdmin,
  selectedCompany,
  backToSuperAdmin,
  loadHealth,
  handleLogout,
}) {
  const initials = (currentUser?.name || currentUser?.email || "A")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const pageTitle = activeNavItems.find((item) => item.id === activeSection)?.label
    || (selectedCompany ? "Overview" : "Dashboard");
  const systemsHealthy = health?.mongodb === "connected" && health?.ragService === "ok";
  const groupedItems = activeNavItems.reduce((groups, item) => {
    const group = groupForSection[item.id] || "Workspace";
    const existing = groups.find((entry) => entry.label === group);
    if (existing) existing.items.push(item);
    else groups.push({ label: group, items: [item] });
    return groups;
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f7f6] text-slate-950">
      <div className="min-h-screen lg:grid lg:grid-cols-[278px_minmax(0,1fr)]">
        <aside className="min-h-screen border-b border-white/10 bg-[#07111f] text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden lg:border-b-0">
          <div className="flex h-full flex-col lg:px-4 lg:py-5">
            <div className="flex items-center justify-between px-4 py-4 lg:px-2 lg:py-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-cyan-400 text-[#07111f] shadow-lg shadow-emerald-500/20">
                  <ShoppingBag size={20} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold tracking-tight">Pentarix AI Assistant</div>
                  <div className="truncate text-[11px] font-medium text-slate-500">Seller operations</div>
                </div>
              </div>
              <button type="button" onClick={handleLogout} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Log out">
                <LogOut size={18} />
              </button>
            </div>

            <div className="border-t border-white/[0.06] px-3 py-3 lg:mt-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:border-0 lg:px-0 lg:py-0 lg:pr-1 sidebar-scroll">
              <nav className="flex gap-1 overflow-x-auto pb-1 lg:hidden">
                {activeNavItems.map((item) => (
                  <NavButton key={item.id} item={item} compact active={activeSection === item.id} onClick={() => setActiveSection(item.id)} />
                ))}
              </nav>

              <div className="hidden lg:block">
                {isSuperAdmin && selectedCompany && (
                  <button
                    type="button"
                    onClick={backToSuperAdmin}
                    className="mb-5 flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <ChevronLeft size={15} />
                    Back to all businesses
                  </button>
                )}
                <div className="space-y-5">
                  {groupedItems.map((group) => (
                    <div key={group.label}>
                      <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">{group.label}</div>
                      <div className="space-y-0.5">
                        {group.items.map((item) => (
                          <NavButton key={item.id} item={item} active={activeSection === item.id} onClick={() => setActiveSection(item.id)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-auto hidden space-y-3 lg:block">
              <button
                type="button"
                onClick={loadHealth}
                disabled={loading.health}
                className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 text-left transition hover:bg-white/[0.07]"
              >
                <span className="flex items-center gap-2.5">
                  <span className={classNames("h-2 w-2 rounded-full", systemsHealthy ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.7)]" : "bg-amber-400")} />
                  <span><span className="block text-xs font-semibold text-slate-200">System status</span><span className="mt-0.5 block text-[11px] text-slate-500">{systemsHealthy ? "All services online" : "Needs attention"}</span></span>
                </span>
                <RefreshCcw className={classNames("text-slate-500", loading.health && "animate-spin")} size={14} />
              </button>

              <div className="flex items-center gap-3 border-t border-white/[0.08] px-1 pt-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-slate-950">{initials}</div>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-white">{currentUser.name}</div><div className="truncate text-[11px] capitalize text-slate-500">{currentUser.role.replace("_", " ")}</div></div>
                <button type="button" onClick={handleLogout} className="rounded-lg p-2 text-slate-500 transition hover:bg-white/10 hover:text-white" title="Log out"><LogOut size={16} /></button>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
            <div className="flex min-h-[82px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  {selectedCompany ? <Building2 size={13} /> : <Activity size={13} />}
                  <span className="truncate">{selectedCompany ? selectedCompany.name : "Platform administration"}</span>
                </div>
                <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-slate-950">{pageTitle}</h1>
                <p className="mt-0.5 hidden truncate text-sm text-slate-500 sm:block">{sectionDescriptions[activeSection] || "Manage your Pentarix AI workspace."}</p>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm sm:flex">
                <span className={classNames("h-2 w-2 rounded-full", systemsHealthy ? "bg-emerald-500" : "bg-amber-500")} />
                {systemsHealthy ? "Operational" : "Check services"}
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
