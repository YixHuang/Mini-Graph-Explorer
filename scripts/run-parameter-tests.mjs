import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const testPageUrl = pathToFileURL(join(projectRoot, "tests", "parameter-tests.html")).href;

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.GOOGLE_CHROME_SHIM,
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

function isUsableChrome(candidate) {
  if (candidate.includes("/") || candidate.includes("\\")) {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  const result = spawnSync(candidate, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return !result.error && result.status === 0;
}

function findChrome() {
  return chromeCandidates.find(isUsableChrome);
}

function stripHtml(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getSummary(dom) {
  const summaryMatch = dom.match(/<div id="summary"[^>]*>([\s\S]*?)<\/div>/);
  return summaryMatch ? stripHtml(summaryMatch[1]) : "";
}

function getFailingRows(dom) {
  const rows = [];
  const rowPattern = /<tr>([\s\S]*?)<\/tr>/g;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(dom)) !== null) {
    const rowHtml = rowMatch[1];
    if (!/class="fail"/.test(rowHtml)) {
      continue;
    }

    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => stripHtml(cell[1]));
    if (cells.length >= 5) {
      rows.push({
        caseName: cells[0],
        check: cells[1],
        expected: cells[2],
        actual: cells[3],
        status: cells[4]
      });
    }
  }

  return rows;
}

const chromePath = findChrome();
if (!chromePath) {
  console.error("Could not find Chrome or Chromium.");
  console.error("Set CHROME_PATH to a Chrome executable, then run this script again.");
  process.exit(1);
}

const chromeArgs = [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-dev-shm-usage",
  "--allow-file-access-from-files",
  "--virtual-time-budget=10000",
  "--dump-dom",
  testPageUrl
];

const result = spawnSync(chromePath, chromeArgs, {
  encoding: "utf8",
  maxBuffer: 24 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 30000
});

if (result.error) {
  console.error(`Failed to launch Chrome: ${result.error.message}`);
  process.exit(1);
}

const summary = getSummary(result.stdout);
const failingRows = getFailingRows(result.stdout);

if (result.status !== 0 && !summary) {
  console.error(`Chrome exited with status ${result.status}.`);
  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }
  process.exit(result.status || 1);
}

if (!summary) {
  console.error("Parameter test summary was not found in the rendered page.");
  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }
  process.exit(1);
}

console.log(`Parameter tests: ${summary}`);

if (!/^\d+\/\d+ checks passed\.$/.test(summary)) {
  console.error("Unexpected parameter test summary format.");
  process.exit(1);
}

const [passed, total] = summary.match(/\d+/g).map(Number);
if (passed !== total || failingRows.length > 0) {
  for (const row of failingRows) {
    console.error(`${row.caseName} / ${row.check}: expected ${row.expected}, got ${row.actual}`);
  }
  process.exit(1);
}
