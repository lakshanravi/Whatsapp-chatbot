import { classNames } from "../utils/classNames";

export function StatusBadge({ status }) {
  const styles = {
    indexed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    indexing: "bg-amber-50 text-amber-700 ring-amber-200",
    rebuilding: "bg-amber-50 text-amber-700 ring-amber-200",
    completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    new: "bg-amber-50 text-amber-700 ring-amber-200",
    confirmed: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    processing: "bg-violet-50 text-violet-700 ring-violet-200",
    shipped: "bg-blue-50 text-blue-700 ring-blue-200",
    delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
    failed: "bg-rose-50 text-rose-700 ring-rose-200",
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    connected: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    unavailable: "bg-rose-50 text-rose-700 ring-rose-200",
    disconnected: "bg-rose-50 text-rose-700 ring-rose-200",
    inactive: "bg-slate-100 text-slate-600 ring-slate-200",
    unknown: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ring-1 ring-inset",
        styles[status] || "bg-slate-50 text-slate-700 ring-slate-200"
      )}
    >
      {status || "-"}
    </span>
  );
}

export function IconButton({ title, children, className = "", ...props }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={classNames(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-emerald-500/10",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={classNames(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm shadow-emerald-900/10 transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-emerald-500/15",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={classNames(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-emerald-500/10",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

export function TextInput(props) {
  return (
    <input
      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
      {...props}
    />
  );
}

export function TextArea(props) {
  return (
    <textarea
      className="min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
      {...props}
    />
  );
}
