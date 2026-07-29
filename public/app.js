// Minimal vanilla-JS client. Intentionally dependency-free — the engineering
// focus of this project is the backend service (see README tradeoffs).

const api = {
  async list(query) {
    const url = query ? `/api/links?q=${encodeURIComponent(query)}` : "/api/links";
    const res = await fetch(url);
    if (!res.ok) throw await toError(res);
    return (await res.json()).data;
  },
  async create(body) {
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await toError(res);
    return (await res.json()).data;
  },
  async remove(slug) {
    const res = await fetch(`/api/links/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) throw await toError(res);
  },
};

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
  search: document.getElementById("search"),
  list: document.getElementById("list"),
  status: document.getElementById("status"),
};

function setStatus(message, kind) {
  els.status.textContent = message;
  els.status.className = `status${kind ? " " + kind : ""}`;
  els.status.hidden = !message;
}

function render(links) {
  els.list.innerHTML = "";
  if (links.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No shortcuts yet. Create your first one above.";
    els.list.append(empty);
    return;
  }

  for (const link of links) {
    const row = document.createElement("div");
    row.className = "link-row";

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

    const copy = document.createElement("button");
    copy.className = "btn ghost";
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => copyLink(link.slug, copy));

    const del = document.createElement("button");
    del.className = "btn ghost danger";
    del.type = "button";
    del.textContent = "Delete";
    del.setAttribute("aria-label", `Delete go/${link.slug}`);
    del.addEventListener("click", () => onDelete(link.slug));

    meta.append(hits, copy, del);
    row.append(main, meta);
    els.list.append(row);
  }
}

async function copyLink(slug, button) {
  const absolute = `${location.origin}/go/${slug}`;
  try {
    await navigator.clipboard.writeText(absolute);
    const original = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => (button.textContent = original), 1200);
  } catch {
    setStatus(`Copy this: ${absolute}`, "success");
  }
}

async function refresh(query) {
  try {
    render(await api.list(query));
  } catch (err) {
    setStatus(err.message, "error");
  }
}

async function onDelete(slug) {
  if (!confirm(`Delete go/${slug}?`)) return;
  try {
    await api.remove(slug);
    setStatus(`Deleted go/${slug}.`, "success");
    await refresh(els.search.value.trim());
  } catch (err) {
    setStatus(err.message, "error");
  }
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = {
    slug: els.slug.value.trim(),
    url: els.url.value.trim(),
  };
  const description = els.description.value.trim();
  if (description) body.description = description;

  try {
    const link = await api.create(body);
    setStatus(`Created go/${link.slug}.`, "success");
    els.form.reset();
    els.slug.focus();
    await refresh(els.search.value.trim());
  } catch (err) {
    setStatus(err.message, "error");
    els.slug.focus();
  }
});

let searchTimer;
els.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refresh(els.search.value.trim()), 180);
});

// If a redirect missed, prefill the create form with the requested slug.
function handleMissing() {
  const params = new URLSearchParams(location.search);
  const missing = params.get("missing");
  if (!missing) return;
  els.slug.value = missing;
  setStatus(`No shortcut for go/${missing} yet — create it below.`, null);
  els.url.focus();
  history.replaceState({}, "", location.pathname);
}

handleMissing();
refresh();
