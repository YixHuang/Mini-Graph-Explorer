# Mini Graph Explorer

A small browser-only graph visualization app. It uses plain HTML, CSS, and JavaScript, with no external libraries or build step.

This README is written to make the displayed graph parameters easy to audit against the implementation in `scripts/app.js`. The notes below describe what the current code does, including special cases, exact searches, bounds, and search limits.

## Project Structure

- `index.html`: page structure and links to the external CSS/JS files.
- `styles/main.css`: all visual styling.
- `scripts/app.js`: graph state, graph generation/parsing, drawing, UI events, and parameter algorithms.
- `tests/parameter-tests.html`: browser-based regression tests for selected standard graphs and displayed parameters.

## Running Checks

Run the browser regression suite from the command line:

```sh
node scripts/run-parameter-tests.mjs
```

The command needs Chrome or Chromium. It discovers common local Chrome installs automatically; if needed, set `CHROME_PATH` to a Chrome executable.

You can also open `tests/parameter-tests.html` in a browser. The test page loads the real explorer in a hidden iframe, uses `window.MiniGraphExplorerTestAPI`, and checks selected parameter values for standard graphs such as `K3`, `P3`, `C4`, `K5`, `K_{3,3}`, Petersen graph, and `Q3`. It also includes a few minor-containment checks with witness expectations.

## Deployment

The app is static. GitHub Actions deploys the repository root to GitHub Pages on pushes to `main`, so `index.html`, `styles/`, and `scripts/` are served without a build step.

## Visitor Stats

The visitor counter is optional, because GitHub Pages cannot maintain shared visit totals by itself. The frontend now includes a visitor panel with a total-visit card, a top-country list, and a small SVG world map. It expects a lightweight endpoint that returns aggregate counts.

### Frontend Files

- `scripts/visitor-stats-config.js`: small config file for the stats endpoint, site id, geo lookup URL, and optional preview `demoData`.
- `assets/world-map.svg`: vendored world SVG used for the choropleth map.
- `visitor-stats/google-apps-script/Code.gs`: minimal Google Apps Script backend template.

### Endpoint Contract

The browser calls the configured endpoint with a GET request like:

```text
...?action=hit&site=mini-graph-explorer&country=US&countryName=United%20States&session=...&path=/
```

The endpoint should respond with JSON in this shape:

```json
{
  "ok": true,
  "siteId": "mini-graph-explorer",
  "totalVisits": 1234,
  "countries": { "US": 420, "CN": 180, "GB": 65 },
  "countryNames": {
    "US": "United States",
    "CN": "China",
    "GB": "United Kingdom"
  },
  "updatedAt": "2026-04-24T18:20:00.000Z"
}
```

### Included Google Apps Script Template

`visitor-stats/google-apps-script/Code.gs` stores aggregates in `PropertiesService`:

- total visits at `<siteId>:total`
- per-country counts at `<siteId>:countries`
- per-country display names at `<siteId>:countryNames`
- last update time at `<siteId>:updatedAt`

It also uses `CacheService` to suppress repeated counts from the same browser session for 20 minutes.

### Setup Steps

1. Create a standalone Google Apps Script project.
2. Paste in `visitor-stats/google-apps-script/Code.gs`.
3. Deploy it as a web app with access set to `Anyone`.
4. Copy the deployment URL into `scripts/visitor-stats-config.js` as `endpoint`.
5. Push the updated repo to GitHub Pages.

The frontend uses `https://ipwho.is/` by default to estimate the visitor country code in the browser before sending the hit to the endpoint. If that lookup fails, the visit is recorded under `ZZ`.

## Shared Conventions

- Graphs are simple undirected graphs.
- Vertices are stored in `nodes`; edges are stored in `edges` as `{ from, to, key }`.
- Most algorithms first build an adjacency list or adjacency matrix from the current graph.
- `maxExactPropertyVertices = 30`, used by several backtracking searches.
- `maxBitmaskPropertyVertices = 20`, used by bitmask subset/DP algorithms.
- `hardSearchStepLimit = 120000`, used by bounded Hamiltonian and coloring searches.
- `maxExactEdgeColoringEdges = 28`, used for exact chromatic index search.

## Displayed Parameters

### Connected?

Function: `isConnected()`.

The empty graph is treated as not connected. Otherwise the code runs BFS from the first vertex and returns `Yes` exactly when every vertex is reached.

### Vertex Connectivity kappa(G)

Function: `getVertexConnectivityResult()`.

If the graph has at most one vertex, or is disconnected, the result is `0`. If the graph is complete, the result is `n - 1`. Otherwise the code computes the exact vertex connectivity by vertex-splitting and max-flow: every vertex is split into an in/out pair with capacity `1`, except the current source and sink, which get capacity `n + 1`. The algorithm checks non-adjacent source-sink pairs and returns the minimum local vertex cut.

### Edge Connectivity lambda(G)

Function: `getEdgeConnectivityResult()`.

If the graph has at most one vertex, or is disconnected, the result is `0`. Otherwise the code computes the exact value using unit-capacity max-flow from vertex `0` to every other vertex, and returns the minimum flow value.

### Toughness

Function: `getToughnessResult()`.

If the graph is empty or disconnected, the result is `0`. If it is complete, the result is `Infinity`. For complete multipartite graphs, the code returns `(n - largest part) / (largest part)`, reduced as a fraction. For generated cube graphs not caught by the complete-graph case, the code returns `1`.

For graphs with at most `20` vertices, the code enumerates every nonempty proper vertex-deletion set `S`. If `G - S` has more than one component, it minimizes `|S| / components(G - S)` and returns the reduced fraction. For graphs with more than `20` vertices, the code does not enumerate all sets; it returns the bound `<= kappa(G) / 2`.

### Hamiltonian?

Function: `getHamiltonianResult()`.

This means Hamiltonian cycle. The code returns `No` for graphs with fewer than `3` vertices, disconnected graphs, and graphs with minimum degree less than `2`. It returns immediately from special cases: complete graphs are `Yes`; generated paths are `No`; generated cycles and wheels are `Yes`; complete multipartite graphs are `Yes` exactly when the largest part has size at most the sum of the other parts; cube graphs are `Yes` for dimension at least `2`.

For other graphs with at most `20` vertices, the code uses exact bitmask dynamic programming anchored at vertex `0`. For larger graphs, it uses a bounded DFS search for a Hamiltonian cycle. If that bounded search exceeds `120000` recursive steps, the result is `Unknown (bounded search)`.

### Traceable?

Function: `getTraceableResult()`.

This means Hamiltonian path. The empty graph returns `No`; a one-vertex graph and complete graphs return `Yes`; disconnected graphs return `No`. Generated paths, cycles, wheels, Petersen graph, and cube graphs return `Yes`. Complete multipartite graphs return `Yes` exactly when the largest part has size at most the sum of the other parts plus `1`.

For other graphs with at most `30` vertices, the code runs bounded DFS from every possible start vertex. If a Hamiltonian path is found, the result is `Yes`; if the search finishes, the result is `No`; if it exceeds `120000` recursive steps, the result is `Unknown (bounded search)`. For graphs with more than `30` vertices, the code returns `Yes` if the Hamiltonian-cycle routine returns `Yes`; otherwise it returns `Unknown (bounded search)`.

### Planar?

Function: `getPlanarityResult()`, using `getKnownPlanarityResult()`.

The code first handles known generated graph families:

- graphs with at most `4` vertices: `Yes`;
- paths, cycles, wheels, and empty graphs: `Yes`;
- complete graphs: `Yes` for `K_n` with `n <= 4`, otherwise `No`;
- complete bipartite graphs: `Yes` if the smaller part has size at most `2`, otherwise `No`;
- cube graphs: `Yes` for dimension at most `3`, otherwise `No`;
- Petersen graph: `No`;
- Cartesian products: path/path, cycle/path, and path/cycle return `Yes`; cycle/cycle returns `No`.

After the known-family checks, the code applies necessary edge-count tests: if `v >= 3` and `e > 3v - 6`, it returns `No`; if the graph is bipartite and `e > 2v - 4`, it returns `No`.

Then it reduces the graph for planarity by repeatedly deleting degree `0` or `1` vertices and suppressing degree `2` vertices. If the reduced graph has at most `16` vertices, the code searches for `K5` and `K3,3` minors using the app's minor-search routine. If neither minor is found, it returns `Yes`; if one is found, it returns `No`; if the minor search cannot finish, it returns `Unknown`. Larger reduced graphs return `Unknown`.

### Genus

Function: `getGenusResult()`.

The code uses exact formulas for several generated families:

- empty graph: `0`;
- complete graph `K_n`: `0` for `n <= 2`, otherwise `ceil((n - 3)(n - 4) / 12)`;
- complete bipartite graph `K_{m,n}`: `ceil(max(0, (m - 2)(n - 2)) / 4)`;
- paths, cycles, wheels, and empty graphs: `0`;
- cube graph `Q_d`: `0` for `d <= 3`, otherwise `1 + 2^(d - 3)(d - 4)`;
- Petersen graph: `1`;
- Cartesian path/path, cycle/path, and path/cycle: `0`;
- Cartesian cycle/cycle: `1`.

For multipartite graphs with more than two parts, the code returns `0` if the planarity routine says `Yes`; otherwise it returns a lower bound from `ceil((e - 3v + 6) / 6)`, or `>= 1` when nonplanarity is known but that lower bound is not positive.

For other graphs, the code first computes the same Euler lower bound. If positive, it returns `>= lower`. If not positive, it asks the planarity routine: planar gives `0`, nonplanar gives `>= 1`, and unknown planarity gives `Unknown`.

### Treewidth tw(G)

Function: `getTreewidthResult()`.

The code returns exact values for these cases: empty graph and edgeless graphs `0`; complete graph `n - 1`; path `1` when it has at least two vertices; cycle `2`; wheel `3`; complete multipartite graph `n - largest part`.

For other graphs, it computes lower and upper bounds:

- lower bound: maximum of a degeneracy lower bound and a greedy clique-size lower bound minus `1`;
- upper bound: minimum of two greedy elimination widths, using min-fill and min-degree orders.

If the bounds agree, that value is returned. If the graph has at most `11` vertices, the code attempts an exact branch-and-bound elimination search with a `350000` step limit. If that search finishes, the exact value is returned. Otherwise the UI shows the remaining bounds as `>= lower, <= upper`.

### Independence Number alpha(G)

Function: `getIndependenceNumberResult()`.

The code returns exact values for complete graphs, edgeless graphs, paths, cycles, wheels, complete multipartite graphs, and cube graphs. For other graphs with at most `20` vertices, it checks every vertex subset by bitmask and returns the maximum independent-set size exactly. For graphs with more than `20` vertices, it returns a greedy lower bound as `>= value`.

### Chromatic Number chi(G)

Function: `getChromaticNumberResult()`.

The code returns exact values for complete graphs, edgeless graphs, paths, cycles, wheels, complete multipartite graphs, and cube graphs. For graphs with more than `30` vertices, it tests bipartiteness; bipartite graphs return exactly `1` or `2`, while non-bipartite graphs return a greedy coloring upper bound as `<= value`.

For other graphs, the code tries `k = 1, 2, ...` colors using recursive backtracking ordered by decreasing degree. If coloring succeeds, that `k` is returned. If the search exceeds `120000` recursive steps, the code returns a greedy upper bound as `<= value`.

### Chromatic Index chi'(G)

Function: `getChromaticIndexResult()`.

If there are no edges, the result is `0`. Complete graphs use the exact formula: `n - 1` when `n` is even, and `n` when `n` is odd. Let `Delta` be the maximum degree.

If the graph has more than `28` edges, the code returns `Delta` exactly for bipartite graphs; otherwise it returns Vizing's upper bound `<= Delta + 1`. For graphs with at most `28` edges, it backtracks to test edge colorings with `Delta` colors and then `Delta + 1` colors, returning the first successful value.

### Girth

Function: `getGirthResult()`.

The code runs BFS from every vertex and updates the best cycle length whenever it sees a non-tree edge. If no cycle is found, the result is `Infinity`.

### Diameter and Radius

Function: `getDistanceParameters()`.

The empty graph returns `N/A` for both. A disconnected graph returns `Infinity` for both. Otherwise the code runs BFS from every vertex, computes each eccentricity, then returns the maximum eccentricity as diameter and the minimum eccentricity as radius.

## Click-to-Compute Parameters

### Find Containment

Function: `runFindMinor()`, dispatching through `getContainmentResult()`.

The target graph is parsed using the same graph-description parser as the main graph input, including saved graph names. The selector supports four modes: minor, subdivision, induced subgraph, and subgraph.

In subgraph mode, the code searches for an injective vertex map that preserves every target edge. Extra host edges among the chosen vertices are allowed. The search is exact when it finishes; if it exceeds its step limit, the result is `Search too large for exact subgraph test`.

In induced subgraph mode, the code searches for an injective vertex map that preserves both edges and non-edges: every target vertex pair is adjacent exactly when the mapped host pair is adjacent. The search is exact when it finishes; if it exceeds its step limit, the result is `Search too large for exact induced subgraph test`.

In subdivision mode, the code searches for a topological copy of the target: target vertices map injectively to branch vertices of the host, and target edges map to host paths whose internal vertices are pairwise disjoint and are not branch vertices. Direct edges are allowed as length-1 paths. If the graph is beyond the exact search limits, the result is `Search too large for exact subdivision test`.

In minor mode, the empty target graph is always a minor. If the host graph is empty, if the target has more vertices than the host, or if the target has more edges than the host, the code returns `No`.

The code first searches for the target as a subgraph. If found, it returns `Yes` with a vertex mapping and edge witnesses. If not, it compares treewidth bounds; if the target lower bound is larger than the host upper bound, it returns `No`.

Then the code attempts exact minor search when the host has at most `16` vertices and the target has at most `9` non-isolated vertices. It enumerates connected, pairwise-disjoint branch sets in the host and checks adjacency between branch sets. Isolated target vertices are assigned unused host vertices. The exact search has a `700000` step limit. A `Yes` result includes witness branch sets and edge witnesses; if the search is too large, the result is `Search too large for exact minor test`.

### Spectrum

Function: `computeSpectrum()`.

The code builds the adjacency matrix `A(G)` and computes its eigenvalues numerically using a Jacobi method for symmetric matrices. Eigenvalues are sorted from largest to smallest and grouped by approximate equality with tolerance `1e-6`.

Formatting is exact-looking when possible: integers are printed as integers; some quadratic surds are recognized by a bounded search with denominator at most `12` and radicand at most `100`; otherwise values are rounded to six decimal places. Multiplicities are displayed as powers, for example `2^{3}`.

## Important Limits

Some outputs are exact and some are intentionally bounded. In the UI, a displayed inequality such as `>=` or `<=` means the code did not prove the exact value for the current graph. `Unknown (bounded search)` means the relevant backtracking search hit its step limit before proving either answer.
