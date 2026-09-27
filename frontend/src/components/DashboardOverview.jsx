import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  MessageCircleMore,
  Package,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { api, formatDate } from "../lib/api";
import { classNames } from "../utils/classNames";

function MetricCard({ icon: Icon, label, value, detail, accent }) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
  };
  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50">
      <div className="flex items-start justify-between gap-4">
        <div><div className="text-sm font-medium text-slate-500">{label}</div><div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</div></div>
        <div className={classNames("rounded-xl p-2.5 ring-1", colors[accent])}><Icon size={20} /></div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">{detail}</p>
    </article>
  );
}

function ChannelRow({ name, detail, connected, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-slate-50">
      <span className={classNames("flex h-9 w-9 items-center justify-center rounded-lg", connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400")}><MessageCircleMore size={17} /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{name}</span><span className="block truncate text-xs text-slate-500">{detail}</span></span>
      <span className={classNames("rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide", connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{connected ? "Connected" : "Set up"}</span>
    </button>
  );
}

export function DashboardOverview({ company, documents, conversations, setActiveSection }) {
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [channels, setChannels] = useState({ whatsapp: false, messenger: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const safe = (promise) => promise.catch(() => null);
      const [orderSummary, productList, orderList, whatsapp, messenger] = await Promise.all([
        safe(api.orders.summary(company._id)),
        safe(api.products.list(company._id)),
        safe(api.orders.list(company._id, { limit: 5 })),
        safe(api.whatsappIntegration.get(company._id)),
        safe(api.messengerIntegration.get(company._id)),
      ]);
      if (!cancelled) {
        setSummary(orderSummary);
        setProducts(productList || []);
        setOrders(orderList?.orders || []);
        setChannels({ whatsapp: Boolean(whatsapp?.isActive), messenger: Boolean(messenger?.isActive) });
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [company._id]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-[#0b1728] px-6 py-7 text-white shadow-xl shadow-slate-300/30 sm:px-8">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute right-36 top-16 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200"><Sparkles size={13} /> Commerce workspace</div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome to {company.name}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Your assistant is ready to answer customer questions, capture order details, and keep every channel organized.</p>
          </div>
          <button type="button" onClick={() => setActiveSection("orders")} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-950 shadow-lg transition hover:-translate-y-0.5">
            View incoming orders <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={ShoppingCart} label="New orders" value={loading ? "—" : summary?.counts?.new || 0} detail="Waiting for your team to review" accent="emerald" />
        <MetricCard icon={Package} label="Active products" value={loading ? "—" : products.filter((item) => item.isActive).length} detail={`${products.length} products in your catalogue`} accent="cyan" />
        <MetricCard icon={MessageCircleMore} label="Conversations" value={conversations.length} detail="Customer conversations across channels" accent="violet" />
        <MetricCard icon={BookOpenText} label="Knowledge files" value={documents.length} detail={`${documents.filter((item) => item.status === "indexed").length} ready for customer answers`} accent="amber" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,.6fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><h3 className="font-bold text-slate-900">Recent orders</h3><p className="mt-0.5 text-xs text-slate-500">Latest orders captured by your assistants</p></div>
            <button type="button" onClick={() => setActiveSection("orders")} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">View all</button>
          </div>
          <div className="divide-y divide-slate-100">
            {orders.map((order) => (
              <button key={order._id} type="button" onClick={() => setActiveSection("orders")} className="grid w-full gap-2 px-5 py-4 text-left transition hover:bg-slate-50 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <div><div className="text-sm font-semibold text-slate-900">{order.orderNumber}</div><div className="mt-1 text-xs text-slate-500">{order.customer?.name} · {formatDate(order.createdAt)}</div></div>
                <div className="text-sm text-slate-600">{order.items?.[0]?.quantity} × {order.items?.[0]?.name}</div>
                <div className="flex items-center gap-3"><span className="text-sm font-semibold text-slate-900">{order.currency} {Number(order.total).toFixed(2)}</span><span className={classNames("rounded-full px-2 py-1 text-[10px] font-bold uppercase", order.status === "new" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>{order.status}</span></div>
              </button>
            ))}
            {!orders.length && !loading && <div className="px-5 py-10 text-center"><ShoppingCart className="mx-auto text-slate-300" size={28} /><div className="mt-3 text-sm font-semibold text-slate-700">No orders yet</div><p className="mt-1 text-xs text-slate-500">New WhatsApp and Messenger orders will appear here.</p></div>}
            {loading && <div className="px-5 py-10 text-center text-sm text-slate-400">Loading business activity…</div>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50">
          <div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Sales channels</h3><p className="mt-0.5 text-xs text-slate-500">Connection readiness</p></div><CheckCircle2 className="text-emerald-500" size={20} /></div>
          <div className="mt-4 space-y-1">
            <ChannelRow name="WhatsApp Business" detail="Automated support and ordering" connected={channels.whatsapp} onClick={() => setActiveSection("whatsapp")} />
            <ChannelRow name="Facebook Messenger" detail="Connected Facebook Page" connected={channels.messenger} onClick={() => setActiveSection("messenger")} />
            <ChannelRow name="Website assistant" detail="Embedded customer support" connected={Boolean(company.widgetApiKeyPreview)} onClick={() => setActiveSection("help")} />
          </div>
        </div>
      </section>
    </div>
  );
}
