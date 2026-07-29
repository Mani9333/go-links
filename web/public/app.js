// Vanilla-JS client (no build step) so nginx can serve it as static files.
// Talks to the backend over relative paths, so it works identically whether
// served by the Node dev server or by nginx in front of the API.

const api = {
  async list(query) {
    const url = query ? `/api/links?q=${encodeURIComponent(query)}` : "/api/links";
    const res = await fetch(url);
    if (!res.ok) throw await toError(res);
    return (await res.json()).data;
  },
  async create(body) {
    return send("POST", "/api/links", body);
  },
  async update(slug, body) {
    return send("PUT", `/api/links/${encodeURIComponent(slug)}`, body);
  },
  async remove(slug) {
    const res = await fetch(`/api/links/${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) throw await toError(res);
  },
};

async function send(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()).data;
}

async function toError(res) {
  try {
    const body = await res.json();
    const detail = body?.error?.details?.[0]?.message;
    return new Error(detail || body?.error?.message || `Request failed (${res.status})`);
  } catch {
    return new Error(`Request failed (${res.status})`);
  }
}

const els = {
  form: document.getElementById("create-form"),
  slug: document.getElementById("slug"),
  url: document.getElementById("url"),
  description: document.getElementById("description"),
  createBtn: document.getElementById("create-btn"),
  search: document.getElementById("search"),
  list: document.getElementById("list"),
  count: document.getElementById("list-count"),
  toasts: document.getElementById("toasts"),
  statTotal: document.getElementById("stat-total"),
  statHits: document.getElementById("stat-hits"),
  statTop: document.getElementById("stat-top"),
  insights: document.getElementById("insights"),
  insAvg: document.getElementById("ins-avg"),
  insUnused: document.getElementById("ins-unused"),
  insWithHits: document.getElementById("ins-with-hits"),
  insTop: document.getElementById("ins-top"),
};

// Fetches analytics from the Python service (proxied at /analytics). Hidden
// gracefully if that service isn't reachable, so the app works standalone.
async function loadInsights() {
  try {
    const res = await fetch("/analytics/summary");
    if (!res.ok) throw new Error(String(res.status));
    const s = await res.json();
    els.insAvg.textContent = String(s.average_hits);
    els.insUnused.textContent = String(s.never_used);
    els.insWithHits.textContent = String(s.links_with_hits);
    els.insTop.innerHTML = "";
    for (const link of s.top_links.filter((l) => l.hits > 0)) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "top-slug";
      name.textContent = `go/${link.slug}`;
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = `${link.hits} ${link.hits === 1 ? "hit" : "hits"}`;
      li.append(name, b);
      els.insTop.append(li);
    }
    els.insights.hidden = els.insTop.children.length === 0;
  } catch {
    els.insights.hidden = true;
  }
}

let editingSlug = null;

function toast(message, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  els.toasts.append(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }, 3200);
}

function updateStats(links) {
  els.statTotal.textContent = String(links.length);
  const totalHits = links.reduce((sum, l) => sum + l.hits, 0);
  els.statHits.textContent = String(totalHits);
  const top = links.reduce((best, l) => (l.hits > (best?.hits ?? -1) ? l : best), null);
  els.statTop.textContent = top && top.hits > 0 ? `go/${top.slug}` : "—";
}

function linkRow(link) {
  const row = document.createElement("div");
  row.className = "link-row";

  if (editingSlug === link.slug) {
    row.append(editForm(link));
    return row;
  }

  const main = document.createElement("div");
  main.className = "link-main";

  const slug = document.createElement("a");
  slug.className = "link-slug";
  slug.href = `/go/${encodeURIComponent(link.slug)}`;
  slug.target = "_blank";
  slug.rel = "noopener";
  slug.textContent = `go/${link.slug}`;

  const url = document.createElement("div");
  url.className = "link-url";
  url.textContent = link.url;
  url.title = link.url;

  main.append(slug, url);
  if (link.description) {
    const desc = document.createElement("div");
    desc.className = "link-desc";
    desc.textContent = link.description;
    main.append(desc);
  }

  const meta = document.createElement("div");
  meta.className = "link-meta";

  const hits = document.createElement("span");
  hits.className = "badge";
  hits.textContent = `${link.hits} ${link.hits === 1 ? "hit" : "hits"}`;

  meta.append(hits, ghostButton("Copy", () => copyLink(link.slug)),
    ghostButton("Edit", () => { editingSlug = link.slug; renderCurrent(); }),
    ghostButton("Delete", () => onDelete(link.slug), "danger"));

  row.append(main, meta);
  return row;
}

function ghostButton(label, onClick, extra = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn ghost ${extra}`.trim();
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function editForm(link) {
  const form = document.createElement("form");
  form.className = "edit-form";

  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.value = link.url;
  urlInput.setAttribute("aria-label", `Destination URL for go/${link.slug}`);

  const descInput = document.createElement("input");
  descInput.type = "text";
  descInput.maxLength = 280;
  descInput.placeholder = "Description (optional)";
  descInput.value = link.description ?? "";
  descInput.setAttribute("aria-label", `Description for go/${link.slug}`);

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "btn primary";
  save.textContent = "Save";
  actions.append(save, ghostButton("Cancel", () => { editingSlug = null; renderCurrent(); }));

  form.append(urlInput, descInput, actions);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.update(link.slug, { url: urlInput.value.trim(), description: descInput.value.trim() });
      toast(`Updated go/${link.slug}.`, "success");
      editingSlug = null;
      await refresh(els.search.value.trim());
      loadInsights();
    } catch (err) {
      toast(err.message, "error");
    }
  });
  return form;
}

function render(links) {
  els.list.setAttribute("aria-busy", "false");
  els.list.innerHTML = "";
  els.count.textContent = links.length ? `· ${links.length}` : "";
  updateStats(links);

  if (links.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = els.search.value.trim()
      ? "No shortcuts match your search."
      : "No shortcuts yet. Create your first one above.";
    els.list.append(empty);
    return;
  }
  for (const link of links) els.list.append(linkRow(link));
}

let lastLinks = [];
function renderCurrent() {
  render(lastLinks);
}

async function copyLink(slug) {
  const absolute = `${location.origin}/go/${slug}`;
  try {
    await navigator.clipboard.writeText(absolute);
    toast(`Copied ${absolute}`, "success");
  } catch {
    toast(`Copy this: ${absolute}`, "info");
  }
}

async function refresh(query) {
  try {
    lastLinks = await api.list(query);
    render(lastLinks);
  } catch (err) {
    els.list.setAttribute("aria-busy", "false");
    toast(err.message, "error");
  }
}

async function onDelete(slug) {
  if (!confirm(`Delete go/${slug}?`)) return;
  try {
    await api.remove(slug);
    toast(`Deleted go/${slug}.`, "success");
    await refresh(els.search.value.trim());
    loadInsights();
  } catch (err) {
    toast(err.message, "error");
  }
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = { slug: els.slug.value.trim(), url: els.url.value.trim() };
  const description = els.description.value.trim();
  if (description) body.description = description;

  els.createBtn.disabled = true;
  try {
    const link = await api.create(body);
    toast(`Created go/${link.slug}.`, "success");
    els.form.reset();
    els.slug.focus();
    await refresh(els.search.value.trim());
    loadInsights();
  } catch (err) {
    toast(err.message, "error");
    els.slug.focus();
  } finally {
    els.createBtn.disabled = false;
  }
});

let searchTimer;
els.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refresh(els.search.value.trim()), 180);
});

// If a redirect missed, prefill the create form with the requested slug.
(function handleMissing() {
  const missing = new URLSearchParams(location.search).get("missing");
  if (!missing) return;
  els.slug.value = missing;
  toast(`No shortcut for go/${missing} yet — create it below.`, "info");
  els.url.focus();
  history.replaceState({}, "", location.pathname);
})();

refresh();
loadInsights();
