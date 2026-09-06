import { classNames } from "../utils/classNames";

export function StatusBadge({ status }) {
  const styles = {
    indexed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    indexing: "bg-amber-50 text-amber-700 ring-amber-200",
    rebuilding: "bg-amber-50 text-amber-700 ring-amber-200",
    completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
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
        "inline-flex items-center rounded px-2 py-1 text-xs font-semibold ring-1",
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
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300",
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm shadow-slate-300/70 transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300",
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300",
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
      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      {...props}
    />
  );
}

export function TextArea(props) {
  return (
    <textarea
      className="min-h-24 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      {...props}
    />
  );
}
