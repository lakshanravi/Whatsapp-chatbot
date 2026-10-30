import { useEffect, useState } from "react";
import { CheckCircle2, Package, Pencil, Plus, Printer, RefreshCcw, Trash2 } from "lucide-react";
import { api, formatDate } from "../lib/api";
import { loadMetaSdk, startMessengerLogin } from "../lib/metaSdk";
import { Field, PrimaryButton, SecondaryButton, TextInput } from "./ui";

const emptyProduct = {
  sku: "",
  nameEn: "",
  nameSi: "",
  nameTa: "",
  price: "",
  currency: "LKR",
  stock: "",
  variants: [],
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value, currency = "LKR") {
  return `${currency} ${Number(value || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
      price: String(product.price ?? ""),
      currency: product.currency || "LKR",
      stock: product.stock === null || product.stock === undefined ? "" : String(product.stock),
      variants: (product.variants || []).map((variant) => ({
        name: variant.name || "",
        sku: variant.sku || "",
        priceAdjustment: String(variant.priceAdjustment ?? 0),
        stock: variant.stock === null || variant.stock === undefined ? "" : String(variant.stock),
        isActive: variant.isActive !== false,
      })),
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
      price: Number(form.price),
      currency: form.currency,
      stock: form.stock === "" ? null : Number(form.stock),
      variants: form.variants.map((variant) => ({
        ...variant,
        name: variant.name.trim(),
        sku: variant.sku.trim(),
        priceAdjustment: Number(variant.priceAdjustment || 0),
        stock: variant.stock === "" ? null : Number(variant.stock),
      })).filter((variant) => variant.name),
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

  function updateVariant(index, field, value) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) => (
        variantIndex === index ? { ...variant, [field]: value } : variant
      )),
    }));
  }

  function addVariant() {
    setForm((current) => ({
      ...current,
      variants: [...current.variants, { name: "", sku: "", priceAdjustment: "0", stock: "", isActive: true }],
    }));
  }

  function removeVariant(index) {
    setForm((current) => ({
      ...current,
      variants: current.variants.filter((_, variantIndex) => variantIndex !== index),
    }));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">{editingId ? "Edit product" : "Add product"}</h2>
          <p className="mt-1 text-sm text-slate-500">This catalogue controls products, prices, options, and ordering across the website, WhatsApp, Messenger, and voice assistant.</p>
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
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-sm font-semibold text-slate-800">Product options</div><div className="text-xs text-slate-500">Add sizes, colours, or models and any price difference.</div></div>
            <SecondaryButton type="button" onClick={addVariant}><Plus size={15} /> Add option</SecondaryButton>
          </div>
          <div className="mt-3 space-y-3">
            {form.variants.map((variant, index) => (
              <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
                <Field label="Option name"><TextInput required value={variant.name} placeholder="Smoke Grey" onChange={(e) => updateVariant(index, "name", e.target.value)} /></Field>
                <Field label="Option SKU"><TextInput value={variant.sku} placeholder="LHS-KTL-17-GRY" onChange={(e) => updateVariant(index, "sku", e.target.value)} /></Field>
                <Field label="Additional amount (+/-)"><TextInput type="number" step="0.01" placeholder="0 for same price, 900 to add LKR 900" value={variant.priceAdjustment} onChange={(e) => updateVariant(index, "priceAdjustment", e.target.value)} /></Field>
                <Field label="Stock (blank = unlimited)"><TextInput type="number" min="0" value={variant.stock} onChange={(e) => updateVariant(index, "stock", e.target.value)} /></Field>
                <div className="flex items-center justify-between gap-3 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={variant.isActive} onChange={(e) => updateVariant(index, "isActive", e.target.checked)} /> Available</label>
                  <SecondaryButton type="button" onClick={() => removeVariant(index)}><Trash2 size={15} /> Remove</SecondaryButton>
                </div>
              </div>
            ))}
            {!form.variants.length && <div className="rounded-lg border border-dashed border-slate-300 px-3 py-5 text-center text-xs text-slate-500">No options. The base product will be ordered directly.</div>}
          </div>
        </div>
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
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Package size={20} /></div>
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

function OrderManagement({ companyId, companyName }) {
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

  function printBill(order) {
    const printWindow = window.open("", "_blank", "width=900,height=760");
    if (!printWindow) {
      setError("Your browser blocked the print window. Allow pop-ups for this dashboard and try again.");
      return;
    }
    printWindow.opener = null;
    const confirmedPrice = order.priceStatus !== "pending";
    const currency = order.currency || "LKR";
    const rows = (order.items || []).map((item) => `
      <tr>
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          ${item.variant ? `<div class="muted">Option: ${escapeHtml(item.variant)}</div>` : ""}
          ${item.sku ? `<div class="muted">SKU: ${escapeHtml(item.sku)}</div>` : ""}
        </td>
        <td class="number">${escapeHtml(item.quantity)}</td>
        <td class="number">${confirmedPrice ? escapeHtml(money(item.unitPrice, currency)) : "Pending"}</td>
        <td class="number">${confirmedPrice ? escapeHtml(money(item.lineTotal, currency)) : "Pending"}</td>
      </tr>
    `).join("");
    const totalLabel = confirmedPrice ? money(order.total, currency) : "Seller to confirm";
    const createdAt = order.createdAt
      ? new Date(order.createdAt).toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })
      : "-";
    printWindow.document.write(`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(order.orderNumber)} - Order bill</title>
          <style>
            @page { size: A4; margin: 16mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #0f172a; font: 14px/1.5 Arial, sans-serif; }
            .header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 22px; border-bottom: 2px solid #0f766e; }
            .brand { color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
            h1 { margin: 5px 0 0; font-size: 27px; }
            .bill-title { text-align: right; }
            .bill-title strong { display: block; font-size: 18px; }
            .muted { color: #64748b; font-size: 12px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin: 26px 0; }
            h2 { margin: 0 0 8px; color: #475569; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
            p { margin: 3px 0; }
            table { width: 100%; border-collapse: collapse; }
            th { padding: 10px; background: #f1f5f9; color: #475569; font-size: 11px; letter-spacing: .05em; text-align: left; text-transform: uppercase; }
            td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
            .number { text-align: right; white-space: nowrap; }
            .summary { width: 330px; margin: 24px 0 0 auto; }
            .summary div { display: flex; justify-content: space-between; gap: 20px; padding: 5px 0; }
            .summary .total { margin-top: 8px; padding-top: 12px; border-top: 2px solid #0f172a; font-size: 18px; font-weight: 700; }
            .status { display: inline-block; padding: 3px 9px; border-radius: 999px; background: #ecfdf5; color: #047857; font-size: 11px; font-weight: 700; text-transform: uppercase; }
            .footer { margin-top: 42px; padding-top: 14px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; text-align: center; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <header class="header">
            <div><div class="brand">${escapeHtml(companyName || "Pentarix AI Assistant")}</div><h1>Order Bill</h1></div>
            <div class="bill-title"><strong>${escapeHtml(order.orderNumber)}</strong><span class="muted">${escapeHtml(createdAt)}</span></div>
          </header>
          <section class="grid">
            <div>
              <h2>Bill to</h2>
              <p><strong>${escapeHtml(order.customer?.name || "-")}</strong></p>
              <p>${escapeHtml(order.customer?.phone || "No phone number")}</p>
              <p>${escapeHtml(order.customer?.deliveryAddress || "No delivery address")}</p>
            </div>
            <div>
              <h2>Order details</h2>
              <p>Payment: <strong>${escapeHtml(order.paymentMethod || "-")}</strong></p>
              <p>Channel: ${escapeHtml(order.channel || "-")} · ${escapeHtml((order.language || "").toUpperCase())}</p>
              <p>Status: <span class="status">${escapeHtml(order.status || "new")}</span></p>
            </div>
          </section>
          <table>
            <thead><tr><th>Item</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Amount</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4">No items</td></tr>'}</tbody>
          </table>
          <section class="summary">
            ${confirmedPrice ? `<div><span>Subtotal</span><strong>${escapeHtml(money(order.subtotal, currency))}</strong></div><div><span>Delivery</span><strong>${escapeHtml(money(order.deliveryFee, currency))}</strong></div>` : ""}
            <div class="total"><span>Total</span><span>${escapeHtml(totalLabel)}</span></div>
          </section>
          <footer class="footer">Generated by Pentarix AI Assistant</footer>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
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
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Bill</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order._id} className={order.status === "new" ? "bg-amber-50/60" : ""}>
                  <td className="px-4 py-4"><div className="font-semibold">{order.orderNumber}</div><div className="text-xs text-slate-500">{formatDate(order.createdAt)}</div></td>
                  <td className="px-4 py-4"><div>{order.customer?.name}</div><div className="text-xs text-slate-500">{order.customer?.phone || "No phone"}</div><div className="max-w-56 truncate text-xs text-slate-400">{order.customer?.deliveryAddress}</div></td>
                  <td className="px-4 py-4">{order.items?.map((item, index) => <div key={`${item.productId || item.name}-${item.variant}-${index}`}>{item.quantity} × {item.name}{item.variant ? ` (${item.variant})` : ""}</div>)}</td>
                  <td className="px-4 py-4 font-semibold">{order.priceStatus === "pending" ? "Seller to confirm" : `${order.currency} ${Number(order.total).toFixed(2)}`}<div className="text-xs font-normal text-slate-500">{order.paymentMethod}</div></td>
                  <td className="px-4 py-4 capitalize">{order.channel}<div className="text-xs uppercase text-slate-400">{order.language}</div></td>
                  <td className="px-4 py-4"><select className="h-9 rounded-md border border-slate-200 bg-white px-2" value={order.status} onChange={(e) => setOrderStatus(order._id, e.target.value)}>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
                  <td className="px-4 py-4 text-right"><SecondaryButton type="button" onClick={() => printBill(order)}><Printer size={15} /> Print bill</SecondaryButton></td>
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
  const [connectConfig, setConnectConfig] = useState(null);
  const [availablePages, setAvailablePages] = useState([]);
  const [connectionId, setConnectionId] = useState("");
  const [selectedPageId, setSelectedPageId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const config = await api.messengerIntegration.connectConfig(companyId);
      setConnectConfig(config);
      if (config.enabled) {
        loadMetaSdk({ appId: config.appId, graphApiVersion: config.graphApiVersion }).catch(() => {});
      }
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

  async function startConnection() {
    setLoading(true); setError(""); setNotice(""); setAvailablePages([]); setConnectionId("");
    try {
      const config = connectConfig || await api.messengerIntegration.connectConfig(companyId);
      setConnectConfig(config);
      if (!config.enabled) throw new Error(config.reason || "Messenger connection is not configured");
      const accessToken = await startMessengerLogin({
        appId: config.appId,
        configId: config.configId,
        graphApiVersion: config.graphApiVersion,
        permissions: config.permissions,
      });
      const result = await api.messengerIntegration.discoverPages(companyId, accessToken);
      setAvailablePages(result.pages || []);
      setConnectionId(result.connectionId);
      setSelectedPageId(result.pages?.[0]?.id || "");
      if (result.pages?.length === 1) {
        const connected = await api.messengerIntegration.connectPage(companyId, {
          connectionId: result.connectionId,
          pageId: result.pages[0].id,
        });
        setIntegration(connected);
        setForm({ pageId: connected.pageId, pageName: connected.pageName || "", pageAccessToken: "", isActive: true });
        setAvailablePages([]); setConnectionId("");
        setNotice(`Messenger connected to ${connected.pageName || connected.pageId}`);
      } else {
        setNotice("Choose the Facebook Page that Pentarix should automate.");
      }
    } catch (err) {
      setError(err.technicalMessage || err.message);
    } finally { setLoading(false); }
  }

  async function finishConnection() {
    if (!connectionId || !selectedPageId) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const connected = await api.messengerIntegration.connectPage(companyId, {
        connectionId,
        pageId: selectedPageId,
      });
      setIntegration(connected);
      setForm({ pageId: connected.pageId, pageName: connected.pageName || "", pageAccessToken: "", isActive: true });
      setAvailablePages([]); setConnectionId(""); setSelectedPageId("");
      setNotice(`Messenger connected to ${connected.pageName || connected.pageId}`);
    } catch (err) { setError(err.technicalMessage || err.message); }
    finally { setLoading(false); }
  }

  async function disconnect() {
    if (!integration || !window.confirm("Disconnect this Facebook Page from Pentarix?")) return;
    setLoading(true); setError(""); setNotice("");
    try {
      await api.messengerIntegration.remove(companyId);
      setIntegration(null); setForm(emptyMessenger);
      setNotice("Messenger disconnected");
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,620px)_1fr]">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-bold">Facebook Messenger</h2><p className="mt-1 text-sm text-slate-500">Authorize Pentarix and choose the Facebook Page your company owns.</p></div>
        <Alert error={error} notice={notice} />
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm leading-6 text-blue-900">Sign in with Facebook and approve the Pages you manage. Your Facebook password is entered only in Meta's window.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton onClick={startConnection} disabled={loading || connectConfig?.enabled === false}>
              {integration ? "Reconnect with Facebook" : "Connect with Facebook"}
            </PrimaryButton>
            {integration && <SecondaryButton onClick={validate} disabled={loading}><CheckCircle2 size={16} /> Validate</SecondaryButton>}
            {integration && <SecondaryButton onClick={disconnect} disabled={loading} className="text-rose-700"><Trash2 size={16} /> Disconnect</SecondaryButton>}
          </div>
          {connectConfig?.enabled === false && <p className="mt-3 text-xs text-amber-800">{connectConfig.reason}</p>}
        </div>

        {availablePages.length > 1 && (
          <div className="rounded-xl border border-slate-200 p-4">
            <Field label="Choose Facebook Page">
              <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" value={selectedPageId} onChange={(event) => setSelectedPageId(event.target.value)}>
                {availablePages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
              </select>
            </Field>
            <PrimaryButton className="mt-3" onClick={finishConnection} disabled={loading || !selectedPageId}>Connect selected Page</PrimaryButton>
          </div>
        )}

        <details className="rounded-xl border border-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">Advanced manual connection</summary>
          <form onSubmit={save} className="space-y-4 border-t border-slate-200 p-4">
            <Field label="Facebook Page ID"><TextInput required value={form.pageId} onChange={(e) => setForm({ ...form, pageId: e.target.value })} /></Field>
            <Field label="Page name"><TextInput value={form.pageName} onChange={(e) => setForm({ ...form, pageName: e.target.value })} /></Field>
            <Field label={integration ? "New Page access token (leave blank to keep current)" : "Page access token"}><TextInput required={!integration} type="password" value={form.pageAccessToken} onChange={(e) => setForm({ ...form, pageAccessToken: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Integration active</label>
            <PrimaryButton type="submit" disabled={loading}>{integration ? "Update manual connection" : "Save manual connection"}</PrimaryButton>
          </form>
        </details>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold">Connection status</h2>
        <p className="mt-2 text-sm text-slate-600">The Pentarix Meta App handles the webhook. Each company only authorizes the Facebook Page it owns.</p>
        <div className="mt-4 rounded-md bg-slate-950 p-3 font-mono text-xs text-white">{api.baseUrl}/api/messenger/webhook</div>
        <p className="mt-3 text-sm text-slate-500">Page tokens are encrypted before storage and never displayed again.</p>
        {integration
          ? <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><div className="font-semibold">Connected</div><div>Page: {integration.pageName || integration.pageId}</div><div>Method: {integration.onboardingMethod === "facebook_login" ? "Facebook authorization" : "Manual"}</div><div>Token ending: {integration.pageAccessTokenLast4 || "-"}</div></div>
          : <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No Facebook Page connected yet.</div>}
      </section>
    </div>
  );
}

export function CommercePanel({ companyId, companyName, section }) {
  if (!companyId) return null;
  if (section === "products") return <ProductManagement companyId={companyId} />;
  if (section === "orders") return <OrderManagement companyId={companyId} companyName={companyName} />;
  if (section === "messenger") return <MessengerManagement companyId={companyId} />;
  return null;
}
