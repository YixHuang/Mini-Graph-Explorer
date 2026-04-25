const DEFAULT_SITE_ID = 'mini-graph-explorer';
const SESSION_CACHE_SECONDS = 20 * 60;

function doGet(e) {
  const parameter = e && e.parameter ? e.parameter : {};
  const action = String(parameter.action || 'hit').toLowerCase();
  const siteId = sanitizeSiteId(parameter.site || DEFAULT_SITE_ID);
  const countryCode = sanitizeCountryCode(parameter.country || 'ZZ');
  const countryName = sanitizeLabel(parameter.countryName || 'Unknown');
  const sessionId = sanitizeLabel(parameter.session || '');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const payload = action === 'read'
      ? readVisitorStats(siteId)
      : recordVisitorHit(siteId, countryCode, countryName, sessionId);
    return jsonOutput(payload);
  } finally {
    lock.releaseLock();
  }
}

function recordVisitorHit(siteId, countryCode, countryName, sessionId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = sessionId ? siteId + ':session:' + sessionId : '';

  if (cacheKey && cache.get(cacheKey)) {
    return readVisitorStats(siteId);
  }

  const scriptProperties = PropertiesService.getScriptProperties();
  const totalKey = siteId + ':total';
  const countriesKey = siteId + ':countries';
  const namesKey = siteId + ':countryNames';
  const updatedAtKey = siteId + ':updatedAt';

  const countries = parseObjectProperty(scriptProperties.getProperty(countriesKey));
  const countryNames = parseObjectProperty(scriptProperties.getProperty(namesKey));
  const nextTotal = Number(scriptProperties.getProperty(totalKey) || 0) + 1;

  countries[countryCode] = Number(countries[countryCode] || 0) + 1;
  countryNames[countryCode] = countryName || countryNames[countryCode] || countryCode;

  scriptProperties.setProperty(totalKey, String(nextTotal));
  scriptProperties.setProperty(countriesKey, JSON.stringify(countries));
  scriptProperties.setProperty(namesKey, JSON.stringify(countryNames));
  scriptProperties.setProperty(updatedAtKey, new Date().toISOString());

  if (cacheKey) {
    cache.put(cacheKey, '1', SESSION_CACHE_SECONDS);
  }

  return readVisitorStats(siteId);
}

function readVisitorStats(siteId) {
  const scriptProperties = PropertiesService.getScriptProperties();
  return {
    ok: true,
    siteId: siteId,
    totalVisits: Number(scriptProperties.getProperty(siteId + ':total') || 0),
    countries: parseObjectProperty(scriptProperties.getProperty(siteId + ':countries')),
    countryNames: parseObjectProperty(scriptProperties.getProperty(siteId + ':countryNames')),
    updatedAt: scriptProperties.getProperty(siteId + ':updatedAt') || ''
  };
}

function parseObjectProperty(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function sanitizeSiteId(value) {
  return String(value || DEFAULT_SITE_ID)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || DEFAULT_SITE_ID;
}

function sanitizeCountryCode(value) {
  const normalized = String(value || 'ZZ').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : 'ZZ';
}

function sanitizeLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
