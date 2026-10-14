// Feed builder: lists categories and sources from /api/catalog, builds a
// /feed.ics link for the chosen sources, and previews upcoming events.
// Choices are kept in the page's address (?sources=…) so a selection can be shared.

const TIME_ZONE = "America/New_York";
const PREVIEW_LIMIT = 8;

let catalog = null;
let previewRequest = 0;
let previewTimer;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child !== undefined && child !== null) node.append(child);
  }
  return node;
}

function toast(message) {
  let node = document.querySelector(".toast");
  if (!node) {
    node = el("div", { class: "toast", role: "status" });
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove("show"), 1800);
}

async function copy(text, label = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    window.prompt("Copy this link:", text);
  }
}

function allSources() {
  return catalog.categories.flatMap((c) => c.sources);
}

function selectedIds() {
  return [...document.querySelectorAll("#picker input[name=source]:checked")].map((i) => i.value);
}

function feedUrl(ids) {
  const url = new URL("/feed.ics", location.origin);
  if (ids.length !== allSources().length) url.searchParams.set("sources", ids.join(","));
  // Keep commas readable; calendar apps accept them unescaped.
  return url.toString().replace(/%2C/g, ",");
}

function setLink(id, href) {
  const link = document.getElementById(id);
  if (href) {
    link.href = href;
    link.removeAttribute("aria-disabled");
    link.removeAttribute("tabindex");
  } else {
    link.removeAttribute("href");
    link.setAttribute("aria-disabled", "true");
    link.setAttribute("tabindex", "-1");
  }
}

// ----- Category cards -----

function renderCards() {
  const container = document.getElementById("category-cards");
  container.replaceChildren(
    ...catalog.categories.map((category) => {
      const actions = category.calendar
        ? [
            el("a", { class: "button primary", href: category.calendar.google, target: "_blank", rel: "noopener" }, "Add to Google Calendar"),
            el("button", { type: "button", class: "button", onclick: () => copy(category.calendar.ics, "iCal link copied") }, "Copy iCal link"),
          ]
        : [el("span", { class: "muted" }, "Subscribe link coming soon. Use the feed builder below in the meantime.")];

      return el(
        "article",
        { class: `card cat-${category.id}` },
        el("h3", {}, category.name),
        el("p", {}, category.description),
        el(
          "ul",
          { class: "org-list", "aria-label": `Organizations in ${category.name}` },
          category.sources.map((s) => el("li", {}, el("a", { href: s.homepage, target: "_blank", rel: "noopener" }, s.name))),
        ),
        el("div", { class: "card-actions" }, actions),
      );
    }),
  );
  container.removeAttribute("aria-busy");
}

// ----- Picker -----

function renderPicker(initial) {
  const picker = document.getElementById("picker");
  picker.replaceChildren(
    ...catalog.categories.map((category) => {
      const checkboxes = category.sources.map((source) =>
        el(
          "label",
          { class: "option" },
          el("input", { type: "checkbox", name: "source", value: source.id, checked: initial.has(source.id) }),
          el("span", {}, source.name),
        ),
      );
      const toggle = el("button", { type: "button", class: "link-button" });
      const group = el(
        "fieldset",
        { class: `group cat-${category.id}` },
        el("legend", {}, el("span", { class: "group-head" }, el("span", { class: "group-title" }, category.name), toggle)),
        el("div", { class: "options" }, checkboxes),
      );

      const boxes = () => [...group.querySelectorAll("input")];
      const syncToggle = () => {
        const all = boxes().every((b) => b.checked);
        toggle.textContent = all ? "Clear" : "Select all";
        toggle.setAttribute("aria-label", `${all ? "Clear" : "Select all"} in ${category.name}`);
      };
      toggle.addEventListener("click", () => {
        const all = boxes().every((b) => b.checked);
        boxes().forEach((b) => (b.checked = !all));
        syncToggle();
        update();
      });
      group.addEventListener("change", () => {
        syncToggle();
        update();
      });
      syncToggle();
      return group;
    }),
  );
}

// ----- Output -----

function update() {
  const ids = selectedIds();
  const total = allSources().length;
  const count = document.getElementById("selection-count");
  const input = document.getElementById("feed-url");
  const copyButton = document.getElementById("copy-feed");

  // Remember the selection in the address bar so it can be shared.
  const pageUrl = new URL(location.href);
  if (ids.length === total) pageUrl.searchParams.delete("sources");
  else pageUrl.searchParams.set("sources", ids.join(","));
  history.replaceState(null, "", pageUrl.toString().replace(/%2C/g, ","));

  if (ids.length === 0) {
    count.textContent = "Pick at least one organization.";
    input.value = "";
    copyButton.disabled = true;
    ["add-google", "add-apple", "add-outlook"].forEach((id) => setLink(id, null));
    renderPreview([], "Your feed is empty.");
    return;
  }

  count.textContent = ids.length === total ? `All ${total} organizations` : `${ids.length} of ${total} organizations`;
  const url = feedUrl(ids);
  const webcal = url.replace(/^https?:/, "webcal:");
  input.value = url;
  copyButton.disabled = false;
  setLink("add-google", `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`);
  setLink("add-apple", webcal);
  setLink(
    "add-outlook",
    `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent("Philadelphia Urbanism Events")}`,
  );

  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => loadPreview(ids), 300);
}

// ----- Preview -----

function formatWhen(event) {
  if (event.allDay) {
    const [y, m, d] = event.start.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const fmt = (opts) => date.toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
    return { day: fmt({ month: "short", day: "numeric" }), sub: `${fmt({ weekday: "short" })} · all day` };
  }
  const date = new Date(event.start);
  const fmt = (opts) => date.toLocaleString("en-US", { timeZone: TIME_ZONE, ...opts });
  return { day: fmt({ month: "short", day: "numeric" }), sub: `${fmt({ weekday: "short" })} ${fmt({ hour: "numeric", minute: "2-digit" })}` };
}

function renderPreview(events, emptyMessage) {
  const list = document.getElementById("preview-list");
  if (events.length === 0) {
    list.replaceChildren(el("li", { class: "preview-empty" }, emptyMessage));
    return;
  }
  list.replaceChildren(
    ...events.map((event) => {
      const when = formatWhen(event);
      const title = event.url
        ? el("a", { href: event.url, target: "_blank", rel: "noopener" }, event.title)
        : event.title;
      return el(
        "li",
        {},
        el("div", { class: "preview-date" }, el("strong", {}, when.day), when.sub),
        el(
          "div",
          {},
          el("div", { class: "preview-title" }, title),
          el("div", { class: "preview-meta" }, [event.sourceName, event.location].filter(Boolean).join(" · ")),
        ),
      );
    }),
  );
}

async function loadPreview(ids) {
  const request = ++previewRequest;
  const list = document.getElementById("preview-list");
  list.setAttribute("aria-busy", "true");
  if (!list.children.length) list.replaceChildren(el("li", { class: "preview-empty" }, "Loading events…"));
  try {
    const params = new URLSearchParams({ format: "json", limit: String(PREVIEW_LIMIT) });
    if (ids.length !== allSources().length) params.set("sources", ids.join(","));
    const response = await fetch(`/api/feed?${params}`);
    if (!response.ok) throw new Error(String(response.status));
    const { events } = await response.json();
    if (request === previewRequest) renderPreview(events, "No upcoming events from these organizations right now.");
  } catch {
    if (request === previewRequest) renderPreview([], "Couldn't load the preview. The feed link still works.");
  } finally {
    if (request === previewRequest) list.removeAttribute("aria-busy");
  }
}

// ----- Start -----

async function start() {
  try {
    const response = await fetch("/api/catalog");
    if (!response.ok) throw new Error(String(response.status));
    catalog = await response.json();
  } catch {
    const message = el("p", { class: "muted" }, "Couldn't load the list of organizations. Try reloading the page.");
    document.getElementById("category-cards").replaceChildren(message);
    document.getElementById("picker").replaceChildren(message.cloneNode(true));
    return;
  }

  const fromUrl = (new URLSearchParams(location.search).get("sources") ?? "").split(",").filter(Boolean);
  const known = new Set(allSources().map((s) => s.id));
  const initial = new Set(fromUrl.filter((id) => known.has(id)));
  // The "Submit a calendar" links appear once a form link is configured.
  if (catalog.submitCalendarUrl) {
    document.querySelectorAll("[data-submit-calendar-link]").forEach((a) => (a.href = catalog.submitCalendarUrl));
    document.querySelectorAll("[data-submit-calendar]").forEach((node) => (node.hidden = false));
  }

  // With no choices in the address, start with everything selected.
  renderCards();
  renderPicker(initial.size ? initial : known);
  document.getElementById("copy-feed").addEventListener("click", () => copy(document.getElementById("feed-url").value));
  update();
}

start();
