// ============================================================
//  OHM Lookup for QLever  +  TTL link in title on OHM pages
//    POST https://qlever.dev/api/ohm-planet
//    Accept: text/turtle
// ============================================================

const ENDPOINT       = "https://qlever.dev/api/ohm-planet";
const SITE_HOST      = "openhistoricalmap.org";
const URI_BASE       = "https://www.openhistoricalmap.org/";

const TYPE_BASES = {
  node:     URI_BASE + "node/",
  way:      URI_BASE + "way/",
  relation: URI_BASE + "relation/",
};

const OHM_RE =
  /https?:\/\/(?:www\.)?openhistoricalmap\.org\/(node|way|relation)\/(\d+)/gi;

// ------------------------------------------------------------
//  Prefixes for the beautified TTL view
//  (verify against the raw output; adjust if your dataset
//   uses different key/tag namespaces)
// ------------------------------------------------------------
const PREFIXES = [
  ["ohmnode:",  TYPE_BASES.node],
  ["ohmway:",   TYPE_BASES.way],
  ["ohmrel:",   TYPE_BASES.relation],
  ["ohmkey:",   URI_BASE + "wiki/Key:"],
  ["ohmvalue:", URI_BASE + "wiki/Tag:"],
  ["osm2rdf:",  "https://osm2rdf.cs.uni-freiburg.de/rdf#"],
  ["spatial:",  "http://www.opengis.net/rdf#"],
  ["geo:",      "http://www.opengis.net/ont/geosparql#"],
  ["geof:",     "http://www.opengis.net/def/function/geosparql/"],
  ["rdf:",      "http://www.w3.org/1999/02/22-rdf-syntax-ns#"],
  ["rdfs:",     "http://www.w3.org/2000/01/rdf-schema#"],
  ["xsd:",      "http://www.w3.org/2001/XMLSchema#"],
  ["schema:",   "https://schema.org/"],
  ["dcterms:",  "http://purl.org/dc/terms/"],
  ["ohm:",      URI_BASE],
];
const PREFIXES_BY_LEN = [...PREFIXES].sort((a, b) => b[1].length - a[1].length);

// ------------------------------------------------------------
//  1. SPARQL query  (full URI in <...>)
// ------------------------------------------------------------
function buildSparqlQuery(type, id) {
  const base = TYPE_BASES[type];
  if (!base) throw new Error("Unknown OHM type: " + type);

  const uri = `<${base}${id}>`;

  return `CONSTRUCT { ?s ?p ?o } WHERE {
  { ${uri} ?p ?o . BIND(${uri} AS ?s) }
  UNION
  { ?s ?p ${uri} . BIND(${uri} AS ?o) }
}`;
}

// ------------------------------------------------------------
//  2. POST the query  ->  Turtle
// ------------------------------------------------------------
async function fetchTurtle(query) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Accept": "text/turtle",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ query }).toString(),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  if (/^\s*<!doctype|^\s*<html/i.test(text))
    throw new Error("Server returned HTML instead of Turtle (check the endpoint).");
  return text;
}

// ------------------------------------------------------------
//  3. Beautify Turtle: shorten IRIs + only used PREFIXes
// ------------------------------------------------------------
function shortenIri(iri, used) {
  for (const [pfx, base] of PREFIXES_BY_LEN) {
    if (iri.length > base.length && iri.startsWith(base)) {
      const local = iri.slice(base.length);
      if (/^[A-Za-z0-9_][A-Za-z0-9_.\-]*$/.test(local)) {
        used.add(pfx);
        return pfx + local;
      }
    }
  }
  return `<${iri}>`;
}

function beautifyTurtle(raw) {
  const used = new Set();
  const body = raw
    .replace(/<([^<>"{}|^`\\\x00-\x20]*)>/g, (_, iri) => shortenIri(iri, used))
    .trim();

  const header = PREFIXES
    .filter(([pfx]) => used.has(pfx))
    .map(([pfx, base]) => `PREFIX ${pfx} <${base}>`)
    .join("\n");

  return (header ? header + "\n\n" : "") + body + "\n";
}

// ------------------------------------------------------------
//  4. Show Turtle in a new tab (toggle + copy)
// ------------------------------------------------------------
function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function openTtlInNewTab(rawTtl, title = "OHM-TTL") {
  const pretty = beautifyTurtle(rawTtl);
  const json = JSON.stringify({ title, raw: rawTtl, pretty })
    .replace(/<\//g, "<\\/");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; font-family: ui-monospace, Menlo, Consolas, monospace;
         background: #1e1e1e; color: #d4d4d4; }
  header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
           padding: 8px 12px; background: #2d2d2d; border-bottom: 1px solid #444;
           font-family: system-ui, sans-serif; font-size: 13px; }
  header .title { color: #9cdcfe; font-weight: 600; }
  header .info  { color: #888; }
  header button { background: #3a3a3a; color: #ddd; border: 1px solid #555;
                  border-radius: 5px; padding: 3px 9px; cursor: pointer; font-size: 12px; }
  header button:hover { background: #4a4a4a; }
  pre { margin: 0; padding: 12px; white-space: pre; overflow: auto; line-height: 1.45; }
</style>
</head>
<body>
<header>
  <span class="title">${escapeHtml(title)}</span>
  <span class="info" id="info"></span>
  <button id="toggle">Show raw</button>
  <button id="copy">Copy</button>
</header>
<pre id="ttl"></pre>
<script>
const DATA = ${json};
let showRaw = false;
const pre  = document.getElementById("ttl");
const info = document.getElementById("info");
const toggle = document.getElementById("toggle");
function render() {
  const txt = showRaw ? DATA.raw : DATA.pretty;
  pre.textContent = txt;
  info.textContent = (showRaw ? "Raw" : "With prefixes") + " · " + txt.length + " chars";
  toggle.textContent = showRaw ? "Show pretty" : "Show raw";
}
toggle.onclick = () => { showRaw = !showRaw; render(); };
document.getElementById("copy").onclick = async () => {
  const txt = pre.textContent;
  try { await navigator.clipboard.writeText(txt); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = txt; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
  }
  const b = document.getElementById("copy");
  b.textContent = "Copied!"; setTimeout(() => (b.textContent = "Copy"), 1200);
};
render();
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  window.open(URL.createObjectURL(blob), "_blank");
}

// ------------------------------------------------------------
//  5. Shared load logic
// ------------------------------------------------------------
async function runLookup(type, id) {
  try {
    const query = buildSparqlQuery(type, id);
    const ttl = await fetchTurtle(query);
    openTtlInNewTab(ttl, `${type}/${id} – Turtle`);
  } catch (err) {
    console.error(err);
    alert(`Failed to load TTL for ${type}/${id}\n\n${err.message || err}`);
  }
}

const LOOKUP_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
  'aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/>' +
  '<line x1="15.5" y1="15.5" x2="21" y2="21"/></svg>';

// ------------------------------------------------------------
//  6. Lookup button for QLever result pages
// ------------------------------------------------------------
function createButton(type, id) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ohm-lookup-btn";
  btn.title = `Open TTL for ${type}/${id}`;
  btn.setAttribute("aria-label", `Open TTL for ${type}/${id}`);
  btn.style.cssText =
    "background:none;border:none;padding:0;margin-left:4px;cursor:pointer;" +
    "color:#666;line-height:0;vertical-align:middle;opacity:.65;";
  btn.innerHTML = LOOKUP_SVG;

  btn.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
  btn.addEventListener("mouseleave", () => (btn.style.opacity = "0.65"));
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.disabled = true;
    btn.style.opacity = "0.3";
    btn.style.cursor = "wait";
    await runLookup(type, id);
    btn.disabled = false;
    btn.style.opacity = "0.65";
    btn.style.cursor = "pointer";
  });

  return btn;
}

// ------------------------------------------------------------
//  7. TTL link in the title on openhistoricalmap.org
// ------------------------------------------------------------
function createTtlLink(type, id) {
  const a = document.createElement("a");
  a.href = "#";
  a.className = "ohm-ttl-link";
  a.title = `Open TTL for ${type}/${id}`;
  a.setAttribute("aria-label", `Open TTL for ${type}/${id}`);
  a.style.cssText =
    "display:inline-flex;align-items:center;gap:4px;margin-left:10px;" +
    "font-size:0.8rem;font-weight:500;color:#6c757d;text-decoration:none;" +
    "vertical-align:middle;opacity:.85;";
  a.innerHTML = LOOKUP_SVG + "<span>TTL</span>";

  a.addEventListener("mouseenter", () => (a.style.opacity = "1"));
  a.addEventListener("mouseleave", () => (a.style.opacity = "0.85"));
  a.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    a.style.opacity = "0.4";
    await runLookup(type, id);
    a.style.opacity = "0.85";
  });

  return a;
}

function handleSitePage() {
  if (!location.hostname.endsWith(SITE_HOST)) return;

  const m = location.pathname.match(/^\/(node|way|relation)\/(\d+)/);
  if (!m) return;
  const type = m[1];
  const id = m[2];

  let h2 = document.querySelector("#sidebar_content h2");
  if (!h2) {
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    h2 = [...document.querySelectorAll("h2")]
      .find((el) => el.textContent.trim().startsWith(label));
  }
  if (!h2 || h2.dataset.ohmTtlDone) return;
  h2.dataset.ohmTtlDone = "1";

  h2.appendChild(createTtlLink(type, id));
}

// ------------------------------------------------------------
//  8. Scan the DOM (qlever.dev only)
// ------------------------------------------------------------
function handleAnchor(a) {
  if (a.dataset.ohmLookupDone) return;
  const m = a.href.match(
    /^https?:\/\/(?:www\.)?openhistoricalmap\.org\/(node|way|relation)\/(\d+)/i
  );
  if (!m) return;
  a.dataset.ohmLookupDone = "1";
  a.parentNode.insertBefore(createButton(m[1].toLowerCase(), m[2]), a.nextSibling);
}

function processTextNode(textNode) {
  const text = textNode.nodeValue;
  const frag = document.createDocumentFragment();
  let last = 0, m;
  OHM_RE.lastIndex = 0;
  while ((m = OHM_RE.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const full = m[0];
    const link = document.createElement("a");
    link.href = full;
    link.textContent = full;
    link.target = "_blank";
    link.rel = "noopener";
    link.dataset.ohmLookupDone = "1";
    frag.appendChild(link);
    frag.appendChild(createButton(m[1].toLowerCase(), m[2]));
    last = m.index + full.length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  if (frag.childNodes.length) textNode.parentNode.replaceChild(frag, textNode);
}

function processRoot(root) {
  root.querySelectorAll?.("a[href]").forEach(handleAnchor);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const v = node.nodeValue;
      if (!v || !v.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (p && p.closest("a, script, style, textarea, noscript, .ohm-lookup-btn"))
        return NodeFilter.FILTER_REJECT;
      OHM_RE.lastIndex = 0;
      return OHM_RE.test(v) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(processTextNode);
}

// ------------------------------------------------------------
//  9. Start + dynamic content (QLever tables, OHM Turbo)
// ------------------------------------------------------------
function refresh() {
  if (location.hostname.endsWith("qlever.dev")) processRoot(document.body);
  handleSitePage();
}

function start() {
  refresh();

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refresh();
    });
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("turbo:load", refresh);
  document.addEventListener("turbo:render", refresh);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}