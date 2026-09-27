const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://botbackend.pentarixlabs.com";

let authToken = localStorage.getItem("rag_admin_token") || "";

export function setAuthToken(token) {
  authToken = token || "";
  if (authToken) localStorage.setItem("rag_admin_token", authToken);
  else localStorage.removeItem("rag_admin_token");
}

export function getAuthToken() {
  return authToken;
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof data === "string"
      ? data
      : data.detail && data.error && data.detail !== data.error
        ? `${data.error}: ${data.detail}`
        : data.detail || data.error || "Request failed";
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    error.path = path;
    throw error;
  }

  return data;
}

async function download(path) {
  const headers = new Headers();
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || data?.detail || "Download failed");
  }
  return response.blob();
}

async function downloadToFile(path, fileHandle, onProgress) {
  const headers = new Headers();
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { headers, cache: "no-store" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || data?.detail || "Download failed");
  }
  if (!response.body) throw new Error("Streaming downloads are not supported by this browser");

  const writable = await fileHandle.createWritable();
  const reader = response.body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      received += value.byteLength;
      onProgress?.(received);
    }
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
  return received;
}

export const api = {
  baseUrl: API_BASE_URL,
  health: () => request("/health"),
  auth: {
    login: (payload) =>
      request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    me: () => request("/api/auth/me"),
  },
  adminUsers: {
    list: () => request("/api/admin-users"),
    create: (payload) =>
      request("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    update: (id, payload) =>
      request(`/api/admin-users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    remove: (id) => request(`/api/admin-users/${id}`, { method: "DELETE" }),
  },
  backups: {
    download: () => download("/api/backups/download"),
    downloadToFile: (fileHandle, onProgress) =>
      downloadToFile("/api/backups/download", fileHandle, onProgress),
    status: () => request("/api/backups/restore-status", { cache: "no-store" }),
    restore: (file, confirmation) => {
      const formData = new FormData();
      formData.append("backup", file);
      formData.append("confirm", confirmation);
      return request("/api/backups/restore", { method: "POST", body: formData });
    },
  },
  companies: {
    list: () => request("/api/companies"),
    create: (payload) =>
      request("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    update: (id, payload) =>
      request(`/api/companies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    updateWidgetTheme: async (id, payload) => {
      const options = {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      };

      try {
        return await request(`/api/companies/${id}/widget-theme`, options);
      } catch (err) {
        const routeMissing =
          err.status === 405 ||
          (err.status === 404 && String(err.message || "").includes("Cannot PUT"));

        if (!routeMissing) throw err;

        return request(`/api/companies/${id}`, {
          ...options,
          body: JSON.stringify({ widgetTheme: payload }),
        });
      }
    },
    generateWidgetApiKey: (id) =>
      request(`/api/companies/${id}/widget-api-key`, {
        method: "POST",
      }),
    remove: (id) => request(`/api/companies/${id}`, { method: "DELETE" }),
  },
  whatsappIntegration: {
    get: (companyId) => request(`/api/companies/${companyId}/whatsapp-integration`),
    save: (companyId, payload, hasExisting) =>
      request(`/api/companies/${companyId}/whatsapp-integration`, {
        method: hasExisting ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    validate: (companyId) =>
      request(`/api/companies/${companyId}/whatsapp-integration/validate`, {
        method: "POST",
      }),
    remove: (companyId) =>
      request(`/api/companies/${companyId}/whatsapp-integration`, {
        method: "DELETE",
      }),
  },

  smsIntegration: {
    get: (companyId) => request(`/api/companies/${companyId}/sms-integration`),
    save: (companyId, payload, hasExisting) =>
      request(`/api/companies/${companyId}/sms-integration`, {
        method: hasExisting ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    validate: (companyId) =>
      request(`/api/companies/${companyId}/sms-integration/validate`, {
        method: "POST",
      }),
    remove: (companyId) =>
      request(`/api/companies/${companyId}/sms-integration`, {
        method: "DELETE",
      }),
  },
  messengerIntegration: {
    get: (companyId) => request(`/api/companies/${companyId}/messenger-integration`),
    save: (companyId, payload, hasExisting) =>
      request(`/api/companies/${companyId}/messenger-integration`, {
        method: hasExisting ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    validate: (companyId) =>
      request(`/api/companies/${companyId}/messenger-integration/validate`, { method: "POST" }),
    remove: (companyId) =>
      request(`/api/companies/${companyId}/messenger-integration`, { method: "DELETE" }),
  },
  products: {
    list: (companyId) => request(`/api/companies/${companyId}/products`),
    create: (companyId, payload) =>
      request(`/api/companies/${companyId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    update: (companyId, productId, payload) =>
      request(`/api/companies/${companyId}/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    remove: (companyId, productId) =>
      request(`/api/companies/${companyId}/products/${productId}`, { method: "DELETE" }),
  },
  orders: {
    list: (companyId, filters = {}) => {
      const query = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value !== "" && value !== undefined)
      );
      return request(`/api/companies/${companyId}/orders?${query}`);
    },
    summary: (companyId) => request(`/api/companies/${companyId}/orders/summary`),
    setStatus: (companyId, orderId, status) =>
      request(`/api/companies/${companyId}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
  },
  documents: {
    list: (companyId) => request(`/api/companies/${companyId}/documents`),
    download: (companyId, documentId) =>
      download(`/api/companies/${companyId}/documents/${documentId}/download`),
    upload: (companyId, files) => {
      const formData = new FormData();
      const [file] = Array.from(files);
      if (!file) throw new Error("A PDF file is required");
      formData.append("relativePaths", file.webkitRelativePath || file.name);
      formData.append("file", file);
      return request(`/api/companies/${companyId}/documents`, {
        method: "POST",
        body: formData,
      });
    },
    reindex: (companyId, documentId) =>
      request(`/api/companies/${companyId}/documents/${documentId}/reindex`, {
        method: "POST",
      }),
    reindexAll: (companyId) =>
      request(`/api/companies/${companyId}/documents/reindex-all`, {
        method: "POST",
      }),
    setActive: (companyId, documentId, isActive) =>
      request(`/api/companies/${companyId}/documents/${documentId}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }),
    remove: (companyId, documentId) =>
      request(`/api/companies/${companyId}/documents/${documentId}`, {
        method: "DELETE",
      }),
    removeBulk: (companyId, documentIds) =>
      request(`/api/companies/${companyId}/documents/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds }),
      }),
    removeAll: (companyId) =>
      request(`/api/companies/${companyId}/documents/all`, {
        method: "DELETE",
      }),
  },
  chat: {
    ask: (companyId, payload) =>
      request(`/api/companies/${companyId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    feedback: (companyId, conversationId, feedback) =>
      request(`/api/companies/${companyId}/chat/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, feedback }),
      }),
    conversations: (companyId, search = "") => {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      return request(`/api/companies/${companyId}/chat/conversations${query}`);
    },
    history: (companyId, sessionId) =>
      request(`/api/companies/${companyId}/chat/history/${sessionId}`),
  },
};

export function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
