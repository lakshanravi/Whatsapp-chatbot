import {
  ArrowRight,
  Languages,
  LockKeyhole,
  MessageCircleMore,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { PrimaryButton } from "./ui";

const features = [
  { icon: MessageCircleMore, label: "WhatsApp & Messenger", detail: "One inbox-ready assistant" },
  { icon: Languages, label: "Three languages", detail: "Sinhala, English and Tamil" },
  { icon: PackageCheck, label: "Orders that stay organized", detail: "From chat to fulfilment" },
];

export function LoginPage({ loginForm, setLoginForm, loading, error, handleLogin }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] text-slate-950">
      <div className="pointer-events-none absolute inset-0 opacity-80 commerce-login-grid" />
      <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-[30rem] w-[30rem] rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen max-w-[1500px] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="flex flex-col justify-between px-6 py-7 text-white sm:px-10 lg:px-16 lg:py-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-cyan-400 text-[#07111f] shadow-lg shadow-emerald-500/20">
              <ShoppingBag size={22} strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight">Pentarix AI Assistant</div>
              <div className="text-xs font-medium text-slate-400">Conversational selling workspace</div>
            </div>
          </div>

          <div className="my-16 max-w-2xl lg:my-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
              <ShieldCheck size={14} />
              Built for modern seller operations
            </div>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl lg:text-[3.65rem]">
              Turn every customer conversation into an opportunity.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Manage products, automate multilingual support, and fulfil orders from WhatsApp and Messenger—all from one calm, focused workspace.
            </p>

            <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
              {features.map(({ icon: Icon, label, detail }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm">
                  <Icon className="text-emerald-300" size={20} />
                  <div className="mt-4 text-sm font-semibold text-white">{label}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">{detail}</div>
                </div>
              ))}
            </div>
          </div>

          <p className="hidden text-xs text-slate-500 lg:block">Secure seller access · Encrypted channel credentials</p>
        </section>

        <section className="flex items-center justify-center px-5 pb-10 sm:px-10 lg:py-10">
          <div className="w-full max-w-[470px] rounded-2xl border border-white/70 bg-white/95 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
            <div className="mb-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <LockKeyhole size={21} />
              </div>
              <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to manage your store conversations and orders.</p>
            </div>

            {error && (
              <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <form className="space-y-5" onSubmit={handleLogin}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Email address</span>
                <input
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
                <input
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              </label>

              <PrimaryButton type="submit" className="h-12 w-full rounded-lg" disabled={loading.auth}>
                {loading.auth ? "Signing in…" : "Sign in to workspace"}
                {!loading.auth && <ArrowRight size={17} />}
              </PrimaryButton>
            </form>

            <div className="mt-7 flex items-center justify-center gap-2 border-t border-slate-100 pt-5 text-xs text-slate-400">
              <ShieldCheck size={14} />
              Protected administrative access
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
