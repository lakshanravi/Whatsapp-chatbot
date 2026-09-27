import { useEffect, useState } from "react";
import { CheckCircle2, Package, Pencil, RefreshCcw, Trash2 } from "lucide-react";
import { api, formatDate } from "../lib/api";
import { Field, PrimaryButton, SecondaryButton, TextArea, TextInput } from "./ui";

const emptyProduct = {
  sku: "",
  nameEn: "",
  nameSi: "",
  nameTa: "",
  descriptionEn: "",
  price: "",
  currency: "LKR",
  stock: "",
  variants: "",
  isActive: true,
};

const emptyMessenger = {
  pageId: "",
  pageName: "",
  pageAccessToken: "",
  isActive: true,
};

function Alert({ error, notice }) {
  if (!error && !notice) return null;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
      {error || notice}
    </div>
  );
}

function ProductManagement({ companyId }) {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyProduct);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setProducts(await api.products.list(companyId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  function edit(product) {
    setEditingId(product._id);
    setForm({
      sku: product.sku || "",
      nameEn: product.name?.en || "",
      nameSi: product.name?.si || "",
      nameTa: product.name?.ta || "",
      descriptionEn: product.description?.en || "",
      price: String(product.price ?? ""),
      currency: product.currency || "LKR",
      stock: product.stock === null || product.stock === undefined ? "" : String(product.stock),
      variants: (product.variants || []).map((variant) => variant.name).join(", "),
      isActive: product.isActive !== false,
    });
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    const payload = {
      sku: form.sku,
      name: { en: form.nameEn, si: form.nameSi, ta: form.nameTa },
      description: { en: form.descriptionEn },
      price: Number(form.price),
      currency: form.currency,
      stock: form.stock === "" ? null : Number(form.stock),
      variants: form.variants.split(",").map((name) => name.trim()).filter(Boolean).map((name) => ({ name })),
      isActive: form.isActive,
    };
    setLoading(true);
    try {
      if (editingId) await api.products.update(companyId, editingId, payload);
      else await api.products.create(companyId, payload);
      setNotice(editingId ? "Product updated" : "Product created");
      setEditingId("");
      setForm(emptyProduct);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(product) {
    if (!window.confirm(`Delete ${product.name?.en || product.sku}?`)) return;
    try {
      await api.products.remove(companyId, product._id);
      setNotice("Product deleted");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">{editingId ? "Edit product" : "Add product"}</h2>
          <p className="mt-1 text-sm text-slate-500">Products here can be ordered through WhatsApp and Messenger.</p>
        </div>
        <Alert error={error} notice={notice} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SKU"><TextInput required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
          <Field label="English name"><TextInput required value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
          <Field label="Sinhala name"><TextInput value={form.nameSi} onChange={(e) => setForm({ ...form, nameSi: e.target.value })} /></Field>
          <Field label="Tamil name"><TextInput value={form.nameTa} onChange={(e) => setForm({ ...form, nameTa: e.target.value })} /></Field>
          <Field label="Price"><TextInput required min="0" step="0.01" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Currency"><TextInput required value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Stock (blank = unlimited)"><TextInput min="0" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
          <Field label="Variants (comma separated)"><TextInput placeholder="Small, Medium, Large" value={form.variants} onChange={(e) => setForm({ ...form, variants: e.target.value })} /></Field>
        </div>
        <Field label="English description"><TextArea value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Available for ordering</label>
        <div className="flex gap-2">
          <PrimaryButton type="submit" disabled={loading}>{editingId ? "Save changes" : "Add product"}</PrimaryButton>
          {editingId && <SecondaryButton onClick={() => { setEditingId(""); setForm(emptyProduct); }}>Cancel</SecondaryButton>}
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div><h2 className="text-lg font-bold">Product catalogue</h2><p className="text-sm text-slate-500">{products.length} products</p></div>
          <SecondaryButton onClick={load} disabled={loading}><RefreshCcw size={16} /> Refresh</SecondaryButton>
        </div>
        <div className="divide-y divide-slate-100">
          {products.map((product) => (
            <div key={product._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Package size={20} /></div>
                <div>
                  <div className="font-semibold">{product.name?.en || product.name?.si || product.name?.ta}</div>
                  <div className="text-sm text-slate-500">{product.sku} · {product.currency} {Number(product.price).toFixed(2)} · Stock {product.stock ?? "Unlimited"}</div>
                  <div className="mt-1 text-xs text-slate-400">{product.isActive ? "Active" : "Inactive"}{product.variants?.length ? ` · ${product.variants.map((item) => item.name).join(", ")}` : ""}</div>
                </div>
              </div>
              <div className="flex gap-2"><SecondaryButton onClick={() => edit(product)}><Pencil size={15} /> Edit</SecondaryButton><SecondaryButton onClick={() => remove(product)}><Trash2 size={15} /> Delete</SecondaryButton></div>
            </div>
          ))}
          {!products.length && <div className="p-10 text-center text-sm text-slate-500">No products yet. Add the first product to enable conversational ordering.</div>}
        </div>
      </section>
    </div>
  );
}

function OrderManagement({ companyId }) {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [orderResult, summaryResult] = await Promise.all([
        api.orders.list(companyId, { status, search }),
        api.orders.summary(companyId),
      ]);
      setOrders(orderResult.orders || []);
      setSummary(summaryResult);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId, status]);

  async function setOrderStatus(orderId, nextStatus) {
    try {
      await api.orders.setStatus(companyId, orderId, nextStatus);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const statuses = ["new", "confirmed", "processing", "shipped", "delivered", "cancelled"];
  return (
    <div className="space-y-5">
      <Alert error={error} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">New orders</div><div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{summary?.counts?.new || 0}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Processing</div><div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{summary?.counts?.processing || 0}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivered</div><div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{summary?.counts?.delivered || 0}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order value</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">LKR {Number(summary?.revenue || 0).toFixed(2)}</div></div>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-end">
          <Field label="Search"><TextInput placeholder="Order, customer or phone" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
          <Field label="Status"><select className="h-10 rounded-md border border-slate-200 px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
          <SecondaryButton onClick={load} disabled={loading}><RefreshCcw size={16} /> Search</SecondaryButton>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order._id} className={order.status === "new" ? "bg-amber-50/60" : ""}>
                  <td className="px-4 py-4"><div className="font-semibold">{order.orderNumber}</div><div className="text-xs text-slate-500">{formatDate(order.createdAt)}</div></td>
                  <td className="px-4 py-4"><div>{order.customer?.name}</div><div className="text-xs text-slate-500">{order.customer?.phone || "No phone"}</div><div className="max-w-56 truncate text-xs text-slate-400">{order.customer?.deliveryAddress}</div></td>
                  <td className="px-4 py-4">{order.items?.map((item) => <div key={`${item.productId}-${item.variant}`}>{item.quantity} × {item.name}{item.variant ? ` (${item.variant})` : ""}</div>)}</td>
                  <td className="px-4 py-4 font-semibold">{order.currency} {Number(order.total).toFixed(2)}<div className="text-xs font-normal text-slate-500">{order.paymentMethod}</div></td>
                  <td className="px-4 py-4 capitalize">{order.channel}<div className="text-xs uppercase text-slate-400">{order.language}</div></td>
                  <td className="px-4 py-4"><select className="h-9 rounded-md border border-slate-200 bg-white px-2" value={order.status} onChange={(e) => setOrderStatus(order._id, e.target.value)}>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length && <div className="p-10 text-center text-sm text-slate-500">No orders match the current filter.</div>}
        </div>
      </section>
    </div>
  );
}

function MessengerManagement({ companyId }) {
  const [integration, setIntegration] = useState(null);
  const [form, setForm] = useState(emptyMessenger);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const value = await api.messengerIntegration.get(companyId);
      setIntegration(value);
      setForm({ pageId: value.pageId || "", pageName: value.pageName || "", pageAccessToken: "", isActive: value.isActive !== false });
    } catch (err) {
      if (err.status === 404) { setIntegration(null); setForm(emptyMessenger); }
      else setError(err.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [companyId]);

  async function save(event) {
    event.preventDefault();
    setLoading(true); setError(""); setNotice("");
    try {
      const value = await api.messengerIntegration.save(companyId, form, Boolean(integration));
      setIntegration(value); setForm((current) => ({ ...current, pageAccessToken: "" })); setNotice("Messenger integration saved");
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  async function validate() {
    setLoading(true); setError(""); setNotice("");
    try { const result = await api.messengerIntegration.validate(companyId); setNotice(`Connected to ${result.page?.name || "Facebook Page"}`); await load(); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,620px)_1fr]">
      <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-bold">Facebook Messenger</h2><p className="mt-1 text-sm text-slate-500">Connect one Facebook Page to receive support questions and conversational orders.</p></div>
        <Alert error={error} notice={notice} />
        <Field label="Facebook Page ID"><TextInput required value={form.pageId} onChange={(e) => setForm({ ...form, pageId: e.target.value })} /></Field>
        <Field label="Page name"><TextInput value={form.pageName} onChange={(e) => setForm({ ...form, pageName: e.target.value })} /></Field>
        <Field label={integration ? "New Page access token (leave blank to keep current)" : "Page access token"}><TextInput required={!integration} type="password" value={form.pageAccessToken} onChange={(e) => setForm({ ...form, pageAccessToken: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Integration active</label>
        <div className="flex gap-2"><PrimaryButton type="submit" disabled={loading}>{integration ? "Update connection" : "Connect Page"}</PrimaryButton>{integration && <SecondaryButton onClick={validate} disabled={loading}><CheckCircle2 size={16} /> Validate</SecondaryButton>}</div>
      </form>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold">Meta webhook configuration</h2>
        <p className="mt-2 text-sm text-slate-600">Configure this callback in your Meta app and subscribe to the Page <code>messages</code> and <code>messaging_postbacks</code> fields.</p>
        <div className="mt-4 rounded-md bg-slate-950 p-3 font-mono text-xs text-white">{api.baseUrl}/api/messenger/webhook</div>
        <p className="mt-3 text-sm text-slate-500">The verify token and Meta App Secret are configured on the backend server. Page tokens are encrypted before storage.</p>
        {integration && <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><div className="font-semibold">Connected</div><div>Page: {integration.pageName || integration.pageId}</div><div>Token ending: {integration.pageAccessTokenLast4 || "-"}</div></div>}
      </section>
    </div>
  );
}

export function CommercePanel({ companyId, section }) {
  if (!companyId) return null;
  if (section === "products") return <ProductManagement companyId={companyId} />;
  if (section === "orders") return <OrderManagement companyId={companyId} />;
  if (section === "messenger") return <MessengerManagement companyId={companyId} />;
  return null;
}
