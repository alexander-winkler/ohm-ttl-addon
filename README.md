# OHM Lookup for QLever

A Firefox extension that adds SPARQL lookups for OpenHistoricalMap objects. It works on two sites:

- **qlever.dev/ohm-planet** — adds a lookup button next to every `node`, `way` and `relation` URI in the result table.
- **openhistoricalmap.org** — adds a "TTL" link in the sidebar title of any object page (`/node/…`, `/way/…`, `/relation/…`).

Clicking either one fetches the object's triples from the QLever OHM Planet endpoint and opens the result as Turtle in a new tab, with a compact prefix header and a raw/pretty toggle.

## Features

- Lookup buttons for OHM URIs on QLever result pages (links and plain-text URIs).
- "TTL" link in the sidebar title on openhistoricalmap.org object pages.
- CONSTRUCT query returning both outgoing triples and incoming references (including relation memberships).
- Turtle output beautified with `PREFIX` declarations — only the prefixes actually used are shown.
- Raw/pretty toggle and copy-to-clipboard in the result tab.
- Handles dynamically loaded content (QLever tables, OHM Turbo frames).

## Installation

Temporary install for development:

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on**.
3. Select the `manifest.json` file.

For a permanent install, package the directory as a `.zip` and submit it to addons.mozilla.org, or install it in a developer build with `xpinstall.signatures.required` disabled.

## Usage

- On `https://qlever.dev/ohm-planet`, run a query. Each OHM URI in the result gets a small magnifier button. Click it to open the object's triples.
- On `https://www.openhistoricalmap.org/relation/123` (or a node/way page), click the **TTL** link next to the title.

## How it works

For an object such as `https://www.openhistoricalmap.org/way/123`, the extension sends a POST request to the QLever endpoint:

```
POST https://qlever.dev/api/ohm-planet
Accept: text/turtle
Content-Type: application/x-www-form-urlencoded

query=CONSTRUCT { ?s ?p ?o } WHERE {
  { <https://www.openhistoricalmap.org/way/123> ?p ?o . BIND(<https://www.openhistoricalmap.org/way/123> AS ?s) }
  UNION
  { ?s ?p <https://www.openhistoricalmap.org/way/123> . BIND(<https://www.openhistoricalmap.org/way/123> AS ?o) }
}
```

The first branch collects everything the object points to (tags, geometry, members, metadata); the second collects everything pointing to it, which is how parent relations are found. Full IRIs in angle brackets are used instead of endpoint-specific prefixes so the query works for nodes, ways and relations alike.

## Configuration

- **Endpoint:** the `ENDPOINT` constant at the top of `content-script.js`.
- **URI base:** the `URI_BASE` / `TYPE_BASES` constants, which define the namespace of OHM objects.
- **Prefixes:** the `PREFIXES` array. Add a `[prefix, base]` pair to shorten additional namespaces; the longest matching base wins and only used prefixes are emitted.

If the OHM dataset uses a different host or key/tag namespace than assumed, update `URI_BASE`, `TYPE_BASES`, `OHM_RE` and the `ohmkey:`/`ohmvalue:` bases. The correct values can be read from the raw Turtle output using the **Show raw** toggle in the result tab.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension metadata, permissions, content script registration |
| `content-script.js` | URI detection, SPARQL query, Turtle beautification and display |

## Permissions

- `*://qlever.dev/*` — required to POST the SPARQL query to the endpoint.
- `activeTab` — used to open the result tab.

The content script matches `qlever.dev/ohm-planet` and `openhistoricalmap.org`.

## Notes

- Result tabs are generated client-side from a Blob URL; nothing is uploaded anywhere except the SPARQL query to `qlever.dev`.
- If the endpoint path changes, update `ENDPOINT` accordingly. The correct URL can be read from the browser's network panel while running a query on the QLever UI.

## Authorship

- **Concept and requirements:** the project idea, the SPARQL query approach and all feature requests came from the repository owner.
- **Code:** the extension code (`manifest.json`, `content-script.js`) and this README were written by **zib/konrad-1.2**, an AI assistant, in a conversational session, based on the owner's specifications and iterative feedback.


## License

MIT
