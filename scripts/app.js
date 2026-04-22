    const nodes = [];
    const edges = [];
    let nextNodeId = 1;

    const nodeInput = document.getElementById("nodeInput");
    const fromInput = document.getElementById("fromInput");
    const toInput = document.getElementById("toInput");
    const addNodeBtn = document.getElementById("addNodeBtn");
    const deleteNodeBtn = document.getElementById("deleteNodeBtn");
    const addEdgeBtn = document.getElementById("addEdgeBtn");
    const deleteEdgeBtn = document.getElementById("deleteEdgeBtn");
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");
    const resetBtn = document.getElementById("resetBtn");
    const labelToggle = document.getElementById("labelToggle");
    const sizeSlider = document.getElementById("sizeSlider");
    const sizeValue = document.getElementById("sizeValue");
    const nodeColorInput = document.getElementById("nodeColorInput");
    const edgeColorInput = document.getElementById("edgeColorInput");
    const descriptionInput = document.getElementById("descriptionInput");
    const generateGraphBtn = document.getElementById("generateGraphBtn");
    const saveGraphNameInput = document.getElementById("saveGraphNameInput");
    const saveGraphBtn = document.getElementById("saveGraphBtn");
    const savedGraphList = document.getElementById("savedGraphList");
    const dictionarySearch = document.getElementById("dictionarySearch");
    const dictionaryList = document.getElementById("dictionaryList");
    const topToolButtons = Array.from(document.querySelectorAll("[data-tool-tab]"));
    const topToolPanels = Array.from(document.querySelectorAll("[data-tool-panel]"));
    const matrixInput = document.getElementById("matrixInput");
    const generateMatrixBtn = document.getElementById("generateMatrixBtn");
    const status = document.getElementById("status");
    const propertyBox = document.getElementById("propertyBox");
    const listBox = document.getElementById("listBox");
    const graphCanvas = document.getElementById("graphCanvas");
    const ctx = graphCanvas.getContext("2d");
    const undoStack = [];
    const redoStack = [];
    const maxExactPropertyVertices = 30;
    const maxBitmaskPropertyVertices = 20;
    const maxExactEdgeColoringEdges = 28;
    const hardSearchStepLimit = 120000;
    const maxGeneratedVertices = 80;
    const labelPreferenceKey = "miniGraphExplorer.showLabels";
    const savedGraphsKey = "miniGraphExplorer.savedGraphs";
    const savedGraphs = loadSavedGraphs();
    let showLabels = loadLabelPreference();
    let currentGraphName = "Empty graph";
    let currentGraphMeta = { type: "empty", parts: [] };
    let nodeColor = "#1e6f5c";
    let edgeColor = "#8b6f47";
    let minorQuery = "";
    let minorResultText = "";
    let spectrumResultText = "";

    const physics = {
      repulsion: 9000,
      springLength: 130,
      springStrength: 0.003,
      damping: 0.92,
      centerPull: 0.0015,
      maxSpeed: 8,
      nodeRadius: 14
    };

    const pointer = {
      draggingNode: null,
      dragGroup: [],
      offsetX: 0,
      offsetY: 0,
      startSnapshot: null,
      moved: false,
      wasFixed: false
    };

    function normalizeName(value) {
      return value.trim();
    }

    function resetMinorResultForGraphChange() {
      minorResultText = "";
      spectrumResultText = "";
    }

    function randomInRange(min, max) {
      return min + Math.random() * (max - min);
    }

    function loadLabelPreference() {
      try {
        return localStorage.getItem(labelPreferenceKey) !== "false";
      } catch (error) {
        return true;
      }
    }

    function saveLabelPreference(value) {
      try {
        localStorage.setItem(labelPreferenceKey, String(value));
      } catch (error) {
        // Ignore storage errors so the app still works in restricted browsers.
      }
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function loadSavedGraphs() {
      try {
        const parsed = JSON.parse(localStorage.getItem(savedGraphsKey) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return {};
        }

        return parsed;
      } catch (error) {
        return {};
      }
    }

    function persistSavedGraphs() {
      try {
        localStorage.setItem(savedGraphsKey, JSON.stringify(savedGraphs));
        return true;
      } catch (error) {
        status.textContent = "This browser could not save graphs locally.";
        return false;
      }
    }

    function cloneGraphDefinition(definition, displayName = definition.displayName) {
      return {
        vertexCount: definition.vertexCount,
        edgePairs: (definition.edgePairs || []).map((edge) => ({ ...edge })),
        displayName,
        positions: definition.positions ? definition.positions.map((position) => ({ ...position })) : null,
        layout: definition.layout || "standard",
        meta: JSON.parse(JSON.stringify(definition.meta || { type: "custom" }))
      };
    }

    function savedGraphLookupKey(value) {
      return normalizeDescription(value);
    }

    function validateSavedGraphName(value) {
      const name = value.trim().replace(/\s+/g, " ");
      const key = savedGraphLookupKey(name);
      const compactKey = key.replace(/[\s_]+/g, "");
      const reservedWords = new Set([
        "join",
        "cartesian",
        "cartesian product",
        "complement",
        "cycle",
        "path",
        "complete",
        "empty",
        "petersen",
        "petersen graph",
        "multipartite"
      ]);

      if (!name) {
        throw new Error("Type a name before saving the graph.");
      }

      if (!key) {
        throw new Error("Use a graph name like G, H, or myGraph.");
      }

      if (!/^[A-Za-z][A-Za-z0-9 -]{0,31}$/.test(name)) {
        throw new Error("Saved graph names should start with a letter and use only letters, numbers, spaces, or hyphens.");
      }

      if (
        reservedWords.has(key) ||
        /^(join of|cartesian product of|complement of|complement graph of)\b/.test(key) ||
        /^(?:[cpqwk]\d+|\d+k\d+|k\d+(?:,\d+)+)$/.test(compactKey)
      ) {
        throw new Error("Use a custom name like G or H instead of a built-in notation such as C3 or K5.");
      }

      return { name, key };
    }

    function isStoredGraphDefinition(definition) {
      return Boolean(
        definition &&
        Number.isInteger(definition.vertexCount) &&
        definition.vertexCount >= 0 &&
        definition.vertexCount <= maxGeneratedVertices &&
        Array.isArray(definition.edgePairs)
      );
    }

    function getSavedGraphDefinition(phrase) {
      const record = savedGraphs[savedGraphLookupKey(phrase)];

      if (!record || typeof record.name !== "string" || !isStoredGraphDefinition(record.definition)) {
        return null;
      }

      const definition = cloneGraphDefinition(record.definition, record.name);
      definition.meta = {
        type: "saved",
        name: record.name,
        displayName: record.name,
        base: cloneGraphDefinition(record.definition, record.name).meta
      };

      return definition;
    }

    function renderSavedGraphs() {
      const entries = Object.entries(savedGraphs)
        .filter(([, record]) => record && typeof record.name === "string" && isStoredGraphDefinition(record.definition))
        .sort(([, first], [, second]) => first.name.localeCompare(second.name));

      if (entries.length === 0) {
        savedGraphList.innerHTML = '<p class="saved-graph-empty">No saved graphs yet. Save the current graph, then try inputs like join of G and C5.</p>';
        return;
      }

      savedGraphList.innerHTML = entries.map(([key, record]) => (
        `<div class="saved-graph-item">
          <strong>${escapeHtml(record.name)}</strong>
          <button type="button" class="secondary" data-saved-action="use" data-saved-key="${escapeHtml(key)}">Use</button>
          <button type="button" class="secondary" data-saved-action="delete" data-saved-key="${escapeHtml(key)}">Delete</button>
        </div>`
      )).join("");
    }

    function cloneState() {
      return {
        nodes: nodes.map((node) => ({ ...node })),
        edges: edges.map((edge) => ({ ...edge })),
        nextNodeId,
        showLabels,
        nodeRadius: physics.nodeRadius,
        currentGraphName,
        currentGraphMeta: JSON.parse(JSON.stringify(currentGraphMeta)),
        nodeColor,
        edgeColor
      };
    }

    function trimStack(stack) {
      if (stack.length > 40) {
        stack.shift();
      }
    }

    function updateSizeOutput() {
      sizeValue.textContent = `${physics.nodeRadius} px`;
    }

    function hexToRgba(hex, alpha) {
      const cleanHex = hex.replace("#", "");
      const red = parseInt(cleanHex.slice(0, 2), 16);
      const green = parseInt(cleanHex.slice(2, 4), 16);
      const blue = parseInt(cleanHex.slice(4, 6), 16);
      return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    function saveUndoState() {
      undoStack.push(cloneState());
      trimStack(undoStack);
      redoStack.length = 0;
    }

    function restoreState(snapshot) {
      nodes.length = 0;
      edges.length = 0;

      for (const node of snapshot.nodes) {
        nodes.push({ ...node, fixed: Boolean(node.fixed) });
      }

      for (const edge of snapshot.edges) {
        edges.push({ ...edge });
      }

      nextNodeId = snapshot.nextNodeId;
      showLabels = snapshot.showLabels;
      physics.nodeRadius = snapshot.nodeRadius;
      currentGraphName = snapshot.currentGraphName || "Custom graph";
      currentGraphMeta = snapshot.currentGraphMeta || { type: "custom" };
      nodeColor = snapshot.nodeColor || "#1e6f5c";
      edgeColor = snapshot.edgeColor || "#8b6f47";
      labelToggle.checked = showLabels;
      saveLabelPreference(showLabels);
      sizeSlider.value = String(physics.nodeRadius);
      nodeColorInput.value = nodeColor;
      edgeColorInput.value = edgeColor;
      updateSizeOutput();
      pointer.draggingNode = null;
      pointer.dragGroup = [];
      pointer.startSnapshot = null;
      pointer.moved = false;
      pointer.wasFixed = false;
      resetMinorResultForGraphChange();
      updateView();
    }

    function undoLastStep() {
      if (undoStack.length === 0) {
        status.textContent = "There is no earlier step to undo.";
        updateView();
        return;
      }

      redoStack.push(cloneState());
      trimStack(redoStack);
      const previousState = undoStack.pop();
      restoreState(previousState);
      status.textContent = "Undid the previous step.";
      updateView();
    }

    function redoLastStep() {
      if (redoStack.length === 0) {
        status.textContent = "There is no later step to redo.";
        updateView();
        return;
      }

      undoStack.push(cloneState());
      trimStack(undoStack);
      const nextState = redoStack.pop();
      restoreState(nextState);
      status.textContent = "Redid the previous undo.";
      updateView();
    }

    function findNodeByLabel(label) {
      return nodes.find((node) => node.label === label);
    }

    function createNode(label) {
      const margin = 90;
      return {
        id: nextNodeId++,
        label,
        x: randomInRange(margin, graphCanvas.width - margin),
        y: randomInRange(margin, graphCanvas.height - margin),
        vx: randomInRange(-1, 1),
        vy: randomInRange(-1, 1),
        fixed: false
      };
    }

    function makeNodeLabel(index, total) {
      if (total <= 26) {
        return String.fromCharCode(65 + index);
      }

      return `V${index + 1}`;
    }

    function makeEdgeKey(from, to) {
      return [from, to].sort().join("--");
    }

    function addUniqueEdge(edgePairs, from, to, kind = "normal") {
      if (from === to) {
        return;
      }

      const key = `${Math.min(from, to)}--${Math.max(from, to)}`;
      if (!edgePairs.some((edge) => edge.key === key)) {
        edgePairs.push({ from, to, key, kind });
      }
    }

    function makePlainDefinitionFromCurrentGraph(displayName) {
      const labelToIndex = new Map(nodes.map((node, index) => [node.label, index]));
      const edgePairs = [];
      const positions = nodes.map((node) => ({ x: node.x, y: node.y }));

      for (const edge of edges) {
        const from = labelToIndex.get(edge.from);
        const to = labelToIndex.get(edge.to);

        if (from !== undefined && to !== undefined) {
          addUniqueEdge(edgePairs, from, to, edge.kind || "normal");
        }
      }

      return {
        vertexCount: nodes.length,
        edgePairs,
        displayName,
        labels: nodes.map((node) => node.label),
        positions,
        layout: "standard",
        meta: currentGraphMeta || { type: "custom" }
      };
    }

    function makeDefinitionFromCurrentGraph(displayName) {
      const definition = makePlainDefinitionFromCurrentGraph(displayName);

      return makeDefinition(
        definition.vertexCount,
        definition.edgePairs,
        displayName,
        definition.positions,
        "standard",
        { type: "saved-source", name: displayName }
      );
    }

    function saveCurrentGraphToMemory() {
      if (nodes.length === 0) {
        status.textContent = "There is no graph to save yet.";
        return;
      }

      let graphName;
      let graphKey;

      try {
        ({ name: graphName, key: graphKey } = validateSavedGraphName(saveGraphNameInput.value));
      } catch (error) {
        status.textContent = error.message;
        return;
      }

      let definition;

      try {
        definition = makeDefinitionFromCurrentGraph(graphName);
      } catch (error) {
        status.textContent = error.message;
        return;
      }

      savedGraphs[graphKey] = {
        name: graphName,
        definition: cloneGraphDefinition(definition, graphName),
        savedAt: Date.now()
      };

      if (!persistSavedGraphs()) {
        delete savedGraphs[graphKey];
        renderSavedGraphs();
        return;
      }

      renderSavedGraphs();
      saveGraphNameInput.value = "";
      status.textContent = `Saved current graph as ${graphName}. Try: join of ${graphName} and C5.`;
    }

    function useSavedGraph(graphKey) {
      const record = savedGraphs[graphKey];

      if (!record) {
        status.textContent = "That saved graph is no longer available.";
        renderSavedGraphs();
        return;
      }

      descriptionInput.value = record.name;
      descriptionInput.focus();
      status.textContent = `Ready to use saved graph ${record.name}.`;
    }

    function deleteSavedGraph(graphKey) {
      const record = savedGraphs[graphKey];

      if (!record) {
        status.textContent = "That saved graph is no longer available.";
        renderSavedGraphs();
        return;
      }

      delete savedGraphs[graphKey];
      if (!persistSavedGraphs()) {
        savedGraphs[graphKey] = record;
        return;
      }

      renderSavedGraphs();
      status.textContent = `Deleted saved graph ${record.name}.`;
    }

    function handleSavedGraphListClick(event) {
      const button = event.target.closest("button[data-saved-action]");

      if (!button) {
        return;
      }

      const graphKey = button.dataset.savedKey;
      const action = button.dataset.savedAction;

      if (action === "use") {
        useSavedGraph(graphKey);
      }

      if (action === "delete") {
        deleteSavedGraph(graphKey);
      }
    }

    function addNode(name) {
      const cleanName = normalizeName(name);

      if (!cleanName) {
        status.textContent = "Please type a vertex name first.";
        return;
      }

      if (findNodeByLabel(cleanName)) {
        status.textContent = "That vertex already exists.";
        return;
      }

      saveUndoState();
      nodes.push(createNode(cleanName));
      currentGraphName = "Custom graph";
      currentGraphMeta = { type: "custom" };
      resetMinorResultForGraphChange();
      status.textContent = `Added vertex "${cleanName}".`;
      updateView();
    }

    function addEdge(from, to) {
      const start = normalizeName(from);
      const end = normalizeName(to);

      if (!start || !end) {
        status.textContent = "Type both vertex names before adding an edge.";
        return;
      }

      if (start === end) {
        status.textContent = "Use two different vertices for an edge.";
        return;
      }

      const fromNode = findNodeByLabel(start);
      const toNode = findNodeByLabel(end);

      if (!fromNode || !toNode) {
        status.textContent = "Both vertices must exist before you connect them.";
        return;
      }

      const edgeKey = makeEdgeKey(start, end);
      const exists = edges.some((edge) => edge.key === edgeKey);

      if (exists) {
        status.textContent = "That edge already exists.";
        return;
      }

      saveUndoState();
      edges.push({ from: start, to: end, key: edgeKey });
      currentGraphName = "Custom graph";
      currentGraphMeta = { type: "custom" };
      resetMinorResultForGraphChange();
      status.textContent = `Connected "${start}" to "${end}".`;
      nudgeNodes(fromNode, toNode);
      updateView();
    }

    function deleteNode(name) {
      const cleanName = normalizeName(name);

      if (!cleanName) {
        status.textContent = "Type the vertex name you want to delete.";
        return;
      }

      const nodeIndex = nodes.findIndex((node) => node.label === cleanName);

      if (nodeIndex === -1) {
        status.textContent = `Vertex "${cleanName}" does not exist.`;
        return;
      }

      saveUndoState();
      nodes.splice(nodeIndex, 1);
      currentGraphName = "Custom graph";
      currentGraphMeta = { type: "custom" };
      resetMinorResultForGraphChange();

      for (let i = edges.length - 1; i >= 0; i -= 1) {
        const edge = edges[i];
        if (edge.from === cleanName || edge.to === cleanName) {
          edges.splice(i, 1);
        }
      }

      status.textContent = `Deleted vertex "${cleanName}" and its connected edges.`;
      updateView();
    }

    function deleteEdge(from, to) {
      const start = normalizeName(from);
      const end = normalizeName(to);

      if (!start || !end) {
        status.textContent = "Type both vertex names before deleting an edge.";
        return;
      }

      const edgeKey = makeEdgeKey(start, end);
      const edgeIndex = edges.findIndex((edge) => edge.key === edgeKey);

      if (edgeIndex === -1) {
        status.textContent = `Edge "${start}-${end}" does not exist.`;
        return;
      }

      saveUndoState();
      edges.splice(edgeIndex, 1);
      currentGraphName = "Custom graph";
      currentGraphMeta = { type: "custom" };
      resetMinorResultForGraphChange();
      status.textContent = `Deleted edge "${start}-${end}".`;
      updateView();
    }

    function setShowLabels(value) {
      if (showLabels === value) {
        return;
      }

      saveUndoState();
      showLabels = value;
      labelToggle.checked = showLabels;
      saveLabelPreference(showLabels);
      status.textContent = showLabels
        ? "Vertex labels are now visible."
        : "Vertex labels are now hidden.";
      updateView();
    }

    function isConnected() {
      if (nodes.length === 0) {
        return false;
      }

      const neighbors = new Map(nodes.map((node) => [node.label, []]));

      for (const edge of edges) {
        neighbors.get(edge.from).push(edge.to);
        neighbors.get(edge.to).push(edge.from);
      }

      const visited = new Set();
      const queue = [nodes[0].label];
      visited.add(nodes[0].label);

      while (queue.length > 0) {
        const current = queue.shift();

        for (const next of neighbors.get(current)) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }

      return visited.size === nodes.length;
    }

    function buildAdjacencyInfo() {
      const indexByLabel = new Map();
      const adjacencyList = nodes.map(() => []);
      const adjacencyMasks = nodes.map(() => 0);

      nodes.forEach((node, index) => {
        indexByLabel.set(node.label, index);
      });

      for (const edge of edges) {
        const fromIndex = indexByLabel.get(edge.from);
        const toIndex = indexByLabel.get(edge.to);

        if (fromIndex === undefined || toIndex === undefined) {
          continue;
        }

        adjacencyList[fromIndex].push(toIndex);
        adjacencyList[toIndex].push(fromIndex);
        adjacencyMasks[fromIndex] |= 1 << toIndex;
        adjacencyMasks[toIndex] |= 1 << fromIndex;
      }

      return { adjacencyList, adjacencyMasks };
    }

    function buildAdjacencyMatrix() {
      const indexByLabel = new Map(nodes.map((node, index) => [node.label, index]));
      const matrix = Array.from({ length: nodes.length }, () => Array(nodes.length).fill(0));

      for (const edge of edges) {
        const fromIndex = indexByLabel.get(edge.from);
        const toIndex = indexByLabel.get(edge.to);

        if (fromIndex === undefined || toIndex === undefined) {
          continue;
        }

        matrix[fromIndex][toIndex] = 1;
        matrix[toIndex][fromIndex] = 1;
      }

      return matrix;
    }

    function isCompleteGraph() {
      const vertexCount = nodes.length;
      return edges.length === (vertexCount * (vertexCount - 1)) / 2;
    }

    function getMinDegree(adjacencyList) {
      if (adjacencyList.length === 0) {
        return 0;
      }

      return Math.min(...adjacencyList.map((neighbors) => neighbors.length));
    }

    function runMaxFlow(capacity, source, sink) {
      const size = capacity.length;
      const residual = capacity.map((row) => row.slice());
      let flow = 0;

      while (true) {
        const parent = Array(size).fill(-1);
        const queue = [source];
        parent[source] = source;

        for (let head = 0; head < queue.length && parent[sink] === -1; head += 1) {
          const current = queue[head];

          for (let next = 0; next < size; next += 1) {
            if (parent[next] === -1 && residual[current][next] > 0) {
              parent[next] = current;
              queue.push(next);
            }
          }
        }

        if (parent[sink] === -1) {
          return flow;
        }

        let pushed = Infinity;
        for (let node = sink; node !== source; node = parent[node]) {
          pushed = Math.min(pushed, residual[parent[node]][node]);
        }

        for (let node = sink; node !== source; node = parent[node]) {
          residual[parent[node]][node] -= pushed;
          residual[node][parent[node]] += pushed;
        }

        flow += pushed;
      }
    }

    function getExactEdgeConnectivity(adjacencyList) {
      const vertexCount = nodes.length;

      if (vertexCount <= 1 || !isConnected()) {
        return 0;
      }

      let best = getMinDegree(adjacencyList);

      for (let target = 1; target < vertexCount; target += 1) {
        const capacity = Array.from({ length: vertexCount }, () => Array(vertexCount).fill(0));

        for (const edge of edges) {
          const from = nodes.findIndex((node) => node.label === edge.from);
          const to = nodes.findIndex((node) => node.label === edge.to);
          capacity[from][to] += 1;
          capacity[to][from] += 1;
        }

        best = Math.min(best, runMaxFlow(capacity, 0, target));
        if (best === 0) {
          break;
        }
      }

      return best;
    }

    function getExactVertexConnectivity(adjacencyList) {
      const vertexCount = nodes.length;

      if (vertexCount <= 1 || !isConnected()) {
        return 0;
      }

      if (isCompleteGraph()) {
        return vertexCount - 1;
      }

      const edgeSet = new Set();
      for (const edge of edges) {
        const from = nodes.findIndex((node) => node.label === edge.from);
        const to = nodes.findIndex((node) => node.label === edge.to);
        edgeSet.add(`${Math.min(from, to)}--${Math.max(from, to)}`);
      }

      let best = getMinDegree(adjacencyList);
      const splitCount = vertexCount * 2;
      const infiniteCapacity = vertexCount + 1;

      for (let source = 0; source < vertexCount; source += 1) {
        for (let sink = source + 1; sink < vertexCount; sink += 1) {
          if (edgeSet.has(`${source}--${sink}`)) {
            continue;
          }

          const capacity = Array.from({ length: splitCount }, () => Array(splitCount).fill(0));

          for (let vertex = 0; vertex < vertexCount; vertex += 1) {
            capacity[vertex * 2][vertex * 2 + 1] = vertex === source || vertex === sink
              ? infiniteCapacity
              : 1;
          }

          for (const edge of edges) {
            const from = nodes.findIndex((node) => node.label === edge.from);
            const to = nodes.findIndex((node) => node.label === edge.to);
            capacity[from * 2 + 1][to * 2] = infiniteCapacity;
            capacity[to * 2 + 1][from * 2] = infiniteCapacity;
          }

          best = Math.min(best, runMaxFlow(capacity, source * 2 + 1, sink * 2));
          if (best === 0) {
            return 0;
          }
        }
      }

      return best;
    }

    function getVertexConnectivityResult() {
      const vertexCount = nodes.length;

      if (vertexCount <= 1 || !isConnected()) {
        return { computed: true, text: "0" };
      }

      const { adjacencyList } = buildAdjacencyInfo();
      return { computed: true, text: String(getExactVertexConnectivity(adjacencyList)) };
    }

    function getHamiltonianResult() {
      const vertexCount = nodes.length;

      if (vertexCount < 3) {
        return { computed: true, text: "No" };
      }

      if (!isConnected()) {
        return { computed: true, text: "No" };
      }

      if (isCompleteGraph()) {
        return { computed: true, text: "Yes" };
      }

      if (currentGraphMeta.type === "path") {
        return { computed: true, text: "No" };
      }

      if (currentGraphMeta.type === "cycle" || currentGraphMeta.type === "wheel") {
        return { computed: true, text: "Yes" };
      }

      if (currentGraphMeta.type === "multipartite") {
        const total = currentGraphMeta.parts.reduce((sum, part) => sum + part, 0);
        const largest = Math.max(...currentGraphMeta.parts);
        return { computed: true, text: largest <= total - largest ? "Yes" : "No" };
      }

      if (currentGraphMeta.type === "cube") {
        return { computed: true, text: currentGraphMeta.dimension >= 2 ? "Yes" : "No" };
      }

      const { adjacencyList, adjacencyMasks } = buildAdjacencyInfo();
      if (adjacencyList.some((neighbors) => neighbors.length < 2)) {
        return { computed: true, text: "No" };
      }

      if (vertexCount > maxBitmaskPropertyVertices) {
        return getHamiltonianSearchResult(adjacencyList);
      }

      const totalMasks = 1 << vertexCount;
      const fullMask = totalMasks - 1;
      const dp = new Uint32Array(totalMasks);
      dp[1] = 1;

      for (let mask = 1; mask < totalMasks; mask += 2) {
        let endpoints = dp[mask];

        while (endpoints !== 0) {
          const endpointBit = endpoints & -endpoints;
          const endpoint = 31 - Math.clz32(endpointBit);
          let candidates = adjacencyMasks[endpoint] & ~mask;

          while (candidates !== 0) {
            const nextBit = candidates & -candidates;
            dp[mask | nextBit] |= nextBit;
            candidates -= nextBit;
          }

          endpoints -= endpointBit;
        }
      }

      const cycleEndpoints = dp[fullMask] & adjacencyMasks[0] & ~1;
      return { computed: true, text: cycleEndpoints !== 0 ? "Yes" : "No" };
    }

    function getHamiltonianSearchResult(adjacencyList) {
      if (/^Q_\d+$/.test(currentGraphName) && nodes.length >= 4) {
        return { computed: true, text: "Yes" };
      }

      const vertexCount = adjacencyList.length;
      const path = [0];
      const used = Array(vertexCount).fill(false);
      let steps = 0;
      used[0] = true;

      const orderedNeighbors = adjacencyList.map((neighbors) => (
        neighbors.slice().sort((a, b) => adjacencyList[a].length - adjacencyList[b].length)
      ));

      function search(current) {
        steps += 1;
        if (steps > hardSearchStepLimit) {
          return "limit";
        }

        if (path.length === vertexCount) {
          return adjacencyList[current].includes(0) ? "found" : "continue";
        }

        for (const next of orderedNeighbors[current]) {
          if (used[next]) {
            continue;
          }

          used[next] = true;
          path.push(next);
          const result = search(next);
          if (result === "found" || result === "limit") {
            return result;
          }
          path.pop();
          used[next] = false;
        }

        return "continue";
      }

      const result = search(0);

      if (result === "found") {
        return { computed: true, text: "Yes" };
      }

      if (result === "limit") {
        return { computed: false, text: "Unknown (bounded search)" };
      }

      return { computed: true, text: "No" };
    }

    function countBits(mask) {
      let count = 0;

      while (mask !== 0) {
        mask &= mask - 1;
        count += 1;
      }

      return count;
    }

    function getBipartition(adjacencyList) {
      const colors = Array(adjacencyList.length).fill(-1);

      for (let start = 0; start < adjacencyList.length; start += 1) {
        if (colors[start] !== -1) {
          continue;
        }

        colors[start] = 0;
        const queue = [start];

        while (queue.length > 0) {
          const current = queue.shift();

          for (const next of adjacencyList[current]) {
            if (colors[next] === -1) {
              colors[next] = 1 - colors[current];
              queue.push(next);
            } else if (colors[next] === colors[current]) {
              return null;
            }
          }
        }
      }

      return colors;
    }

    function getGreedyIndependenceLowerBound(adjacencyList) {
      const candidates = new Set(adjacencyList.map((_, index) => index));
      let count = 0;

      while (candidates.size > 0) {
        let best = null;

        for (const vertex of candidates) {
          if (best === null || adjacencyList[vertex].filter((neighbor) => candidates.has(neighbor)).length < adjacencyList[best].filter((neighbor) => candidates.has(neighbor)).length) {
            best = vertex;
          }
        }

        count += 1;
        candidates.delete(best);

        for (const neighbor of adjacencyList[best]) {
          candidates.delete(neighbor);
        }
      }

      return count;
    }

    function getGreedyChromaticUpperBound(adjacencyList) {
      const orders = [
        adjacencyList.map((_, index) => index).sort((a, b) => adjacencyList[b].length - adjacencyList[a].length),
        adjacencyList.map((_, index) => index).sort((a, b) => adjacencyList[a].length - adjacencyList[b].length),
        adjacencyList.map((_, index) => index)
      ];
      let best = adjacencyList.length === 0 ? 0 : adjacencyList.length;

      for (const order of orders) {
        const colors = Array(adjacencyList.length).fill(-1);
        let usedColors = 0;

        for (const vertex of order) {
          const forbidden = new Set(adjacencyList[vertex].map((neighbor) => colors[neighbor]).filter((color) => color !== -1));
          let color = 0;

          while (forbidden.has(color)) {
            color += 1;
          }

          colors[vertex] = color;
          usedColors = Math.max(usedColors, color + 1);
        }

        best = Math.min(best, usedColors);
      }

      return best;
    }

    function cloneAdjacencySets(adjacencyList) {
      return adjacencyList.map((neighbors) => new Set(neighbors));
    }

    function getDegeneracyLowerBound(adjacencyList) {
      const adjacencySets = cloneAdjacencySets(adjacencyList);
      const remaining = new Set(adjacencyList.map((_, index) => index));
      let lowerBound = 0;

      while (remaining.size > 0) {
        let bestVertex = null;
        let bestDegree = Infinity;

        for (const vertex of remaining) {
          let degree = 0;
          for (const neighbor of adjacencySets[vertex]) {
            if (remaining.has(neighbor)) {
              degree += 1;
            }
          }

          if (degree < bestDegree) {
            bestDegree = degree;
            bestVertex = vertex;
          }
        }

        lowerBound = Math.max(lowerBound, bestDegree);
        remaining.delete(bestVertex);
      }

      return lowerBound;
    }

    function getGreedyCliqueLowerBound(adjacencyList) {
      const adjacencySets = cloneAdjacencySets(adjacencyList);
      const order = adjacencyList
        .map((neighbors, vertex) => ({ vertex, degree: neighbors.length }))
        .sort((a, b) => b.degree - a.degree)
        .map((item) => item.vertex);
      let best = adjacencyList.length === 0 ? 0 : 1;

      for (const start of order) {
        const clique = [start];
        const candidates = order.filter((vertex) => vertex !== start && adjacencySets[start].has(vertex));

        for (const candidate of candidates) {
          if (clique.every((vertex) => adjacencySets[candidate].has(vertex))) {
            clique.push(candidate);
          }
        }

        best = Math.max(best, clique.length);
      }

      return best - 1;
    }

    function countMissingNeighborEdges(vertex, adjacencySets, remaining) {
      const neighbors = [...adjacencySets[vertex]].filter((neighbor) => remaining.has(neighbor));
      let missing = 0;

      for (let i = 0; i < neighbors.length; i += 1) {
        for (let j = i + 1; j < neighbors.length; j += 1) {
          if (!adjacencySets[neighbors[i]].has(neighbors[j])) {
            missing += 1;
          }
        }
      }

      return missing;
    }

    function getEliminationUpperBound(adjacencyList, strategy = "min-fill") {
      const adjacencySets = cloneAdjacencySets(adjacencyList);
      const remaining = new Set(adjacencyList.map((_, index) => index));
      let width = 0;

      while (remaining.size > 0) {
        let bestVertex = null;
        let bestScore = Infinity;
        let bestDegree = Infinity;

        for (const vertex of remaining) {
          const degree = [...adjacencySets[vertex]].filter((neighbor) => remaining.has(neighbor)).length;
          const fill = countMissingNeighborEdges(vertex, adjacencySets, remaining);
          const score = strategy === "min-degree" ? degree : fill;

          if (score < bestScore || score === bestScore && degree < bestDegree) {
            bestScore = score;
            bestDegree = degree;
            bestVertex = vertex;
          }
        }

        const neighbors = [...adjacencySets[bestVertex]].filter((neighbor) => remaining.has(neighbor));
        width = Math.max(width, neighbors.length);

        for (let i = 0; i < neighbors.length; i += 1) {
          for (let j = i + 1; j < neighbors.length; j += 1) {
            adjacencySets[neighbors[i]].add(neighbors[j]);
            adjacencySets[neighbors[j]].add(neighbors[i]);
          }
        }

        remaining.delete(bestVertex);
      }

      return width;
    }

    function adjacencyListToMasks(adjacencyList) {
      return adjacencyList.map((neighbors) => neighbors.reduce((mask, neighbor) => mask | (1 << neighbor), 0));
    }

    function getActiveVertices(activeMask, vertexCount) {
      const vertices = [];

      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        if (activeMask & (1 << vertex)) {
          vertices.push(vertex);
        }
      }

      return vertices;
    }

    function getMaskDegeneracyLowerBound(masks, activeMask, vertexCount) {
      let remaining = activeMask;
      let lowerBound = 0;

      while (remaining) {
        let bestVertex = -1;
        let bestDegree = Infinity;

        for (const vertex of getActiveVertices(remaining, vertexCount)) {
          const degree = countBits(masks[vertex] & remaining);

          if (degree < bestDegree) {
            bestDegree = degree;
            bestVertex = vertex;
          }
        }

        lowerBound = Math.max(lowerBound, bestDegree);
        remaining &= ~(1 << bestVertex);
      }

      return lowerBound;
    }

    function getFillCountFromMasks(masks, vertex, activeMask, vertexCount) {
      const neighbors = getActiveVertices(masks[vertex] & activeMask, vertexCount);
      let fill = 0;

      for (let i = 0; i < neighbors.length; i += 1) {
        for (let j = i + 1; j < neighbors.length; j += 1) {
          if (!(masks[neighbors[i]] & (1 << neighbors[j]))) {
            fill += 1;
          }
        }
      }

      return fill;
    }

    function getExactTreewidthByElimination(adjacencyList, upperBound) {
      const vertexCount = adjacencyList.length;

      if (vertexCount <= 1) {
        return { exact: true, value: 0 };
      }

      const stepLimit = 350000;
      const fullMask = (1 << vertexCount) - 1;
      const memo = new Map();
      let best = upperBound;
      let steps = 0;
      let aborted = false;

      function makeStateKey(masks, activeMask) {
        return `${activeMask}:${getActiveVertices(activeMask, vertexCount).map((vertex) => masks[vertex] & activeMask).join(".")}`;
      }

      function search(masks, activeMask, currentWidth) {
        steps += 1;
        if (steps > stepLimit) {
          aborted = true;
          return;
        }

        if (!activeMask) {
          best = Math.min(best, currentWidth);
          return;
        }

        const lowerBound = Math.max(currentWidth, getMaskDegeneracyLowerBound(masks, activeMask, vertexCount));
        if (lowerBound >= best) {
          return;
        }

        const key = makeStateKey(masks, activeMask);
        if (memo.has(key) && memo.get(key) <= currentWidth) {
          return;
        }
        memo.set(key, currentWidth);

        const candidates = getActiveVertices(activeMask, vertexCount)
          .map((vertex) => ({
            vertex,
            degree: countBits(masks[vertex] & activeMask),
            fill: getFillCountFromMasks(masks, vertex, activeMask, vertexCount)
          }))
          .sort((a, b) => a.fill - b.fill || a.degree - b.degree);

        for (const candidate of candidates) {
          const vertex = candidate.vertex;
          const nextWidth = Math.max(currentWidth, candidate.degree);

          if (nextWidth >= best) {
            continue;
          }

          const nextMasks = masks.slice();
          const neighbors = getActiveVertices(nextMasks[vertex] & activeMask, vertexCount);

          for (let i = 0; i < neighbors.length; i += 1) {
            for (let j = i + 1; j < neighbors.length; j += 1) {
              nextMasks[neighbors[i]] |= 1 << neighbors[j];
              nextMasks[neighbors[j]] |= 1 << neighbors[i];
            }
          }

          const nextActiveMask = activeMask & ~(1 << vertex);
          for (const other of getActiveVertices(nextActiveMask, vertexCount)) {
            nextMasks[other] &= ~(1 << vertex);
          }
          nextMasks[vertex] = 0;

          search(nextMasks, nextActiveMask, nextWidth);
          if (aborted) {
            return;
          }
        }
      }

      search(adjacencyListToMasks(adjacencyList), fullMask, 0);
      return { exact: !aborted, value: best };
    }

    function getTreewidthBoundsForAdjacency(adjacencyList, allowExact = true) {
      const vertexCount = adjacencyList.length;

      if (vertexCount === 0) {
        return { lower: 0, upper: 0, exact: true };
      }

      const edgeCount = adjacencyList.reduce((sum, neighbors) => sum + neighbors.length, 0) / 2;
      if (edgeCount === 0) {
        return { lower: 0, upper: 0, exact: true };
      }

      const lower = Math.max(
        getDegeneracyLowerBound(adjacencyList),
        getGreedyCliqueLowerBound(adjacencyList)
      );
      const upper = Math.min(
        getEliminationUpperBound(adjacencyList, "min-fill"),
        getEliminationUpperBound(adjacencyList, "min-degree")
      );

      if (lower === upper) {
        return { lower, upper, exact: true };
      }

      if (allowExact && vertexCount <= 11) {
        const exact = getExactTreewidthByElimination(adjacencyList, upper);
        if (exact.exact) {
          return { lower: exact.value, upper: exact.value, exact: true };
        }

        return { lower, upper: exact.value, exact: false };
      }

      return { lower, upper, exact: false };
    }

    function getTreewidthResult() {
      if (nodes.length === 0) {
        return { text: "0" };
      }

      if (isCompleteGraph()) {
        return { text: String(nodes.length - 1) };
      }

      if (edges.length === 0) {
        return { text: "0" };
      }

      if (currentGraphMeta.type === "path") {
        return { text: nodes.length <= 1 ? "0" : "1" };
      }

      if (currentGraphMeta.type === "cycle") {
        return { text: "2" };
      }

      if (currentGraphMeta.type === "wheel") {
        return { text: "3" };
      }

      if (currentGraphMeta.type === "multipartite") {
        const total = currentGraphMeta.parts.reduce((sum, part) => sum + part, 0);
        return { text: String(total - Math.max(...currentGraphMeta.parts)) };
      }

      const { adjacencyList } = buildAdjacencyInfo();
      const bounds = getTreewidthBoundsForAdjacency(adjacencyList);

      return bounds.exact
        ? { text: String(bounds.upper) }
        : { text: `≥ ${bounds.lower}, ≤ ${bounds.upper}` };
    }

    function definitionToAdjacencyList(definition) {
      const adjacencyList = Array.from({ length: definition.vertexCount }, () => []);

      for (const edge of definition.edgePairs || []) {
        if (edge.from === edge.to || edge.from < 0 || edge.to < 0 || edge.from >= definition.vertexCount || edge.to >= definition.vertexCount) {
          continue;
        }

        adjacencyList[edge.from].push(edge.to);
        adjacencyList[edge.to].push(edge.from);
      }

      return adjacencyList.map((neighbors) => [...new Set(neighbors)]);
    }

    function getTreewidthBoundsForDefinition(definition, allowExact = true) {
      if (definition.vertexCount === 0) {
        return { lower: 0, upper: 0, exact: true };
      }

      if ((definition.edgePairs || []).length === 0) {
        return { lower: 0, upper: 0, exact: true };
      }

      const meta = definition.meta || {};
      if (meta.type === "complete") {
        return { lower: definition.vertexCount - 1, upper: definition.vertexCount - 1, exact: true };
      }

      if (meta.type === "path") {
        const value = definition.vertexCount <= 1 ? 0 : 1;
        return { lower: value, upper: value, exact: true };
      }

      if (meta.type === "cycle") {
        return { lower: 2, upper: 2, exact: true };
      }

      if (meta.type === "wheel") {
        return { lower: 3, upper: 3, exact: true };
      }

      if (meta.type === "multipartite" && Array.isArray(meta.parts)) {
        const total = meta.parts.reduce((sum, part) => sum + part, 0);
        const value = total - Math.max(...meta.parts);
        return { lower: value, upper: value, exact: true };
      }

      return getTreewidthBoundsForAdjacency(definitionToAdjacencyList(definition), allowExact);
    }

    function adjacencyMasksFromList(adjacencyList) {
      return adjacencyList.map((neighbors) => neighbors.reduce((mask, neighbor) => mask | (1 << neighbor), 0));
    }

    function maskToVertexIndices(mask, vertexCount) {
      const indices = [];

      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        if (mask & (1 << vertex)) {
          indices.push(vertex);
        }
      }

      return indices;
    }

    function getDefinitionEdgePairs(definition) {
      return (definition.edgePairs || [])
        .filter((edge) => edge.from !== edge.to)
        .map((edge) => ({
          from: Math.min(edge.from, edge.to),
          to: Math.max(edge.from, edge.to)
        }))
        .filter((edge, index, list) => (
          list.findIndex((other) => other.from === edge.from && other.to === edge.to) === index
        ));
    }

    function getBranchSetEdgeWitnesses(hostDefinition, targetDefinition, branchSets) {
      const hostAdjacencyList = definitionToAdjacencyList(hostDefinition);

      return getDefinitionEdgePairs(targetDefinition).map((targetEdge) => {
        const fromSet = new Set(branchSets[targetEdge.from] || []);
        const toSet = new Set(branchSets[targetEdge.to] || []);
        let hostEdge = null;

        for (const hostFrom of fromSet) {
          for (const hostTo of hostAdjacencyList[hostFrom] || []) {
            if (toSet.has(hostTo)) {
              hostEdge = { from: hostFrom, to: hostTo };
              break;
            }
          }

          if (hostEdge) {
            break;
          }
        }

        return {
          targetFrom: targetEdge.from,
          targetTo: targetEdge.to,
          hostFrom: hostEdge ? hostEdge.from : null,
          hostTo: hostEdge ? hostEdge.to : null
        };
      });
    }

    function isMaskConnected(mask, adjacencyMasks, vertexCount) {
      if (!mask) {
        return false;
      }

      let start = -1;
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        if (mask & (1 << vertex)) {
          start = vertex;
          break;
        }
      }

      let visited = 0;
      let frontier = 1 << start;

      while (frontier) {
        const vertex = Math.trunc(Math.log2(frontier & -frontier));
        frontier &= ~(1 << vertex);

        if (visited & (1 << vertex)) {
          continue;
        }

        visited |= 1 << vertex;
        frontier |= adjacencyMasks[vertex] & mask & ~visited;
      }

      return (visited & mask) === mask;
    }

    function getConnectedSubsetData(adjacencyMasks, vertexCount) {
      const output = [];
      const fullMask = (1 << vertexCount) - 1;

      for (let mask = 1; mask <= fullMask; mask += 1) {
        if (!isMaskConnected(mask, adjacencyMasks, vertexCount)) {
          continue;
        }

        let neighborMask = 0;
        for (let vertex = 0; vertex < vertexCount; vertex += 1) {
          if (mask & (1 << vertex)) {
            neighborMask |= adjacencyMasks[vertex];
          }
        }

        output.push({
          mask,
          size: countBits(mask),
          neighborMask
        });
      }

      return output.sort((a, b) => a.size - b.size || a.mask - b.mask);
    }

    function runExactMinorSearch(hostDefinition, targetDefinition) {
      const hostVertexCount = hostDefinition.vertexCount;
      const targetAdjacencyList = definitionToAdjacencyList(targetDefinition);
      const targetDegrees = targetAdjacencyList.map((neighbors) => neighbors.length);
      const isolatedCount = targetDegrees.filter((degree) => degree === 0).length;
      const activeTargetVertices = targetDegrees
        .map((degree, vertex) => ({ degree, vertex }))
        .filter((item) => item.degree > 0)
        .sort((a, b) => b.degree - a.degree)
        .map((item) => item.vertex);

      if ((targetDefinition.edgePairs || []).length === 0) {
        if (targetDefinition.vertexCount > hostVertexCount) {
          return { completed: true, found: false };
        }

        return {
          completed: true,
          found: true,
          witness: {
            type: "branch-sets",
            branchSets: Array.from({ length: targetDefinition.vertexCount }, (_, index) => [index])
          }
        };
      }

      if (hostVertexCount > 16 || activeTargetVertices.length > 9) {
        return { completed: false, found: false };
      }

      const hostAdjacencyMasks = adjacencyMasksFromList(definitionToAdjacencyList(hostDefinition));
      const connectedSubsets = getConnectedSubsetData(hostAdjacencyMasks, hostVertexCount);
      const assignedMasks = Array(targetDefinition.vertexCount).fill(0);
      const stepLimit = 700000;
      let steps = 0;
      let aborted = false;
      let successfulUsedMask = 0;

      function canUseCandidate(targetVertex, candidate) {
        for (let index = 0; index < activeTargetVertices.length; index += 1) {
          const otherTarget = activeTargetVertices[index];
          const otherMask = assignedMasks[otherTarget];

          if (!otherMask) {
            continue;
          }

          if (targetAdjacencyList[targetVertex].includes(otherTarget) && !(candidate.neighborMask & otherMask)) {
            return false;
          }
        }

        return true;
      }

      function search(position, usedMask) {
        steps += 1;
        if (steps > stepLimit) {
          aborted = true;
          return false;
        }

        if (position === activeTargetVertices.length) {
          const enoughRoom = hostVertexCount - countBits(usedMask) >= isolatedCount;
          if (enoughRoom) {
            successfulUsedMask = usedMask;
          }

          return enoughRoom;
        }

        const targetVertex = activeTargetVertices[position];
        const remainingActive = activeTargetVertices.length - position - 1;
        const maxCandidateSize = hostVertexCount - countBits(usedMask) - remainingActive - isolatedCount;

        for (const candidate of connectedSubsets) {
          if (candidate.size > maxCandidateSize) {
            break;
          }

          if (candidate.mask & usedMask) {
            continue;
          }

          if (!canUseCandidate(targetVertex, candidate)) {
            continue;
          }

          assignedMasks[targetVertex] = candidate.mask;
          if (search(position + 1, usedMask | candidate.mask)) {
            return true;
          }
          assignedMasks[targetVertex] = 0;

          if (aborted) {
            return false;
          }
        }

        return false;
      }

      const found = search(0, 0);
      if (!found) {
        return { completed: !aborted, found: false };
      }

      const branchSets = assignedMasks.slice();
      let remainingMask = ((1 << hostVertexCount) - 1) & ~successfulUsedMask;

      for (let targetVertex = 0; targetVertex < targetDefinition.vertexCount; targetVertex += 1) {
        if (branchSets[targetVertex]) {
          continue;
        }

        const nextBit = remainingMask & -remainingMask;
        branchSets[targetVertex] = nextBit;
        remainingMask &= ~nextBit;
      }

      return {
        completed: !aborted,
        found: true,
        witness: {
          type: "branch-sets",
          branchSets: branchSets.map((mask) => maskToVertexIndices(mask, hostVertexCount))
        }
      };
    }

    function hasSubgraphEmbedding(hostDefinition, targetDefinition) {
      const hostAdjacencyList = definitionToAdjacencyList(hostDefinition);
      const targetAdjacencyList = definitionToAdjacencyList(targetDefinition);
      const hostAdjacencySets = hostAdjacencyList.map((neighbors) => new Set(neighbors));
      const order = targetAdjacencyList
        .map((neighbors, vertex) => ({ vertex, degree: neighbors.length }))
        .sort((a, b) => b.degree - a.degree)
        .map((item) => item.vertex);
      const mapping = Array(targetDefinition.vertexCount).fill(-1);
      const usedHostVertices = new Set();
      const stepLimit = 250000;
      let steps = 0;
      let aborted = false;

      function search(position) {
        steps += 1;
        if (steps > stepLimit) {
          aborted = true;
          return false;
        }

        if (position === order.length) {
          return true;
        }

        const targetVertex = order[position];
        const candidates = hostAdjacencyList
          .map((neighbors, hostVertex) => ({ hostVertex, degree: neighbors.length }))
          .filter((item) => !usedHostVertices.has(item.hostVertex) && item.degree >= targetAdjacencyList[targetVertex].length)
          .sort((a, b) => a.degree - b.degree);

        for (const candidate of candidates) {
          let allowed = true;

          for (const targetNeighbor of targetAdjacencyList[targetVertex]) {
            const mappedNeighbor = mapping[targetNeighbor];
            if (mappedNeighbor !== -1 && !hostAdjacencySets[candidate.hostVertex].has(mappedNeighbor)) {
              allowed = false;
              break;
            }
          }

          if (!allowed) {
            continue;
          }

          mapping[targetVertex] = candidate.hostVertex;
          usedHostVertices.add(candidate.hostVertex);

          if (search(position + 1)) {
            return true;
          }

          mapping[targetVertex] = -1;
          usedHostVertices.delete(candidate.hostVertex);

          if (aborted) {
            return false;
          }
        }

        return false;
      }

      const found = search(0);
      return {
        completed: !aborted,
        found,
        witness: found
          ? {
            type: "subgraph",
            mapping: mapping.slice(),
            branchSets: mapping.map((hostIndex) => [hostIndex])
          }
          : null
      };
    }

    function getMinorContainmentResult(hostDefinition, targetDefinition) {
      if (targetDefinition.vertexCount === 0) {
        return {
          text: "Yes",
          witness: {
            type: "trivial",
            description: "The empty graph is a minor of every graph."
          }
        };
      }

      if (hostDefinition.vertexCount === 0) {
        return { text: "No" };
      }

      if (targetDefinition.vertexCount > hostDefinition.vertexCount) {
        return { text: "No" };
      }

      if ((targetDefinition.edgePairs || []).length > (hostDefinition.edgePairs || []).length) {
        return { text: "No" };
      }

      const subgraphSearch = hasSubgraphEmbedding(hostDefinition, targetDefinition);
      if (subgraphSearch.found) {
        return { text: "Yes", witness: subgraphSearch.witness };
      }

      const hostTreewidth = getTreewidthBoundsForDefinition(hostDefinition, false);
      const targetTreewidth = getTreewidthBoundsForDefinition(targetDefinition, true);
      if (targetTreewidth.lower > hostTreewidth.upper) {
        return { text: "No" };
      }

      const exactSearch = runExactMinorSearch(hostDefinition, targetDefinition);
      if (exactSearch.completed) {
        return exactSearch.found
          ? { text: "Yes", witness: exactSearch.witness }
          : { text: "No" };
      }

      if (exactSearch.found) {
        return { text: "Yes", witness: exactSearch.witness };
      }

      return { text: "Search too large for exact minor test" };
    }

    function getDefinitionVertexLabel(definition, index) {
      if (definition.labels && definition.labels[index]) {
        return definition.labels[index];
      }

      return makeNodeLabel(index, definition.vertexCount);
    }

    function formatHostVertexSet(hostDefinition, indices) {
      return `{${indices.map((index) => getDefinitionVertexLabel(hostDefinition, index)).join(", ")}}`;
    }

    function formatMinorEdgeWitnesses(result, hostDefinition, targetDefinition) {
      const branchSets = result.witness.branchSets;
      const targetEdges = getDefinitionEdgePairs(targetDefinition);

      if (!branchSets || targetEdges.length === 0) {
        return "";
      }

      const edgeWitnesses = getBranchSetEdgeWitnesses(hostDefinition, targetDefinition, branchSets);
      const formattedWitnesses = edgeWitnesses.map((edge) => {
        const targetEdgeLabel = [
          getDefinitionVertexLabel(targetDefinition, edge.targetFrom),
          getDefinitionVertexLabel(targetDefinition, edge.targetTo)
        ].join("-");
        const hostEdgeLabel = edge.hostFrom === null
          ? "missing host edge"
          : [
            getDefinitionVertexLabel(hostDefinition, edge.hostFrom),
            getDefinitionVertexLabel(hostDefinition, edge.hostTo)
          ].join("-");

        return `${targetEdgeLabel} by ${hostEdgeLabel}`;
      });

      return ` Edge witnesses: ${formattedWitnesses.join("; ")}.`;
    }

    function formatMinorWitness(result, hostDefinition, targetDefinition) {
      if (result.text !== "Yes" || !result.witness) {
        return "";
      }

      if (result.witness.type === "trivial") {
        return ` Witness: ${result.witness.description}`;
      }

      if (result.witness.type === "subgraph") {
        const mappings = result.witness.mapping.map((hostIndex, targetIndex) => (
          `${getDefinitionVertexLabel(targetDefinition, targetIndex)} → ${getDefinitionVertexLabel(hostDefinition, hostIndex)}`
        ));

        return ` Witness as subgraph: ${mappings.join("; ")}.${formatMinorEdgeWitnesses(result, hostDefinition, targetDefinition)}`;
      }

      if (result.witness.type === "branch-sets") {
        const branchSets = result.witness.branchSets.map((hostIndices, targetIndex) => (
          `${getDefinitionVertexLabel(targetDefinition, targetIndex)} → ${formatHostVertexSet(hostDefinition, hostIndices)}`
        ));

        return ` Witness branch sets: ${branchSets.join("; ")}.${formatMinorEdgeWitnesses(result, hostDefinition, targetDefinition)}`;
      }

      return "";
    }

    function runFindMinor() {
      minorQuery = minorQuery.trim();

      if (!minorQuery) {
        minorResultText = "Enter a target graph first, such as K5, C3, Petersen graph, or a saved graph name.";
        updateView();
        return;
      }

      let targetDefinition;

      try {
        targetDefinition = parseGraphDescription(minorQuery);
      } catch (error) {
        minorResultText = error.message;
        updateView();
        return;
      }

      const hostDefinition = makePlainDefinitionFromCurrentGraph(currentGraphName || "graph in view");
      const result = getMinorContainmentResult(hostDefinition, targetDefinition);
      minorResultText = `${targetDefinition.displayName} minor? ${result.text}.${formatMinorWitness(result, hostDefinition, targetDefinition)}`;
      updateView();
    }

    function getIndependenceNumberResult() {
      const vertexCount = nodes.length;

      if (vertexCount === 0) {
        return { text: "0" };
      }

      if (isCompleteGraph()) {
        return { text: "1" };
      }

      if (edges.length === 0) {
        return { text: String(vertexCount) };
      }

      if (currentGraphMeta.type === "path") {
        return { text: String(Math.ceil(vertexCount / 2)) };
      }

      if (currentGraphMeta.type === "cycle") {
        return { text: String(Math.floor(vertexCount / 2)) };
      }

      if (currentGraphMeta.type === "wheel") {
        return { text: String(Math.floor(currentGraphMeta.rimSize / 2)) };
      }

      if (currentGraphMeta.type === "multipartite") {
        return { text: String(Math.max(...currentGraphMeta.parts)) };
      }

      if (currentGraphMeta.type === "cube" && currentGraphMeta.dimension >= 1) {
        return { text: String(2 ** (currentGraphMeta.dimension - 1)) };
      }

      if (vertexCount > maxBitmaskPropertyVertices) {
        const { adjacencyList } = buildAdjacencyInfo();
        return { text: `≥ ${getGreedyIndependenceLowerBound(adjacencyList)}` };
      }

      const { adjacencyMasks } = buildAdjacencyInfo();
      const fullMask = (1 << vertexCount) - 1;
      let best = 0;

      for (let mask = 0; mask <= fullMask; mask += 1) {
        const size = countBits(mask);

        if (size <= best) {
          continue;
        }

        let independent = true;
        for (let vertex = 0; vertex < vertexCount; vertex += 1) {
          if ((mask & (1 << vertex)) && (adjacencyMasks[vertex] & mask)) {
            independent = false;
            break;
          }
        }

        if (independent) {
          best = size;
        }
      }

      return { text: String(best) };
    }

    function canColorVertices(colorCount, adjacencyList) {
      const order = adjacencyList
        .map((neighbors, vertex) => ({ vertex, degree: neighbors.length }))
        .sort((a, b) => b.degree - a.degree)
        .map((item) => item.vertex);
      const colors = Array(adjacencyList.length).fill(-1);
      let steps = 0;

      function assign(position) {
        steps += 1;
        if (steps > hardSearchStepLimit) {
          return null;
        }

        if (position === order.length) {
          return true;
        }

        const vertex = order[position];
        for (let color = 0; color < colorCount; color += 1) {
          let allowed = true;

          for (const neighbor of adjacencyList[vertex]) {
            if (colors[neighbor] === color) {
              allowed = false;
              break;
            }
          }

          if (allowed) {
            colors[vertex] = color;
            const result = assign(position + 1);
            if (result === true || result === null) {
              return result;
            }
            colors[vertex] = -1;
          }
        }

        return false;
      }

      return assign(0);
    }

    function getChromaticNumberResult() {
      const vertexCount = nodes.length;

      if (vertexCount === 0) {
        return { text: "0" };
      }

      if (isCompleteGraph()) {
        return { text: String(vertexCount) };
      }

      if (edges.length === 0) {
        return { text: "1" };
      }

      if (currentGraphMeta.type === "path") {
        return { text: vertexCount <= 1 ? "1" : "2" };
      }

      if (currentGraphMeta.type === "cycle") {
        return { text: vertexCount % 2 === 0 ? "2" : "3" };
      }

      if (currentGraphMeta.type === "wheel") {
        return { text: currentGraphMeta.rimSize % 2 === 0 ? "3" : "4" };
      }

      if (currentGraphMeta.type === "multipartite") {
        return { text: String(currentGraphMeta.parts.length) };
      }

      if (currentGraphMeta.type === "cube") {
        return { text: "2" };
      }

      if (vertexCount > maxExactPropertyVertices) {
        const { adjacencyList } = buildAdjacencyInfo();
        const bipartition = getBipartition(adjacencyList);

        if (bipartition) {
          return { text: edges.length === 0 ? "1" : "2" };
        }

        return { text: `≤ ${getGreedyChromaticUpperBound(adjacencyList)}` };
      }

      const { adjacencyList } = buildAdjacencyInfo();
      for (let colorCount = 1; colorCount <= vertexCount; colorCount += 1) {
        const coloringResult = canColorVertices(colorCount, adjacencyList);
        if (coloringResult === true) {
          return { text: String(colorCount) };
        }

        if (coloringResult === null) {
          return { text: `≤ ${getGreedyChromaticUpperBound(adjacencyList)}` };
        }
      }

      return { text: String(vertexCount) };
    }

    function getEdgeConnectivityResult() {
      if (nodes.length <= 1 || !isConnected()) {
        return { text: "0" };
      }

      const { adjacencyList } = buildAdjacencyInfo();
      return { text: String(getExactEdgeConnectivity(adjacencyList)) };
    }

    function canColorEdges(colorCount) {
      const indexedEdges = edges.map((edge, index) => ({ ...edge, index }));
      const conflicts = indexedEdges.map(() => []);

      for (let i = 0; i < indexedEdges.length; i += 1) {
        for (let j = i + 1; j < indexedEdges.length; j += 1) {
          const a = indexedEdges[i];
          const b = indexedEdges[j];

          if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) {
            conflicts[i].push(j);
            conflicts[j].push(i);
          }
        }
      }

      const order = conflicts
        .map((neighbors, edgeIndex) => ({ edgeIndex, degree: neighbors.length }))
        .sort((a, b) => b.degree - a.degree)
        .map((item) => item.edgeIndex);
      const colors = Array(edges.length).fill(-1);

      function assign(position) {
        if (position === order.length) {
          return true;
        }

        const edgeIndex = order[position];
        for (let color = 0; color < colorCount; color += 1) {
          let allowed = true;

          for (const conflict of conflicts[edgeIndex]) {
            if (colors[conflict] === color) {
              allowed = false;
              break;
            }
          }

          if (allowed) {
            colors[edgeIndex] = color;
            if (assign(position + 1)) {
              return true;
            }
            colors[edgeIndex] = -1;
          }
        }

        return false;
      }

      return assign(0);
    }

    function getChromaticIndexResult() {
      if (edges.length === 0) {
        return { text: "0" };
      }

      const { adjacencyList } = buildAdjacencyInfo();
      const maxDegree = Math.max(...adjacencyList.map((neighbors) => neighbors.length));

      if (isCompleteGraph()) {
        return { text: String(nodes.length % 2 === 0 ? nodes.length - 1 : nodes.length) };
      }

      if (edges.length > maxExactEdgeColoringEdges) {
        return { text: getBipartition(adjacencyList) ? String(maxDegree) : `≤ ${maxDegree + 1}` };
      }

      for (let colorCount = maxDegree; colorCount <= maxDegree + 1; colorCount += 1) {
        if (canColorEdges(colorCount)) {
          return { text: String(colorCount) };
        }
      }

      return { text: String(maxDegree + 1) };
    }

    function getGirthResult() {
      const { adjacencyList } = buildAdjacencyInfo();
      let best = Infinity;

      for (let start = 0; start < nodes.length; start += 1) {
        const distance = Array(nodes.length).fill(Infinity);
        const parent = Array(nodes.length).fill(-1);
        const queue = [start];
        distance[start] = 0;

        while (queue.length > 0) {
          const current = queue.shift();

          for (const next of adjacencyList[current]) {
            if (distance[next] === Infinity) {
              distance[next] = distance[current] + 1;
              parent[next] = current;
              queue.push(next);
            } else if (parent[current] !== next && parent[next] !== current) {
              best = Math.min(best, distance[current] + distance[next] + 1);
            }
          }
        }
      }

      return { text: best === Infinity ? "Infinity" : String(best) };
    }

    function bfsDistances(start, adjacencyList) {
      const distance = Array(adjacencyList.length).fill(Infinity);
      const queue = [start];
      distance[start] = 0;

      while (queue.length > 0) {
        const current = queue.shift();

        for (const next of adjacencyList[current]) {
          if (distance[next] === Infinity) {
            distance[next] = distance[current] + 1;
            queue.push(next);
          }
        }
      }

      return distance;
    }

    function getDistanceParameters() {
      if (nodes.length === 0) {
        return { diameter: "N/A", radius: "N/A" };
      }

      if (!isConnected()) {
        return { diameter: "Infinity", radius: "Infinity" };
      }

      const { adjacencyList } = buildAdjacencyInfo();
      const eccentricities = adjacencyList.map((_, vertex) => Math.max(...bfsDistances(vertex, adjacencyList)));

      return {
        diameter: String(Math.max(...eccentricities)),
        radius: String(Math.min(...eccentricities))
      };
    }

    function formatNumber(value) {
      if (value === Infinity) {
        return "Infinity";
      }

      if (Number.isInteger(value)) {
        return String(value);
      }

      return String(Math.round(value * 1000) / 1000);
    }

    function isPerfectSquareInteger(value) {
      const root = Math.round(Math.sqrt(value));
      return root * root === value;
    }

    function reduceRadical(radicand) {
      let coefficient = 1;
      let remaining = radicand;

      for (let factor = 2; factor * factor <= remaining; factor += 1) {
        const square = factor * factor;

        while (remaining % square === 0) {
          coefficient *= factor;
          remaining /= square;
        }
      }

      return { coefficient, radicand: remaining };
    }

    function formatRadicalTerm(coefficient, radicand) {
      if (radicand === 1) {
        return String(coefficient);
      }

      return coefficient === 1 ? `√${radicand}` : `${coefficient}√${radicand}`;
    }

    function formatQuadraticSurd(constant, sign, radicand, denominator) {
      const radical = reduceRadical(radicand);
      let constantPart = constant;
      let radicalCoefficient = sign * radical.coefficient;
      let denominatorPart = denominator;
      const commonDivisor = gcd(gcd(Math.abs(constantPart), Math.abs(radicalCoefficient)), denominatorPart);

      if (commonDivisor > 1) {
        constantPart /= commonDivisor;
        radicalCoefficient /= commonDivisor;
        denominatorPart /= commonDivisor;
      }

      if (radical.radicand === 1) {
        return formatEigenvalue((constantPart + radicalCoefficient) / denominatorPart);
      }

      if (constantPart === 0) {
        const signPrefix = radicalCoefficient < 0 ? "-" : "";
        const radicalText = formatRadicalTerm(Math.abs(radicalCoefficient), radical.radicand);
        return denominatorPart === 1
          ? `${signPrefix}${radicalText}`
          : `${signPrefix}${radicalText}/${denominatorPart}`;
      }

      const radicalText = formatRadicalTerm(Math.abs(radicalCoefficient), radical.radicand);
      const operator = radicalCoefficient < 0 ? "-" : "+";
      const numerator = `${constantPart} ${operator} ${radicalText}`;

      return denominatorPart === 1 ? numerator : `(${numerator})/${denominatorPart}`;
    }

    function findQuadraticSurd(value) {
      const tolerance = 2e-7;
      let bestCandidate = null;

      for (let denominator = 1; denominator <= 12; denominator += 1) {
        for (let radicand = 2; radicand <= 100; radicand += 1) {
          if (isPerfectSquareInteger(radicand)) {
            continue;
          }

          const root = Math.sqrt(radicand);

          for (const sign of [-1, 1]) {
            const constant = Math.round(denominator * value - sign * root);
            if (Math.abs(constant) > 24) {
              continue;
            }

            const approximation = (constant + sign * root) / denominator;
            const error = Math.abs(value - approximation);

            if (error > tolerance) {
              continue;
            }

            const label = formatQuadraticSurd(constant, sign, radicand, denominator);
            const score = error * 10000000 + denominator * 0.2 + label.length * 0.03 + radicand * 0.001;

            if (!bestCandidate || score < bestCandidate.score) {
              bestCandidate = { label, score };
            }
          }
        }
      }

      return bestCandidate ? bestCandidate.label : null;
    }

    function formatEigenvalue(value) {
      if (Math.abs(value) < 1e-9) {
        return "0";
      }

      const roundedInteger = Math.round(value);
      if (Math.abs(value - roundedInteger) < 1e-8) {
        return String(roundedInteger);
      }

      const quadraticSurd = findQuadraticSurd(value);
      if (quadraticSurd) {
        return quadraticSurd;
      }

      const rounded = Math.round(value * 1000000) / 1000000;
      return rounded.toFixed(6).replace(/\.?0+$/, "");
    }

    function jacobiEigenvaluesSymmetric(matrix) {
      const size = matrix.length;
      const working = matrix.map((row) => row.slice());
      const tolerance = 1e-10;
      const maxSweeps = Math.max(24, Math.min(80, size * 8));

      for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
        let changed = false;
        let largestOffDiagonal = 0;

        for (let p = 0; p < size - 1; p += 1) {
          for (let q = p + 1; q < size; q += 1) {
            const offDiagonal = working[p][q];
            const magnitude = Math.abs(offDiagonal);
            largestOffDiagonal = Math.max(largestOffDiagonal, magnitude);

            if (magnitude <= tolerance) {
              continue;
            }

            const app = working[p][p];
            const aqq = working[q][q];
            const angle = 0.5 * Math.atan2(2 * offDiagonal, aqq - app);
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);

            for (let index = 0; index < size; index += 1) {
              if (index === p || index === q) {
                continue;
              }

              const aip = working[index][p];
              const aiq = working[index][q];
              working[index][p] = cosine * aip - sine * aiq;
              working[p][index] = working[index][p];
              working[index][q] = sine * aip + cosine * aiq;
              working[q][index] = working[index][q];
            }

            working[p][p] = cosine * cosine * app - 2 * sine * cosine * offDiagonal + sine * sine * aqq;
            working[q][q] = sine * sine * app + 2 * sine * cosine * offDiagonal + cosine * cosine * aqq;
            working[p][q] = 0;
            working[q][p] = 0;
            changed = true;
          }
        }

        if (!changed || largestOffDiagonal <= tolerance) {
          break;
        }
      }

      return working
        .map((row, index) => row[index])
        .sort((a, b) => b - a);
    }

    function formatSpectrum(eigenvalues) {
      if (eigenvalues.length === 0) {
        return "∅";
      }

      const groups = [];
      const tolerance = 1e-6;

      for (const value of eigenvalues) {
        const lastGroup = groups[groups.length - 1];

        if (lastGroup && Math.abs(value - lastGroup.value) <= tolerance) {
          lastGroup.count += 1;
        } else {
          groups.push({ value, count: 1 });
        }
      }

      return groups.map((group) => {
        const label = formatEigenvalue(group.value);
        return group.count === 1 ? label : `${label}^{${group.count}}`;
      }).join(", ");
    }

    function computeSpectrum() {
      if (nodes.length === 0) {
        spectrumResultText = "∅. The empty graph has no adjacency eigenvalues.";
        updateView();
        return;
      }

      const matrix = buildAdjacencyMatrix();
      const eigenvalues = jacobiEigenvaluesSymmetric(matrix);
      spectrumResultText = `${formatSpectrum(eigenvalues)}.`;
      status.textContent = `Computed adjacency spectrum for ${currentGraphName}.`;
      updateView();
    }

    function gcd(first, second) {
      let a = Math.abs(first);
      let b = Math.abs(second);

      while (b !== 0) {
        const next = a % b;
        a = b;
        b = next;
      }

      return a || 1;
    }

    function formatFraction(numerator, denominator) {
      if (numerator === Infinity) {
        return "Infinity";
      }

      if (denominator === 0) {
        return "Infinity";
      }

      const divisor = gcd(numerator, denominator);
      const reducedNumerator = numerator / divisor;
      const reducedDenominator = denominator / divisor;

      return reducedDenominator === 1
        ? String(reducedNumerator)
        : `${reducedNumerator}/${reducedDenominator}`;
    }

    function countComponentsAfterRemovedMask(mask, adjacencyList) {
      const visited = Array(adjacencyList.length).fill(false);
      let components = 0;

      for (let start = 0; start < adjacencyList.length; start += 1) {
        if ((mask & (1 << start)) || visited[start]) {
          continue;
        }

        components += 1;
        const queue = [start];
        visited[start] = true;

        while (queue.length > 0) {
          const current = queue.shift();

          for (const next of adjacencyList[current]) {
            if (!(mask & (1 << next)) && !visited[next]) {
              visited[next] = true;
              queue.push(next);
            }
          }
        }
      }

      return components;
    }

    function getToughnessResult() {
      if (nodes.length === 0 || !isConnected()) {
        return { text: "0" };
      }

      if (isCompleteGraph()) {
        return { text: "Infinity" };
      }

      if (currentGraphMeta.type === "multipartite") {
        const total = currentGraphMeta.parts.reduce((sum, part) => sum + part, 0);
        const largest = Math.max(...currentGraphMeta.parts);
        return { text: formatFraction(total - largest, largest) };
      }

      if (currentGraphMeta.type === "cube") {
        return { text: currentGraphMeta.dimension === 1 ? "1" : "1" };
      }

      if (nodes.length > maxBitmaskPropertyVertices) {
        const { adjacencyList } = buildAdjacencyInfo();
        const vertexConnectivity = Number(getVertexConnectivityResult().text.replace(/[^0-9.]/g, ""));
        return { text: `≤ ${formatFraction(Math.max(0, vertexConnectivity || 0), 2)}` };
      }

      const { adjacencyList } = buildAdjacencyInfo();
      const fullMask = (1 << nodes.length) - 1;
      let bestNumerator = Infinity;
      let bestDenominator = 1;

      for (let mask = 1; mask < fullMask; mask += 1) {
        const removedCount = countBits(mask);
        const components = countComponentsAfterRemovedMask(mask, adjacencyList);

        if (components > 1) {
          if (removedCount * bestDenominator < bestNumerator * components) {
            bestNumerator = removedCount;
            bestDenominator = components;
          }
        }
      }

      return { text: formatFraction(bestNumerator, bestDenominator) };
    }

    function completeGraphGenus(n) {
      if (n <= 2) {
        return 0;
      }

      return Math.ceil(((n - 3) * (n - 4)) / 12);
    }

    function completeBipartiteGenus(left, right) {
      return Math.ceil(Math.max(0, (left - 2) * (right - 2)) / 4);
    }

    function cubeGenus(dimension) {
      if (dimension <= 3) {
        return 0;
      }

      return 1 + (2 ** (dimension - 3)) * (dimension - 4);
    }

    function genusLowerBound() {
      if (nodes.length <= 2) {
        return 0;
      }

      return Math.max(0, Math.ceil((edges.length - 3 * nodes.length + 6) / 6));
    }

    function genusLowerBoundForDefinition(definition) {
      if (definition.vertexCount <= 2) {
        return 0;
      }

      return Math.max(0, Math.ceil(((definition.edgePairs || []).length - 3 * definition.vertexCount + 6) / 6));
    }

    function isBipartiteAdjacency(adjacencyList) {
      return Boolean(getBipartition(adjacencyList));
    }

    function makeDefinitionFromAdjacency(adjacencyList, displayName, meta = { type: "custom" }) {
      const edgePairs = [];

      for (let from = 0; from < adjacencyList.length; from += 1) {
        for (const to of adjacencyList[from]) {
          if (from < to) {
            addUniqueEdge(edgePairs, from, to);
          }
        }
      }

      return {
        vertexCount: adjacencyList.length,
        edgePairs,
        displayName,
        positions: null,
        layout: "standard",
        meta
      };
    }

    function reduceDefinitionForPlanarity(definition) {
      let adjacencySets = definitionToAdjacencyList(definition).map((neighbors) => new Set(neighbors));
      let changed = true;

      while (changed) {
        changed = false;

        for (let vertex = 0; vertex < adjacencySets.length; vertex += 1) {
          const degree = adjacencySets[vertex].size;

          if (degree > 2) {
            continue;
          }

          const neighbors = [...adjacencySets[vertex]];

          if (degree === 2) {
            const [first, second] = neighbors;
            adjacencySets[first].add(second);
            adjacencySets[second].add(first);
          }

          for (const neighbor of neighbors) {
            adjacencySets[neighbor].delete(vertex);
          }

          adjacencySets.splice(vertex, 1);

          for (const neighborSet of adjacencySets) {
            const rebuilt = new Set();
            for (const neighbor of neighborSet) {
              if (neighbor < vertex) {
                rebuilt.add(neighbor);
              } else if (neighbor > vertex) {
                rebuilt.add(neighbor - 1);
              }
            }

            neighborSet.clear();
            for (const neighbor of rebuilt) {
              neighborSet.add(neighbor);
            }
          }

          changed = true;
          break;
        }
      }

      return makeDefinitionFromAdjacency(
        adjacencySets.map((neighbors) => [...neighbors]),
        `planarity core of ${definition.displayName || "graph"}`,
        { type: "custom" }
      );
    }

    function getForbiddenMinorPlanarity(definition) {
      const reducedDefinition = reduceDefinitionForPlanarity(definition);
      const reducedEdgeCount = (reducedDefinition.edgePairs || []).length;

      if (reducedDefinition.vertexCount <= 4) {
        return "Yes";
      }

      if (reducedEdgeCount > 3 * reducedDefinition.vertexCount - 6) {
        return "No";
      }

      if (isBipartiteAdjacency(definitionToAdjacencyList(reducedDefinition)) && reducedEdgeCount > 2 * reducedDefinition.vertexCount - 4) {
        return "No";
      }

      const k5Result = getMinorContainmentResult(reducedDefinition, makeCompleteDefinition(5)).text;
      if (k5Result === "Yes") {
        return "No";
      }

      const k33Result = getMinorContainmentResult(reducedDefinition, makeCompleteBipartiteDefinition(3, 3)).text;
      if (k33Result === "Yes") {
        return "No";
      }

      if (k5Result === "No" && k33Result === "No") {
        return "Yes";
      }

      return "Unknown";
    }

    function getKnownPlanarityResult(definition = makePlainDefinitionFromCurrentGraph(currentGraphName || "graph in view")) {
      const meta = definition.meta || {};
      const edgeCount = (definition.edgePairs || []).length;

      if (definition.vertexCount <= 4) {
        return "Yes";
      }

      if (["path", "cycle", "wheel", "empty"].includes(meta.type)) {
        return "Yes";
      }

      if (meta.type === "complete") {
        return meta.n <= 4 ? "Yes" : "No";
      }

      if (meta.type === "multipartite" && Array.isArray(meta.parts) && meta.parts.length === 2) {
        return Math.min(meta.parts[0], meta.parts[1]) <= 2 ? "Yes" : "No";
      }

      if (meta.type === "cube") {
        return meta.dimension <= 3 ? "Yes" : "No";
      }

      if (meta.type === "petersen") {
        return "No";
      }

      if (meta.type === "cartesian") {
        const left = meta.left || {};
        const right = meta.right || {};

        if ((left.type === "path" && right.type === "path") || (left.type === "cycle" && right.type === "path") || (left.type === "path" && right.type === "cycle")) {
          return "Yes";
        }

        if (left.type === "cycle" && right.type === "cycle") {
          return "No";
        }
      }

      if (definition.vertexCount >= 3 && edgeCount > 3 * definition.vertexCount - 6) {
        return "No";
      }

      if (definition.vertexCount >= 3 && isBipartiteAdjacency(definitionToAdjacencyList(definition)) && edgeCount > 2 * definition.vertexCount - 4) {
        return "No";
      }

      const reducedDefinition = reduceDefinitionForPlanarity(definition);
      if (reducedDefinition.vertexCount <= 16) {
        return getForbiddenMinorPlanarity(reducedDefinition);
      }

      return "Unknown";
    }

    function getGenusResult() {
      const currentDefinition = makePlainDefinitionFromCurrentGraph(currentGraphName || "graph in view");

      if (nodes.length === 0) {
        return { text: "0" };
      }

      if (currentGraphMeta.type === "complete") {
        return { text: String(completeGraphGenus(currentGraphMeta.n)) };
      }

      if (currentGraphMeta.type === "multipartite" && currentGraphMeta.parts.length === 2) {
        return { text: String(completeBipartiteGenus(currentGraphMeta.parts[0], currentGraphMeta.parts[1])) };
      }

      if (currentGraphMeta.type === "multipartite") {
        const planarity = getKnownPlanarityResult(currentDefinition);
        if (planarity === "Yes") {
          return { text: "0" };
        }

        const lower = genusLowerBoundForDefinition(currentDefinition);
        return { text: lower > 0 ? `≥ ${lower}` : "≥ 1" };
      }

      if (["path", "cycle", "wheel", "empty"].includes(currentGraphMeta.type)) {
        return { text: "0" };
      }

      if (currentGraphMeta.type === "cube") {
        return { text: String(cubeGenus(currentGraphMeta.dimension)) };
      }

      if (currentGraphMeta.type === "petersen") {
        return { text: "1" };
      }

      if (currentGraphMeta.type === "cartesian") {
        const left = currentGraphMeta.left || {};
        const right = currentGraphMeta.right || {};

        if ((left.type === "path" && right.type === "path") || (left.type === "cycle" && right.type === "path") || (left.type === "path" && right.type === "cycle")) {
          return { text: "0" };
        }

        if (left.type === "cycle" && right.type === "cycle") {
          return { text: "1" };
        }
      }

      const lower = genusLowerBound();
      if (lower > 0) {
        return { text: `≥ ${lower}` };
      }

      const planarity = getKnownPlanarityResult(currentDefinition);
      if (planarity === "Yes") {
        return { text: "0" };
      }

      if (planarity === "No") {
        return { text: "≥ 1" };
      }

      return { text: "Unknown" };
    }

    function getPlanarityResult() {
      return { text: getKnownPlanarityResult() };
    }

    function getTraceableResult() {
      if (nodes.length === 0) {
        return { text: "No" };
      }

      if (nodes.length === 1 || isCompleteGraph()) {
        return { text: "Yes" };
      }

      if (!isConnected()) {
        return { text: "No" };
      }

      if (["path", "cycle", "wheel", "petersen", "cube"].includes(currentGraphMeta.type)) {
        return { text: "Yes" };
      }

      if (currentGraphMeta.type === "multipartite") {
        const total = currentGraphMeta.parts.reduce((sum, part) => sum + part, 0);
        const largest = Math.max(...currentGraphMeta.parts);
        return { text: largest <= total - largest + 1 ? "Yes" : "No" };
      }

      return getHamiltonianPathSearchResult();
    }

    function getHamiltonianPathSearchResult() {
      const { adjacencyList } = buildAdjacencyInfo();
      const vertexCount = nodes.length;

      if (vertexCount <= maxExactPropertyVertices) {
        let steps = 0;

        for (let start = 0; start < vertexCount; start += 1) {
          const used = Array(vertexCount).fill(false);
          used[start] = true;

          function search(current, depth) {
            steps += 1;
            if (steps > hardSearchStepLimit) {
              return "limit";
            }

            if (depth === vertexCount) {
              return "found";
            }

            for (const next of adjacencyList[current]) {
              if (!used[next]) {
                used[next] = true;
                const result = search(next, depth + 1);
                if (result === "found" || result === "limit") {
                  return result;
                }
                used[next] = false;
              }
            }

            return "continue";
          }

          const result = search(start, 1);
          if (result === "found") {
            return { text: "Yes" };
          }

          if (result === "limit") {
            return { text: "Unknown (bounded search)" };
          }
        }

        return { text: "No" };
      }

      return { text: getHamiltonianResult().text === "Yes" ? "Yes" : "Unknown (bounded search)" };
    }

    function nudgeNodes(nodeA, nodeB) {
      const boost = 1.8;
      nodeA.vx -= boost;
      nodeA.vy += boost * 0.3;
      nodeB.vx += boost;
      nodeB.vy -= boost * 0.3;
    }

    function clampNode(node) {
      const radius = physics.nodeRadius;
      node.x = Math.max(radius, Math.min(graphCanvas.width - radius, node.x));
      node.y = Math.max(radius, Math.min(graphCanvas.height - radius, node.y));
    }

    function runForces() {
      const centerX = graphCanvas.width / 2;
      const centerY = graphCanvas.height / 2;

      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];

        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distanceSquared = dx * dx + dy * dy;

          if (distanceSquared < 1) {
            dx = randomInRange(-0.5, 0.5);
            dy = randomInRange(-0.5, 0.5);
            distanceSquared = dx * dx + dy * dy;
          }

          const distance = Math.sqrt(distanceSquared);
          const force = physics.repulsion / distanceSquared;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;

          if (!a.fixed) {
            a.vx -= fx;
            a.vy -= fy;
          }

          if (!b.fixed) {
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      for (const edge of edges) {
        const fromNode = findNodeByLabel(edge.from);
        const toNode = findNodeByLabel(edge.to);
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const stretch = distance - physics.springLength;
        const force = stretch * physics.springStrength;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        if (!fromNode.fixed) {
          fromNode.vx += fx;
          fromNode.vy += fy;
        }

        if (!toNode.fixed) {
          toNode.vx -= fx;
          toNode.vy -= fy;
        }
      }

      for (const node of nodes) {
        if (!node.fixed) {
          node.vx += (centerX - node.x) * physics.centerPull;
          node.vy += (centerY - node.y) * physics.centerPull;
        }

        node.vx *= physics.damping;
        node.vy *= physics.damping;

        node.vx = Math.max(-physics.maxSpeed, Math.min(physics.maxSpeed, node.vx));
        node.vy = Math.max(-physics.maxSpeed, Math.min(physics.maxSpeed, node.vy));

        if (!node.fixed) {
          node.x += node.vx;
          node.y += node.vy;
        }

        clampNode(node);
      }
    }

    function drawEmptyState() {
      ctx.fillStyle = "#6b7280";
      ctx.font = "24px Georgia";
      ctx.textAlign = "center";
      ctx.fillText("Your graph will appear here.", graphCanvas.width / 2, graphCanvas.height / 2);
    }

    function drawEdge(edge) {
      const fromNode = findNodeByLabel(edge.from);
      const toNode = findNodeByLabel(edge.to);
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const unitX = dx / distance;
      const unitY = dy / distance;
      const startX = fromNode.x + unitX * physics.nodeRadius;
      const startY = fromNode.y + unitY * physics.nodeRadius;
      const endX = toNode.x - unitX * physics.nodeRadius;
      const endY = toNode.y - unitY * physics.nodeRadius;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = edge.kind === "operation" || edge.kind === "complement"
        ? hexToRgba(edgeColor, 0.42)
        : edgeColor;
      ctx.lineWidth = edge.kind === "operation" || edge.kind === "complement" ? 1.5 : 3;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    function drawNode(node) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, physics.nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor;
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.max(10, Math.round(physics.nodeRadius * 0.9))}px Georgia`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (showLabels) {
        ctx.fillText(node.label, node.x, node.y + 1);
      }
    }

    function renderGraph() {
      ctx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);

      if (nodes.length === 0) {
        drawEmptyState();
        return;
      }

      for (const edge of edges) {
        drawEdge(edge);
      }

      for (const node of nodes) {
        drawNode(node);
      }
    }

    function getPropertyRows() {
      const connected = nodes.length > 0 && isConnected();
      const vertexConnectivity = getVertexConnectivityResult();
      const edgeConnectivity = getEdgeConnectivityResult();
      const hamiltonian = getHamiltonianResult();
      const independenceNumber = getIndependenceNumberResult();
      const chromaticNumber = getChromaticNumberResult();
      const chromaticIndex = getChromaticIndexResult();
      const girth = getGirthResult();
      const distances = getDistanceParameters();
      const toughness = getToughnessResult();
      const planar = getPlanarityResult();
      const genus = getGenusResult();
      const traceable = getTraceableResult();
      const treewidth = getTreewidthResult();
      return [
        ["connected", "Connected?", nodes.length === 0 ? "No graph yet" : connected ? "Yes" : "No", "BFS from one vertex; Yes iff every vertex is reached."],
        ["vertexConnectivity", "Vertex connectivity &kappa;(G)", vertexConnectivity.text, "Exact max-flow with vertex splitting; returns the smallest vertex cut."],
        ["edgeConnectivity", "Edge connectivity &lambda;(G)", edgeConnectivity.text, "Exact unit-capacity max-flow from one vertex to all others."],
        ["toughness", "Toughness", toughness.text, "Minimizes |S| / components(G-S) for <=20 vertices; otherwise shows a bound."],
        ["hamiltonian", "Hamiltonian?", hamiltonian.text, "Hamiltonian cycle: exact DP for <=20 vertices, then bounded DFS/special cases."],
        ["traceable", "Traceable?", traceable.text, "Hamiltonian path: special cases, then bounded DFS up to 30 vertices."],
        ["planar", "Planar?", planar.text, "Known families, edge-count tests, reductions, then K5/K3,3 minor search for small cores."],
        ["genus", "Genus", genus.text, "Exact formulas for known families; otherwise Euler lower bound plus planarity result."],
        ["treewidth", "Treewidth tw(G)", treewidth.text, "Known exact cases; otherwise elimination lower/upper bounds and exact search up to 11 vertices."],
        ["independenceNumber", "Independence number &alpha;(G)", independenceNumber.text, "Known exact cases; otherwise exhaustive subset search for <=20 vertices."],
        ["chromaticNumber", "Chromatic number &chi;(G)", chromaticNumber.text, "Known exact cases; otherwise backtracking color search, or a greedy upper bound."],
        ["chromaticIndex", "Chromatic index &chi;&prime;(G)", chromaticIndex.text, "Tests edge colorings with Delta and Delta+1; large non-bipartite graphs show a bound."],
        ["girth", "Girth", girth.text, "BFS from every vertex; shortest detected cycle, or Infinity if acyclic."],
        ["diameter", "Diameter", distances.diameter, "BFS distances from every vertex; maximum eccentricity."],
        ["radius", "Radius", distances.radius, "BFS distances from every vertex; minimum eccentricity."]
      ];
    }

    function renderProperty() {
      const properties = getPropertyRows();

      propertyBox.innerHTML = `<div class="property-grid">${properties.map(([, name, value, hint]) => (
        `<div class="property-card"><span class="property-name">${name}<span class="parameter-help" tabindex="0" role="button" title="${escapeHtml(hint)}" aria-label="${escapeHtml(hint)}" data-tooltip="${escapeHtml(hint)}">?</span></span><strong>${value}</strong></div>`
      )).join("")}</div>
      <div class="property-actions">
        <div class="minor-finder">
          <label for="minorInput">Find minor</label>
          <div class="minor-controls">
            <input id="minorInput" type="text" value="${escapeHtml(minorQuery)}" placeholder="Examples: K5, C3, Petersen graph, G">
            <button id="findMinorBtn" type="button">Find</button>
          </div>
          <p id="minorResult" class="minor-result">${escapeHtml(minorResultText)}</p>
        </div>
        <div class="minor-finder">
          <label>Spectrum</label>
          <div class="spectrum-controls">
            <button id="computeSpectrumBtn" type="button">Compute Spectrum</button>
          </div>
          <p id="spectrumResult" class="minor-result">${escapeHtml(spectrumResultText)}</p>
        </div>
      </div>`;
    }

    function renderList() {
      const nodeText = nodes.length ? nodes.map((node) => node.label).join(", ") : "(none)";
      const neighborMap = new Map(nodes.map((node) => [node.label, []]));

      for (const edge of edges) {
        if (neighborMap.has(edge.from)) {
          neighborMap.get(edge.from).push(edge.to);
        }

        if (neighborMap.has(edge.to)) {
          neighborMap.get(edge.to).push(edge.from);
        }
      }

      const neighborText = nodes.length
        ? nodes.map((node) => {
          const neighbors = neighborMap.get(node.label) || [];
          return `${node.label}: ${neighbors.length ? neighbors.join(", ") : "(none)"}`;
        }).join("\n")
        : "(none)";

      listBox.textContent = `Graph: ${currentGraphName}\nVertices: ${nodeText}\nNeighbors:\n${neighborText}\nVertex labels shown: ${showLabels ? "yes" : "no"}\nVertex size: ${physics.nodeRadius}px`;
      undoBtn.disabled = undoStack.length === 0;
      redoBtn.disabled = redoStack.length === 0;
    }

    function updateView() {
      renderGraph();
      renderProperty();
      renderList();
    }

    function clearGraphData() {
      nodes.length = 0;
      edges.length = 0;
      nextNodeId = 1;
      currentGraphName = "Empty graph";
      currentGraphMeta = { type: "empty", parts: [] };
      pointer.draggingNode = null;
      pointer.dragGroup = [];
      pointer.startSnapshot = null;
      pointer.moved = false;
      pointer.wasFixed = false;
      resetMinorResultForGraphChange();
    }

    function setNodeRadius(value) {
      const nextRadius = Number(value);

      if (!Number.isFinite(nextRadius) || nextRadius === physics.nodeRadius) {
        updateSizeOutput();
        return;
      }

      saveUndoState();
      physics.nodeRadius = nextRadius;
      sizeSlider.value = String(nextRadius);
      updateSizeOutput();

      for (const node of nodes) {
        clampNode(node);
      }

      status.textContent = `Vertex size set to ${nextRadius}px.`;
      updateView();
    }

    function setGraphColor(kind, value) {
      const nextColor = value || (kind === "node" ? nodeColor : edgeColor);

      if (kind === "node" && nextColor !== nodeColor) {
        saveUndoState();
        nodeColor = nextColor;
        nodeColorInput.value = nodeColor;
        status.textContent = "Vertex color updated.";
        updateView();
      }

      if (kind === "edge" && nextColor !== edgeColor) {
        saveUndoState();
        edgeColor = nextColor;
        edgeColorInput.value = edgeColor;
        status.textContent = "Edge color updated.";
        updateView();
      }
    }

    const graphDictionaryEntries = [
      {
        pattern: "C3, C_3, cycle on 3 vertices",
        example: "C3",
        description: "Cycle graph on n vertices."
      },
      {
        pattern: "P4, P_4, path graph on four vertices",
        example: "P4",
        description: "Path graph on n vertices."
      },
      {
        pattern: "K5, K_5, complete graph on five vertices",
        example: "K5",
        description: "Complete graph on n vertices."
      },
      {
        pattern: "K34, K_{3,4}, complete bipartite graph on 3 and 4 vertices",
        example: "K_{3,4}",
        description: "Complete bipartite graph with part sizes m and n."
      },
      {
        pattern: "K_{3,3,4,5}, multipartite graph on 3,3,4,5",
        example: "K_{3,3,4,5}",
        description: "Complete multipartite graph with the listed part sizes."
      },
      {
        pattern: "3K5, 3K_5, 3K{5}",
        example: "3K5",
        description: "Disjoint union of multiple copies of a complete graph."
      },
      {
        pattern: "Q3, Q_3",
        example: "Q3",
        description: "n-dimensional cube graph."
      },
      {
        pattern: "W5, W_5",
        example: "W5",
        description: "Wheel graph with a 5-cycle rim plus one hub vertex."
      },
      {
        pattern: "Petersen graph",
        example: "Petersen graph",
        description: "The standard Petersen graph."
      },
      {
        pattern: "join of C3 and P4",
        example: "join of C3 and P4",
        description: "Join operation: keep both graphs and add all cross edges."
      },
      {
        pattern: "Cartesian product of C4 and P3; Cartesian product of C3, K4 and K2",
        example: "Cartesian product of C3, K4 and K2",
        description: "Associative Cartesian product; accepts two or more graph descriptions."
      },
      {
        pattern: "complement of C5, complement graph of Petersen graph",
        example: "complement of C5",
        description: "Complement graph on the same vertex set."
      },
      {
        pattern: "Saved graph names: G, H, myGraph",
        example: "join of G and C5",
        description: "Save the current graph, then reuse its name in joins, products, and complements."
      }
    ];

    function renderDescriptionDictionary() {
      const query = dictionarySearch.value.trim().toLowerCase();
      const visibleEntries = graphDictionaryEntries.filter((entry) => {
        const haystack = `${entry.pattern} ${entry.description}`.toLowerCase();
        return !query || haystack.includes(query);
      });

      dictionaryList.innerHTML = visibleEntries.map((entry) => (
        `<article class="dictionary-entry">
          <code>${entry.pattern}</code>
          <p>${entry.description}</p>
          <button type="button" class="secondary" data-example="${entry.example}">Use example</button>
        </article>`
      )).join("");

      if (visibleEntries.length === 0) {
        dictionaryList.innerHTML = '<article class="dictionary-entry"><p>No matching graph description found yet.</p></article>';
      }
    }

    function normalizeDescription(text) {
      const cleaned = text
        .toLowerCase()
        .replace(/[{}.;:!?]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (/^(a|an|the)$/.test(cleaned)) {
        return cleaned;
      }

      return cleaned
        .replace(/\b(a|an|the)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function parseSmallNumber(text) {
      const numberWords = {
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
        eleven: 11,
        twelve: 12,
        thirteen: 13,
        fourteen: 14,
        fifteen: 15,
        sixteen: 16,
        seventeen: 17,
        eighteen: 18,
        nineteen: 19,
        twenty: 20
      };

      const cleanText = text.trim();
      const numericValue = Number(cleanText);

      if (Number.isInteger(numericValue) && numericValue >= 1 && numericValue <= maxGeneratedVertices) {
        return numericValue;
      }

      return numberWords[cleanText] || null;
    }

    function parseVertexCount(text, defaultValue) {
      if (!text) {
        return defaultValue;
      }

      const count = parseSmallNumber(text.replace(/\bvertices?\b/g, "").trim());
      if (!count) {
        throw new Error("I could not understand that vertex count.");
      }

      return count;
    }

    function ensureGeneratedSize(size) {
      if (size > maxGeneratedVertices) {
        throw new Error(`Please generate graphs with ${maxGeneratedVertices} vertices or fewer.`);
      }
    }

    function circlePositions(count, radius = 190, phase = -Math.PI / 2) {
      const centerX = graphCanvas.width / 2;
      const centerY = graphCanvas.height / 2;

      if (count === 1) {
        return [{ x: centerX, y: centerY }];
      }

      return Array.from({ length: count }, (_, index) => {
        const angle = phase + (Math.PI * 2 * index) / count;
        return {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle)
        };
      });
    }

    function linePositions(count) {
      const left = 90;
      const right = graphCanvas.width - 90;
      const y = graphCanvas.height / 2;

      if (count === 1) {
        return [{ x: graphCanvas.width / 2, y }];
      }

      return Array.from({ length: count }, (_, index) => ({
        x: left + ((right - left) * index) / (count - 1),
        y
      }));
    }

    function bipartitePositions(leftCount, rightCount) {
      const totalRows = Math.max(leftCount, rightCount);
      const top = 80;
      const bottom = graphCanvas.height - 80;

      function yFor(index, count) {
        if (count === 1) {
          return graphCanvas.height / 2;
        }

        return top + ((bottom - top) * index) / (count - 1);
      }

      const positions = [];
      for (let index = 0; index < leftCount; index += 1) {
        positions.push({ x: 185, y: yFor(index, totalRows === 1 ? 1 : leftCount) });
      }

      for (let index = 0; index < rightCount; index += 1) {
        positions.push({ x: graphCanvas.width - 185, y: yFor(index, totalRows === 1 ? 1 : rightCount) });
      }

      return positions;
    }

    function gridPositions(columns, rows, options = {}) {
      const left = 80;
      const right = graphCanvas.width - 80;
      const top = 70;
      const bottom = graphCanvas.height - 70;
      const positions = [];
      const staggerX = options.staggerX || 0;
      const staggerY = options.staggerY || 0;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          positions.push({
            x: (columns === 1 ? graphCanvas.width / 2 : left + ((right - left) * column) / (columns - 1)) + (row % 2) * staggerX,
            y: (rows === 1 ? graphCanvas.height / 2 : top + ((bottom - top) * row) / (rows - 1)) + (column % 2) * staggerY
          });
        }
      }

      return positions;
    }

    function petersenPositions() {
      const outer = circlePositions(5, 190, -Math.PI / 2);
      const inner = circlePositions(5, 82, -Math.PI / 2);
      return [...outer, ...inner];
    }

    function cubePositions(dimension) {
      function q3Template(centerX, centerY, scale = 1) {
        const frontHalf = 72 * scale;
        const backHalf = 72 * scale;
        const offsetX = 42 * scale;
        const offsetY = -34 * scale;
        const front = [
          { x: centerX - frontHalf, y: centerY - frontHalf },
          { x: centerX + frontHalf, y: centerY - frontHalf },
          { x: centerX + frontHalf, y: centerY + frontHalf },
          { x: centerX - frontHalf, y: centerY + frontHalf }
        ];
        const back = [
          { x: centerX - backHalf + offsetX, y: centerY - backHalf + offsetY },
          { x: centerX + backHalf + offsetX, y: centerY - backHalf + offsetY },
          { x: centerX + backHalf + offsetX, y: centerY + backHalf + offsetY },
          { x: centerX - backHalf + offsetX, y: centerY + backHalf + offsetY }
        ];

        return [
          front[0],
          front[1],
          front[3],
          front[2],
          back[0],
          back[1],
          back[3],
          back[2]
        ];
      }

      if (dimension === 3) {
        return q3Template(graphCanvas.width / 2, graphCanvas.height / 2, 1.3);
      }

      if (dimension === 4) {
        const leftCube = q3Template(235, 320, 0.96);
        const rightCube = q3Template(465, 190, 0.96);
        return [...leftCube, ...rightCube];
      }

      if (dimension === 5) {
        const centers = [
          { x: 210, y: 165 },
          { x: 490, y: 125 },
          { x: 230, y: 390 },
          { x: 510, y: 350 }
        ];

        return centers.flatMap((center, layer) => (
          q3Template(center.x + (layer % 2) * 8, center.y, 0.58)
        ));
      }

      const vertexCount = 2 ** dimension;
      const columns = Math.ceil(Math.sqrt(vertexCount));
      return gridPositions(columns, Math.ceil(vertexCount / columns));
    }

    function wheelPositions(rimSize) {
      return [
        ...circlePositions(rimSize),
        { x: graphCanvas.width / 2, y: graphCanvas.height / 2 }
      ];
    }

    function getPositionBounds(positions) {
      return positions.reduce((bounds, position) => ({
        minX: Math.min(bounds.minX, position.x),
        maxX: Math.max(bounds.maxX, position.x),
        minY: Math.min(bounds.minY, position.y),
        maxY: Math.max(bounds.maxY, position.y)
      }), {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
      });
    }

    function transformPositions(positions, targetBounds) {
      if (!positions || positions.length === 0) {
        return [];
      }

      const source = getPositionBounds(positions);
      const sourceWidth = Math.max(1, source.maxX - source.minX);
      const sourceHeight = Math.max(1, source.maxY - source.minY);
      const targetWidth = Math.max(1, targetBounds.maxX - targetBounds.minX);
      const targetHeight = Math.max(1, targetBounds.maxY - targetBounds.minY);
      const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
      const sourceCenterX = (source.minX + source.maxX) / 2;
      const sourceCenterY = (source.minY + source.maxY) / 2;
      const targetCenterX = (targetBounds.minX + targetBounds.maxX) / 2;
      const targetCenterY = (targetBounds.minY + targetBounds.maxY) / 2;

      return positions.map((position) => ({
        x: targetCenterX + (position.x - sourceCenterX) * scale,
        y: targetCenterY + (position.y - sourceCenterY) * scale
      }));
    }

    function transformPositionsAnisotropic(positions, targetBounds) {
      if (!positions || positions.length === 0) {
        return [];
      }

      const source = getPositionBounds(positions);
      const sourceWidth = Math.max(1, source.maxX - source.minX);
      const sourceHeight = Math.max(1, source.maxY - source.minY);
      const targetWidth = Math.max(1, targetBounds.maxX - targetBounds.minX);
      const targetHeight = Math.max(1, targetBounds.maxY - targetBounds.minY);
      const sourceCenterX = (source.minX + source.maxX) / 2;
      const sourceCenterY = (source.minY + source.maxY) / 2;
      const targetCenterX = (targetBounds.minX + targetBounds.maxX) / 2;
      const targetCenterY = (targetBounds.minY + targetBounds.maxY) / 2;

      return positions.map((position) => ({
        x: targetCenterX + ((position.x - sourceCenterX) / sourceWidth) * targetWidth,
        y: targetCenterY + ((position.y - sourceCenterY) / sourceHeight) * targetHeight
      }));
    }

    function fallbackPositions(definition) {
      return definition.positions || circlePositions(definition.vertexCount, Math.min(190, 45 + definition.vertexCount * 18));
    }

    function joinPositions(leftDefinition, rightDefinition) {
      const leftPositions = transformPositions(fallbackPositions(leftDefinition), {
        minX: 55,
        maxX: 285,
        minY: 95,
        maxY: graphCanvas.height - 95
      });
      const rightPositions = transformPositions(fallbackPositions(rightDefinition), {
        minX: graphCanvas.width - 285,
        maxX: graphCanvas.width - 55,
        minY: 95,
        maxY: graphCanvas.height - 95
      });

      return [...leftPositions, ...rightPositions];
    }

    function productPositions(leftDefinition, rightDefinition) {
      const leftSize = leftDefinition.vertexCount;
      const rightSize = rightDefinition.vertexCount;
      const leftIsCycle = /^C_\d+$/.test(leftDefinition.displayName);
      const rightIsCycle = /^C_\d+$/.test(rightDefinition.displayName);
      const bothSmallCycles = leftIsCycle && rightIsCycle && leftSize <= 5 && rightSize <= 5;

      if (bothSmallCycles) {
        return gridPositions(leftSize, rightSize, { staggerX: 34, staggerY: 18 });
      }

      if (rightSize <= 6 && leftSize <= 14) {
        return layeredProductPositions(leftDefinition, rightDefinition);
      }

      return gridPositions(leftSize, rightSize, { staggerX: 22, staggerY: 14 });
    }

    function productLayerCenters(rightDefinition) {
      const rightSize = rightDefinition.vertexCount;
      const centerX = graphCanvas.width / 2;
      const centerY = graphCanvas.height / 2;

      if (rightSize === 1) {
        return [{ x: centerX, y: centerY }];
      }

      if (rightSize === 2) {
        return [
          { x: centerX - 18, y: 170 },
          { x: centerX + 18, y: graphCanvas.height - 170 }
        ];
      }

      if (rightDefinition.meta && rightDefinition.meta.type === "path") {
        const top = 110;
        const bottom = graphCanvas.height - 110;

        return Array.from({ length: rightSize }, (_, index) => ({
          x: centerX + (index % 2 === 0 ? -20 : 20),
          y: top + ((bottom - top) * index) / (rightSize - 1)
        }));
      }

      const macroRadius = rightSize <= 4 ? 145 : 170;
      return circlePositions(rightSize, macroRadius).map((position, index) => ({
        x: centerX + (position.x - centerX) * 1.12 + (index % 2 === 0 ? -8 : 8),
        y: centerY + (position.y - centerY) * 0.82 + (index % 3 === 0 ? 8 : -6)
      }));
    }

    function layeredProductPositions(leftDefinition, rightDefinition) {
      const leftSize = leftDefinition.vertexCount;
      const rightSize = rightDefinition.vertexCount;
      const centers = productLayerCenters(rightDefinition);
      const basePositions = fallbackPositions(leftDefinition);
      const positions = [];
      const twoLayerProduct = rightSize === 2;
      const localWidth = Math.min(300, Math.max(150, graphCanvas.width / Math.max(2.3, Math.sqrt(rightSize) + 1.1)));
      const localHeight = twoLayerProduct
        ? Math.min(112, Math.max(64, localWidth * 0.38))
        : Math.min(150, Math.max(70, localWidth * 0.5));

      for (let layer = 0; layer < rightSize; layer += 1) {
        const center = centers[layer];
        const horizontalNudge = (layer % 2 === 0 ? -1 : 1) * Math.min(22, 6 + leftSize * 2);
        const verticalNudge = rightSize > 2 ? ((layer % 3) - 1) * 5 : 0;
        const layerPositions = transformPositionsAnisotropic(basePositions, {
          minX: center.x - localWidth / 2 + horizontalNudge,
          maxX: center.x + localWidth / 2 + horizontalNudge,
          minY: center.y - localHeight / 2 + verticalNudge,
          maxY: center.y + localHeight / 2 + verticalNudge
        });

        positions.push(...layerPositions);
      }

      return positions;
    }

    function makeDefinition(vertexCount, edgePairs, displayName, positions = null, layout = "standard", meta = { type: "custom" }) {
      ensureGeneratedSize(vertexCount);
      const definitionMeta = { ...meta, displayName };

      return {
        vertexCount,
        edgePairs,
        displayName,
        positions,
        layout,
        meta: definitionMeta
      };
    }

    function copyClusterPositions(baseDefinition, copies) {
      const columns = Math.ceil(Math.sqrt(copies));
      const rows = Math.ceil(copies / columns);
      const cellWidth = graphCanvas.width / columns;
      const cellHeight = graphCanvas.height / rows;
      const basePositions = baseDefinition.positions || circlePositions(baseDefinition.vertexCount);
      const baseCenterX = graphCanvas.width / 2;
      const baseCenterY = graphCanvas.height / 2;
      const targetRadius = Math.max(28, Math.min(cellWidth, cellHeight) * 0.28);
      const sourceRadius = Math.max(
        1,
        ...basePositions.map((position) => Math.hypot(position.x - baseCenterX, position.y - baseCenterY))
      );
      const scale = Math.min(1, targetRadius / sourceRadius);
      const positions = [];

      for (let copy = 0; copy < copies; copy += 1) {
        const column = copy % columns;
        const row = Math.floor(copy / columns);
        const centerX = cellWidth * (column + 0.5);
        const centerY = cellHeight * (row + 0.5);

        for (const position of basePositions) {
          positions.push({
            x: centerX + (position.x - baseCenterX) * scale,
            y: centerY + (position.y - baseCenterY) * scale
          });
        }
      }

      return positions;
    }

    function disjointCopiesDefinition(copies, baseDefinition, notationName) {
      const edgePairs = [];

      for (let copy = 0; copy < copies; copy += 1) {
        const offset = copy * baseDefinition.vertexCount;

        for (const edge of baseDefinition.edgePairs) {
          addUniqueEdge(edgePairs, edge.from + offset, edge.to + offset);
        }
      }

      return makeDefinition(
        copies * baseDefinition.vertexCount,
        edgePairs,
        notationName || `${copies} copies of ${baseDefinition.displayName}`,
        copyClusterPositions(baseDefinition, copies),
        "standard",
        { type: "copies", copies, base: baseDefinition.meta || { type: "custom" } }
      );
    }

    function makeCompleteDefinition(size) {
      const edgePairs = [];

      for (let from = 0; from < size; from += 1) {
        for (let to = from + 1; to < size; to += 1) {
          addUniqueEdge(edgePairs, from, to);
        }
      }

      return makeDefinition(size, edgePairs, `K_${size}`, circlePositions(size, Math.min(190, 45 + size * 18)), "standard", { type: "complete", n: size });
    }

    function makeEmptyDefinition(size) {
      return makeDefinition(size, [], `${size}K_1`, circlePositions(size, Math.min(190, 45 + size * 18)), "standard", { type: "empty", n: size, parts: Array(size).fill(1) });
    }

    function makePathDefinition(size) {
      const edgePairs = [];

      for (let index = 0; index < size - 1; index += 1) {
        addUniqueEdge(edgePairs, index, index + 1);
      }

      return makeDefinition(size, edgePairs, `P_${size}`, linePositions(size), "standard", { type: "path", n: size });
    }

    function makeCycleDefinition(size) {
      if (size < 3) {
        throw new Error("Cycle graphs need at least 3 vertices.");
      }

      const edgePairs = [];

      for (let index = 0; index < size; index += 1) {
        addUniqueEdge(edgePairs, index, (index + 1) % size);
      }

      return makeDefinition(size, edgePairs, `C_${size}`, circlePositions(size), "standard", { type: "cycle", n: size });
    }

    function makeWheelDefinition(rimSize) {
      if (rimSize < 3) {
        throw new Error("Wheel graphs need a rim cycle with at least 3 vertices.");
      }

      const edgePairs = [];
      const hubIndex = rimSize;

      for (let index = 0; index < rimSize; index += 1) {
        addUniqueEdge(edgePairs, index, (index + 1) % rimSize);
        addUniqueEdge(edgePairs, hubIndex, index);
      }

      return makeDefinition(
        rimSize + 1,
        edgePairs,
        `W_${rimSize}`,
        wheelPositions(rimSize),
        "standard",
        { type: "wheel", rimSize }
      );
    }

    function makeCubeDefinition(dimension) {
      if (dimension < 1) {
        throw new Error("Cube graphs need dimension at least 1.");
      }

      const vertexCount = 2 ** dimension;
      const edgePairs = [];

      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        for (let bit = 0; bit < dimension; bit += 1) {
          const neighbor = vertex ^ (1 << bit);
          if (vertex < neighbor) {
            addUniqueEdge(edgePairs, vertex, neighbor);
          }
        }
      }

      return makeDefinition(
        vertexCount,
        edgePairs,
        `Q_${dimension}`,
        cubePositions(dimension),
        "standard",
        { type: "cube", dimension }
      );
    }

    function makeCompleteBipartiteDefinition(leftCount, rightCount) {
      const edgePairs = [];

      for (let left = 0; left < leftCount; left += 1) {
        for (let right = leftCount; right < leftCount + rightCount; right += 1) {
          addUniqueEdge(edgePairs, left, right);
        }
      }

      return makeDefinition(
        leftCount + rightCount,
        edgePairs,
        `K_{${leftCount},${rightCount}}`,
        multipartitePositions([leftCount, rightCount]),
        "standard",
        { type: "multipartite", parts: [leftCount, rightCount] }
      );
    }

    function multipartitePositions(partSizes) {
      const left = 70;
      const right = graphCanvas.width - 70;
      const top = 70;
      const bottom = graphCanvas.height - 70;
      const positions = [];
      const partCount = partSizes.length;

      partSizes.forEach((partSize, partIndex) => {
        const x = partCount === 1 ? graphCanvas.width / 2 : left + ((right - left) * partIndex) / (partCount - 1);

        for (let index = 0; index < partSize; index += 1) {
          positions.push({
            x,
            y: partSize === 1 ? graphCanvas.height / 2 : top + ((bottom - top) * index) / (partSize - 1)
          });
        }
      });

      return positions;
    }

    function makeCompleteMultipartiteDefinition(partSizes) {
      if (partSizes.length < 2) {
        throw new Error("Multipartite graphs need at least two part sizes.");
      }

      const vertexCount = partSizes.reduce((sum, partSize) => sum + partSize, 0);
      const edgePairs = [];
      const partStart = [];
      let running = 0;

      for (const partSize of partSizes) {
        partStart.push(running);
        running += partSize;
      }

      for (let firstPart = 0; firstPart < partSizes.length; firstPart += 1) {
        for (let secondPart = firstPart + 1; secondPart < partSizes.length; secondPart += 1) {
          for (let first = 0; first < partSizes[firstPart]; first += 1) {
            for (let second = 0; second < partSizes[secondPart]; second += 1) {
              addUniqueEdge(edgePairs, partStart[firstPart] + first, partStart[secondPart] + second);
            }
          }
        }
      }

      return makeDefinition(
        vertexCount,
        edgePairs,
        `K_{${partSizes.join(",")}}`,
        multipartitePositions(partSizes),
        "standard",
        { type: "multipartite", parts: partSizes.slice() }
      );
    }

    function makeBalancedBipartiteDefinition(partSize) {
      return makeCompleteBipartiteDefinition(partSize, partSize);
    }

    function makePetersenDefinition() {
      const edgePairs = [];

      for (let index = 0; index < 5; index += 1) {
        addUniqueEdge(edgePairs, index, (index + 1) % 5);
        addUniqueEdge(edgePairs, index, index + 5);
        addUniqueEdge(edgePairs, index + 5, ((index + 2) % 5) + 5);
      }

      return makeDefinition(10, edgePairs, "Petersen graph", petersenPositions(), "standard", { type: "petersen" });
    }

    function parseBalancedPartSize(text) {
      if (!text) {
        return 3;
      }

      const cleanText = text.replace(/\bvertices?\b/g, "").trim();

      if (cleanText.includes("+")) {
        const parts = cleanText.split("+").map((part) => parseSmallNumber(part.trim()));
        if (parts.length === 2 && parts[0] && parts[0] === parts[1]) {
          return parts[0];
        }

        throw new Error("Balanced bipartite graphs need matching part sizes, such as 3+3.");
      }

      const totalVertices = parseSmallNumber(cleanText);
      if (totalVertices && totalVertices % 2 === 0) {
        return totalVertices / 2;
      }

      throw new Error("Balanced bipartite graphs need an even total size or n+n vertices.");
    }

    function joinDefinitions(leftDefinition, rightDefinition) {
      const offset = leftDefinition.vertexCount;
      const edgePairs = [];

      for (const edge of leftDefinition.edgePairs) {
        addUniqueEdge(edgePairs, edge.from, edge.to);
      }

      for (const edge of rightDefinition.edgePairs) {
        addUniqueEdge(edgePairs, edge.from + offset, edge.to + offset);
      }

      for (let left = 0; left < leftDefinition.vertexCount; left += 1) {
        for (let right = 0; right < rightDefinition.vertexCount; right += 1) {
          addUniqueEdge(edgePairs, left, right + offset, "operation");
        }
      }

      return makeDefinition(
        leftDefinition.vertexCount + rightDefinition.vertexCount,
        edgePairs,
        `join of ${flattenedDisplayNames(leftDefinition, rightDefinition, "join").join(", ")}`,
        joinPositions(leftDefinition, rightDefinition),
        "standard",
        {
          type: "join",
          left: leftDefinition.meta || { type: "custom" },
          right: rightDefinition.meta || { type: "custom" }
        }
      );
    }

    function cartesianProductDefinitions(leftDefinition, rightDefinition) {
      const edgePairs = [];
      const leftSize = leftDefinition.vertexCount;
      const rightSize = rightDefinition.vertexCount;
      const vertexCount = leftSize * rightSize;

      function productIndex(leftIndex, rightIndex) {
        return rightIndex * leftSize + leftIndex;
      }

      for (let rightIndex = 0; rightIndex < rightSize; rightIndex += 1) {
        for (const edge of leftDefinition.edgePairs) {
          addUniqueEdge(
            edgePairs,
            productIndex(edge.from, rightIndex),
            productIndex(edge.to, rightIndex),
            "layer"
          );
        }
      }

      for (let leftIndex = 0; leftIndex < leftSize; leftIndex += 1) {
        for (const edge of rightDefinition.edgePairs) {
          addUniqueEdge(
            edgePairs,
            productIndex(leftIndex, edge.from),
            productIndex(leftIndex, edge.to),
            "fiber"
          );
        }
      }

      return makeDefinition(
        vertexCount,
        edgePairs,
        `Cartesian product of ${flattenedDisplayNames(leftDefinition, rightDefinition, "cartesian").join(", ")}`,
        productPositions(leftDefinition, rightDefinition),
        "standard",
        {
          type: "cartesian",
          left: leftDefinition.meta || { type: "custom" },
          right: rightDefinition.meta || { type: "custom" },
          leftVertexCount: leftDefinition.vertexCount,
          rightVertexCount: rightDefinition.vertexCount
        }
      );
    }

    function complementDefinition(baseDefinition) {
      const existingEdges = new Set(baseDefinition.edgePairs.map((edge) => `${Math.min(edge.from, edge.to)}--${Math.max(edge.from, edge.to)}`));
      const edgePairs = [];

      for (let from = 0; from < baseDefinition.vertexCount; from += 1) {
        for (let to = from + 1; to < baseDefinition.vertexCount; to += 1) {
          const key = `${from}--${to}`;

          if (!existingEdges.has(key)) {
            addUniqueEdge(edgePairs, from, to, "complement");
          }
        }
      }

      return makeDefinition(
        baseDefinition.vertexCount,
        edgePairs,
        `complement of ${baseDefinition.displayName}`,
        fallbackPositions(baseDefinition),
        "standard",
        { type: "complement", base: baseDefinition.meta || { type: "custom" } }
      );
    }

    function splitAssociativeOperands(text) {
      return text
        .replace(/\s*,\s*(?:and\s+)?/g, " | ")
        .replace(/\s+and\s+/g, " | ")
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);
    }

    function foldGraphOperation(parts, operationName, operation) {
      if (parts.length < 2) {
        throw new Error(`${operationName} needs at least two graph descriptions.`);
      }

      return parts
        .map((part) => parseGraphPhrase(part))
        .reduce((current, next) => operation(current, next));
    }

    function flattenMeta(meta, type) {
      if (!meta || meta.type !== type) {
        return [meta || { type: "custom" }];
      }

      return [...flattenMeta(meta.left, type), ...flattenMeta(meta.right, type)];
    }

    function flattenedDisplayNames(leftDefinition, rightDefinition, type) {
      const leftItems = leftDefinition.meta && leftDefinition.meta.type === type
        ? flattenMeta(leftDefinition.meta, type).map((item) => item.displayName || "graph")
        : [leftDefinition.displayName];
      const rightItems = rightDefinition.meta && rightDefinition.meta.type === type
        ? flattenMeta(rightDefinition.meta, type).map((item) => item.displayName || "graph")
        : [rightDefinition.displayName];

      return [...leftItems, ...rightItems];
    }

    function parseGraphPhrase(phrase) {
      const joinPrefix = "join of ";
      const productPrefix = "cartesian product of ";
      const complementPrefixes = ["complement graph of ", "complement of "];
      const compactPhrase = phrase.replace(/\s+/g, "");
      let compactMatch = compactPhrase.match(/^([cpqw])_?(\d+)$/);

      for (const prefix of complementPrefixes) {
        if (phrase.startsWith(prefix)) {
          return complementDefinition(parseGraphPhrase(phrase.slice(prefix.length)));
        }
      }

      const savedDefinition = getSavedGraphDefinition(phrase);
      if (savedDefinition) {
        return savedDefinition;
      }

      compactMatch = compactPhrase.match(/^(\d+)k_?n$/);
      if (compactMatch) {
        throw new Error(`Use a number for n, such as ${compactMatch[1]}K5 for ${compactMatch[1]} copies of K_5.`);
      }

      compactMatch = compactPhrase.match(/^(\d+)k_?(\d+)$/);
      if (compactMatch) {
        const copies = parseSmallNumber(compactMatch[1]);
        const completeSize = parseSmallNumber(compactMatch[2]);

        if (!copies || !completeSize) {
          throw new Error("Use notation like 3K5 for three copies of K_5.");
        }

        return disjointCopiesDefinition(copies, makeCompleteDefinition(completeSize), `${copies}K_${completeSize}`);
      }

      compactMatch = compactPhrase.match(/^([cpqw])_?(\d+)$/);
      if (compactMatch) {
        const family = compactMatch[1];
        const size = parseSmallNumber(compactMatch[2]);

        if (family === "c") {
          return makeCycleDefinition(size);
        }

        if (family === "p") {
          return makePathDefinition(size);
        }

        if (family === "q") {
          return makeCubeDefinition(size);
        }

        return makeWheelDefinition(size);
      }

      compactMatch = compactPhrase.match(/^k_?(\d+)$/);
      if (compactMatch) {
        const compactBipartiteMatch = phrase.match(/^k(\d)(\d)$/);
        if (compactBipartiteMatch) {
          const left = parseSmallNumber(compactBipartiteMatch[1]);
          const right = parseSmallNumber(compactBipartiteMatch[2]);

          if (left >= 2 && right >= 2) {
            return makeCompleteBipartiteDefinition(left, right);
          }
        }

        const completeSize = parseSmallNumber(compactMatch[1]);

        if (completeSize) {
          return makeCompleteDefinition(completeSize);
        }

        if (compactMatch[1].length === 2) {
          return makeCompleteBipartiteDefinition(
            parseSmallNumber(compactMatch[1][0]),
            parseSmallNumber(compactMatch[1][1])
          );
        }

        throw new Error("Use K5 for a complete graph or K3,4 for a complete bipartite graph.");
      }

      compactMatch = compactPhrase.match(/^k_?(\d+)[,x](\d+)$/);
      if (compactMatch) {
        return makeCompleteBipartiteDefinition(parseSmallNumber(compactMatch[1]), parseSmallNumber(compactMatch[2]));
      }

      compactMatch = compactPhrase.match(/^k_?(\d+(?:,\d+){2,})$/);
      if (compactMatch) {
        return makeCompleteMultipartiteDefinition(compactMatch[1].split(",").map((part) => parseSmallNumber(part)));
      }

      if (phrase.startsWith(joinPrefix)) {
        const rest = phrase.slice(joinPrefix.length);
        return foldGraphOperation(
          splitAssociativeOperands(rest),
          "Join",
          joinDefinitions
        );
      }

      if (phrase.startsWith(productPrefix)) {
        const rest = phrase.slice(productPrefix.length);
        const twinMatch = rest.match(/^two (cycles?|paths?|complete graphs?|empty graphs?)(?: on (.+))?$/);

        if (twinMatch) {
          const family = twinMatch[1];
          const size = parseVertexCount(twinMatch[2], family.includes("cycle") ? 4 : 3);
          const first = parseGraphPhrase(`${family.replace(/s$/, "")} on ${size} vertices`);
          const second = parseGraphPhrase(`${family.replace(/s$/, "")} on ${size} vertices`);
          return cartesianProductDefinitions(first, second);
        }

        return foldGraphOperation(
          splitAssociativeOperands(rest),
          "Cartesian product",
          cartesianProductDefinitions
        );
      }

      let match = phrase.match(/^cartesian product of two (cycles?|paths?|complete graphs?|empty graphs?)(?: on (.+))?$/);
      if (match) {
        const family = match[1];
        const size = parseVertexCount(match[2], family.includes("cycle") ? 4 : 3);
        const first = parseGraphPhrase(`${family.replace(/s$/, "")} on ${size} vertices`);
        const second = parseGraphPhrase(`${family.replace(/s$/, "")} on ${size} vertices`);
        return cartesianProductDefinitions(first, second);
      }

      if (phrase === "petersen graph" || phrase === "petersen") {
        return makePetersenDefinition();
      }

      match = phrase.match(/^(?:cycle|cycle graph)(?: on (.+))?$/);
      if (match) {
        return makeCycleDefinition(parseVertexCount(match[1], 5));
      }

      match = phrase.match(/^(?:path|path graph)(?: on (.+))?$/);
      if (match) {
        return makePathDefinition(parseVertexCount(match[1], 5));
      }

      match = phrase.match(/^c\s+(.+)$/);
      if (match) {
        return makeCycleDefinition(parseVertexCount(match[1], 5));
      }

      match = phrase.match(/^p\s+(.+)$/);
      if (match) {
        return makePathDefinition(parseVertexCount(match[1], 5));
      }

      match = phrase.match(/^k\s+(.+)$/);
      if (match) {
        const parts = match[1].trim().split(/\s+/);

        if (parts.length === 2) {
          const left = parseSmallNumber(parts[0]);
          const right = parseSmallNumber(parts[1]);

          if (left && right) {
            return makeCompleteBipartiteDefinition(left, right);
          }
        }

        return makeCompleteDefinition(parseVertexCount(match[1], 4));
      }

      match = phrase.match(/^complete bipartite graph(?: on (.+))?$/);
      if (match) {
      if (!match[1]) {
          return makeCompleteBipartiteDefinition(3, 3);
        }

        const parts = match[1].replace(/\bvertices?\b/g, "").replace(/\+/g, " ").trim().split(/\s+(?:and|by|x)\s+|\s+/);
        const counts = parts.map((part) => parseSmallNumber(part)).filter(Boolean);

        if (counts.length >= 2) {
          return makeCompleteBipartiteDefinition(counts[0], counts[1]);
        }

        throw new Error("Complete bipartite graphs need two part sizes, such as K 3 4 or complete bipartite graph on 3 and 4 vertices.");
      }

      match = phrase.match(/^(?:complete )?multipartite graph(?: on (.+))?$/);
      if (match) {
        if (!match[1]) {
          return makeCompleteMultipartiteDefinition([3, 3, 4]);
        }

        const parts = match[1]
          .replace(/\bvertices?\b/g, "")
          .replace(/\+/g, " ")
          .trim()
          .split(/\s*(?:,|and|by|x)\s+|\s+/)
          .map((part) => parseSmallNumber(part))
          .filter(Boolean);

        if (parts.length >= 2) {
          return makeCompleteMultipartiteDefinition(parts);
        }

        throw new Error("Multipartite graphs need part sizes, such as K_{3,3,4,5}.");
      }

      match = phrase.match(/^complete balanced bipartite graph(?: on (.+))?$/);
      if (match) {
        return makeBalancedBipartiteDefinition(parseBalancedPartSize(match[1]));
      }

      match = phrase.match(/^complete graph(?: on (.+))?$/);
      if (match) {
        return makeCompleteDefinition(parseVertexCount(match[1], 4));
      }

      match = phrase.match(/^empty graph(?: on (.+))?$/);
      if (match) {
        return makeEmptyDefinition(parseVertexCount(match[1], 3));
      }

      throw new Error("Try examples like: Petersen graph, cycle on 6 vertices, K 3 4, or Cartesian product of cycle on 4 vertices and path on 3 vertices.");
    }

    function parseGraphDescription(text) {
      const normalizedDescription = normalizeDescription(text);

      if (!normalizedDescription) {
        throw new Error("Type a graph description first.");
      }

      return parseGraphPhrase(normalizedDescription);
    }

    function parseAdjacencyMatrixRow(rowText) {
      const cleanRow = rowText
        .trim()
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .trim();

      if (!cleanRow) {
        return [];
      }

      if (/^[01]+$/.test(cleanRow)) {
        return cleanRow.split("").map((entry) => Number(entry));
      }

      return cleanRow
        .replace(/,/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((entry) => {
          if (!/^[01]$/.test(entry)) {
            throw new Error("Adjacency matrix entries should be only 0 or 1.");
          }

          return Number(entry);
        });
    }

    function parseAdjacencyMatrix(text) {
      const cleanedText = text.trim();

      if (!cleanedText) {
        throw new Error("Paste an adjacency matrix first.");
      }

      const rows = cleanedText
        .replace(/^\s*\[/, "")
        .replace(/\]\s*$/, "")
        .split(/[\n;]+/)
        .map((row) => parseAdjacencyMatrixRow(row))
        .filter((row) => row.length > 0);

      if (rows.length === 0) {
        throw new Error("Paste an adjacency matrix first.");
      }

      const size = rows.length;

      if (size > maxGeneratedVertices) {
        throw new Error(`Please use an adjacency matrix with ${maxGeneratedVertices} vertices or fewer.`);
      }

      for (const row of rows) {
        if (row.length !== size) {
          throw new Error("Adjacency matrix must be square: the number of rows must equal every row length.");
        }
      }

      for (let row = 0; row < size; row += 1) {
        if (rows[row][row] !== 0) {
          throw new Error("Diagonal entries must be 0 for a simple graph.");
        }

        for (let column = row + 1; column < size; column += 1) {
          if (rows[row][column] !== rows[column][row]) {
            throw new Error("Adjacency matrix must be symmetric for an undirected graph.");
          }
        }
      }

      return rows;
    }

    function makeDefinitionFromAdjacencyMatrix(matrix) {
      const edgePairs = [];

      for (let row = 0; row < matrix.length; row += 1) {
        for (let column = row + 1; column < matrix.length; column += 1) {
          if (matrix[row][column] === 1) {
            addUniqueEdge(edgePairs, row, column);
          }
        }
      }

      return makeDefinition(
        matrix.length,
        edgePairs,
        `Adjacency matrix graph (${matrix.length} vertices)`,
        circlePositions(matrix.length, Math.min(220, 55 + matrix.length * 14)),
        "standard",
        { type: "adjacency-matrix" }
      );
    }

    function generateGraphFromAdjacencyMatrix() {
      let definition;

      try {
        definition = makeDefinitionFromAdjacencyMatrix(parseAdjacencyMatrix(matrixInput.value));
      } catch (error) {
        status.textContent = error.message;
        updateView();
        return;
      }

      saveUndoState();
      setGraphFromDefinition(definition, definition.displayName);
      status.textContent = `Loaded ${definition.displayName}.`;
      updateView();
    }

    function setGraphFromDefinition(definition, displayName) {
      clearGraphData();

      for (let index = 0; index < definition.vertexCount; index += 1) {
        const node = createNode(makeNodeLabel(index, definition.vertexCount));
        const position = definition.positions && definition.positions[index];

        if (position) {
          node.x = position.x;
          node.y = position.y;
          node.vx = 0;
          node.vy = 0;
          node.fixed = definition.layout === "standard";
        }

        nodes.push(node);
      }

      for (const edge of definition.edgePairs) {
        const from = nodes[edge.from].label;
        const to = nodes[edge.to].label;
        edges.push({ from, to, key: makeEdgeKey(from, to), kind: edge.kind || "normal" });
      }

      currentGraphName = displayName;
      currentGraphMeta = definition.meta || { type: "custom" };
    }

    function generateGraphFromDescription() {
      let definition;

      try {
        definition = parseGraphDescription(descriptionInput.value);
      } catch (error) {
        status.textContent = error.message;
        updateView();
        return;
      }

      saveUndoState();
      setGraphFromDefinition(definition, definition.displayName);
      status.textContent = `Generated ${definition.displayName}.`;
      updateView();
    }

    function getPointerPosition(event) {
      const rect = graphCanvas.getBoundingClientRect();
      const scaleX = graphCanvas.width / rect.width;
      const scaleY = graphCanvas.height / rect.height;

      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      };
    }

    function findNodeAtPosition(x, y) {
      for (let i = nodes.length - 1; i >= 0; i -= 1) {
        const node = nodes[i];
        const dx = x - node.x;
        const dy = y - node.y;
        if (Math.sqrt(dx * dx + dy * dy) <= physics.nodeRadius) {
          return node;
        }
      }

      return null;
    }

    function getCartesianCopyDragGroup(node) {
      if (
        !currentGraphMeta ||
        currentGraphMeta.type !== "cartesian" ||
        !Number.isInteger(currentGraphMeta.leftVertexCount) ||
        !Number.isInteger(currentGraphMeta.rightVertexCount)
      ) {
        return [node];
      }

      const leftSize = currentGraphMeta.leftVertexCount;
      const rightSize = currentGraphMeta.rightVertexCount;
      const nodeIndex = nodes.indexOf(node);

      if (nodeIndex === -1 || leftSize <= 0 || rightSize <= 1 || leftSize * rightSize !== nodes.length) {
        return [node];
      }

      const leftIndex = nodeIndex % leftSize;
      const group = [];

      for (let rightIndex = 0; rightIndex < rightSize; rightIndex += 1) {
        const copyIndex = rightIndex * leftSize + leftIndex;
        if (nodes[copyIndex]) {
          group.push(nodes[copyIndex]);
        }
      }

      return group.length > 0 ? group : [node];
    }

    function getBoundedDragDelta(rawDx, rawDy, dragGroup) {
      const radius = physics.nodeRadius;
      let minDx = -Infinity;
      let maxDx = Infinity;
      let minDy = -Infinity;
      let maxDy = Infinity;

      for (const item of dragGroup) {
        minDx = Math.max(minDx, radius - item.startX);
        maxDx = Math.min(maxDx, graphCanvas.width - radius - item.startX);
        minDy = Math.max(minDy, radius - item.startY);
        maxDy = Math.min(maxDy, graphCanvas.height - radius - item.startY);
      }

      return {
        dx: Math.max(minDx, Math.min(maxDx, rawDx)),
        dy: Math.max(minDy, Math.min(maxDy, rawDy))
      };
    }

    function startDragging(event) {
      const pointerPosition = getPointerPosition(event);
      const node = findNodeAtPosition(pointerPosition.x, pointerPosition.y);

      if (!node) {
        return;
      }

      pointer.draggingNode = node;
      pointer.offsetX = pointerPosition.x - node.x;
      pointer.offsetY = pointerPosition.y - node.y;
      pointer.startSnapshot = cloneState();
      pointer.moved = false;
      pointer.wasFixed = node.fixed;
      pointer.dragGroup = getCartesianCopyDragGroup(node).map((groupNode) => ({
        node: groupNode,
        startX: groupNode.x,
        startY: groupNode.y,
        wasFixed: groupNode.fixed
      }));

      for (const item of pointer.dragGroup) {
        item.node.fixed = true;
        item.node.vx = 0;
        item.node.vy = 0;
      }

      status.textContent = pointer.dragGroup.length > 1
        ? `Dragging "${node.label}" and its Cartesian product copies.`
        : `Dragging "${node.label}".`;
    }

    function moveDragging(event) {
      if (!pointer.draggingNode) {
        return;
      }

      const pointerPosition = getPointerPosition(event);
      const primary = pointer.dragGroup.find((item) => item.node === pointer.draggingNode) || pointer.dragGroup[0];
      const rawDx = pointerPosition.x - pointer.offsetX - primary.startX;
      const rawDy = pointerPosition.y - pointer.offsetY - primary.startY;
      const { dx, dy } = getBoundedDragDelta(rawDx, rawDy, pointer.dragGroup);

      for (const item of pointer.dragGroup) {
        item.node.x = item.startX + dx;
        item.node.y = item.startY + dy;
        item.node.vx = 0;
        item.node.vy = 0;
      }

      pointer.moved = true;
    }

    function stopDragging() {
      if (!pointer.draggingNode) {
        return;
      }

      for (const item of pointer.dragGroup) {
        item.node.fixed = item.wasFixed;
      }

      if (pointer.moved && pointer.startSnapshot) {
        undoStack.push(pointer.startSnapshot);
        trimStack(undoStack);
        redoStack.length = 0;
      }

      status.textContent = pointer.dragGroup.length > 1
        ? `Released "${pointer.draggingNode.label}" and its Cartesian product copies.`
        : `Released "${pointer.draggingNode.label}". The layout will settle again.`;
      pointer.draggingNode = null;
      pointer.dragGroup = [];
      pointer.startSnapshot = null;
      pointer.moved = false;
      pointer.wasFixed = false;
      updateView();
    }

    function getParameterValuesForTest() {
      return Object.fromEntries(getPropertyRows().map(([id, name, value, hint]) => [
        id,
        {
          name,
          value: String(value),
          hint
        }
      ]));
    }

    function getGraphSnapshotForTest() {
      return {
        name: currentGraphName,
        vertexCount: nodes.length,
        edgeCount: edges.length,
        vertices: nodes.map((node) => node.label),
        edges: edges.map((edge) => ({ from: edge.from, to: edge.to })),
        parameters: getParameterValuesForTest()
      };
    }

    function loadGraphForTest(description) {
      const definition = parseGraphDescription(description);
      setGraphFromDefinition(definition, definition.displayName);
      updateView();
      return getGraphSnapshotForTest();
    }

    function summarizeDefinitionForTest(definition) {
      return {
        name: definition.displayName,
        vertexCount: definition.vertexCount,
        edgeCount: (definition.edgePairs || []).length
      };
    }

    function parseGraphForTest(description) {
      return summarizeDefinitionForTest(parseGraphDescription(description));
    }

    function parseMatrixForTest(text) {
      return summarizeDefinitionForTest(makeDefinitionFromAdjacencyMatrix(parseAdjacencyMatrix(text)));
    }

    function loadMatrixForTest(text) {
      const definition = makeDefinitionFromAdjacencyMatrix(parseAdjacencyMatrix(text));
      setGraphFromDefinition(definition, definition.displayName);
      updateView();
      return getGraphSnapshotForTest();
    }

    function getSpectrumForTest(description) {
      const definition = parseGraphDescription(description);
      setGraphFromDefinition(definition, definition.displayName);
      return formatSpectrum(jacobiEigenvaluesSymmetric(buildAdjacencyMatrix()));
    }

    function findMinorForTest(hostDescription, targetDescription) {
      const hostDefinition = parseGraphDescription(hostDescription);
      const targetDefinition = parseGraphDescription(targetDescription);
      setGraphFromDefinition(hostDefinition, hostDefinition.displayName);
      updateView();

      const hostSnapshot = makePlainDefinitionFromCurrentGraph(hostDefinition.displayName);
      const result = getMinorContainmentResult(hostSnapshot, targetDefinition);
      return {
        host: hostDefinition.displayName,
        target: targetDefinition.displayName,
        text: result.text,
        witness: formatMinorWitness(result, hostSnapshot, targetDefinition).trim()
      };
    }

    function clearGraphForTest() {
      clearGraphData();
      updateView();
      return getGraphSnapshotForTest();
    }

    window.MiniGraphExplorerTestAPI = {
      clearGraph: clearGraphForTest,
      findMinor: findMinorForTest,
      getGraphSnapshot: getGraphSnapshotForTest,
      getParameters: getParameterValuesForTest,
      loadGraph: loadGraphForTest,
      loadMatrix: loadMatrixForTest,
      parseGraph: parseGraphForTest,
      parseMatrix: parseMatrixForTest,
      spectrum: getSpectrumForTest
    };

    function animate() {
      if (nodes.length > 0) {
        runForces();
      }

      renderGraph();
      requestAnimationFrame(animate);
    }

    addNodeBtn.addEventListener("click", () => {
      addNode(nodeInput.value);
      nodeInput.value = "";
      nodeInput.focus();
    });

    deleteNodeBtn.addEventListener("click", () => {
      deleteNode(nodeInput.value);
      nodeInput.value = "";
      nodeInput.focus();
    });

    addEdgeBtn.addEventListener("click", () => {
      addEdge(fromInput.value, toInput.value);
      toInput.value = "";
      fromInput.focus();
    });

    deleteEdgeBtn.addEventListener("click", () => {
      deleteEdge(fromInput.value, toInput.value);
      toInput.value = "";
      fromInput.focus();
    });
    nodeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        addNode(nodeInput.value);
        nodeInput.value = "";
      }
    });
    [fromInput, toInput].forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          addEdge(fromInput.value, toInput.value);
          toInput.value = "";
          fromInput.focus();
        }
      });
    });

    labelToggle.addEventListener("change", () => {
      setShowLabels(labelToggle.checked);
    });

    sizeSlider.addEventListener("change", () => {
      setNodeRadius(sizeSlider.value);
    });

    sizeSlider.addEventListener("input", () => {
      sizeValue.textContent = `${sizeSlider.value} px`;
    });

    nodeColorInput.addEventListener("change", () => {
      setGraphColor("node", nodeColorInput.value);
    });

    edgeColorInput.addEventListener("change", () => {
      setGraphColor("edge", edgeColorInput.value);
    });

    generateGraphBtn.addEventListener("click", generateGraphFromDescription);
    descriptionInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        generateGraphFromDescription();
      }
    });
    saveGraphNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        saveCurrentGraphToMemory();
      }
    });
    generateMatrixBtn.addEventListener("click", generateGraphFromAdjacencyMatrix);
    saveGraphBtn.addEventListener("click", saveCurrentGraphToMemory);
    savedGraphList.addEventListener("click", handleSavedGraphListClick);
    propertyBox.addEventListener("input", (event) => {
      if (event.target && event.target.id === "minorInput") {
        minorQuery = event.target.value;
      }
    });
    propertyBox.addEventListener("click", (event) => {
      if (event.target && event.target.id === "findMinorBtn") {
        const input = document.getElementById("minorInput");
        minorQuery = input ? input.value : minorQuery;
        runFindMinor();
      }

      if (event.target && event.target.id === "computeSpectrumBtn") {
        computeSpectrum();
      }
    });
    propertyBox.addEventListener("keydown", (event) => {
      if (event.target && event.target.id === "minorInput" && event.key === "Enter") {
        minorQuery = event.target.value;
        runFindMinor();
      }
    });

    dictionarySearch.addEventListener("input", renderDescriptionDictionary);
    topToolButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const toolName = button.dataset.toolTab;
        const willOpen = button.getAttribute("aria-expanded") !== "true";

        for (const tab of topToolButtons) {
          tab.setAttribute("aria-expanded", "false");
        }

        for (const panel of topToolPanels) {
          panel.classList.remove("is-open");
        }

        if (willOpen) {
          button.setAttribute("aria-expanded", "true");
          const panel = topToolPanels.find((item) => item.dataset.toolPanel === toolName);
          if (panel) {
            panel.classList.add("is-open");
          }
        }
      });
    });

    dictionaryList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-example]");

      if (!button) {
        return;
      }

      descriptionInput.value = button.dataset.example;
      descriptionInput.focus();
    });

    undoBtn.addEventListener("click", undoLastStep);
    redoBtn.addEventListener("click", redoLastStep);

    resetBtn.addEventListener("click", () => {
      saveUndoState();
      clearGraphData();
      status.textContent = "Graph cleared.";
      propertyBox.textContent = "";
      listBox.textContent = "";
      updateView();
    });

    graphCanvas.addEventListener("pointerdown", startDragging);
    graphCanvas.addEventListener("pointermove", moveDragging);
    graphCanvas.addEventListener("pointerup", stopDragging);
    graphCanvas.addEventListener("pointerleave", stopDragging);
    graphCanvas.addEventListener("pointercancel", stopDragging);

    labelToggle.checked = showLabels;
    renderDescriptionDictionary();
    renderSavedGraphs();
    updateSizeOutput();
    updateView();
    animate();
