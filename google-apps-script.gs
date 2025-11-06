// =========================
// CONFIGURATION
// =========================
const SHEET_NAME = 'Metrics';                 // log of all metrics
const TARGET_TAB = 'EstimatorFixedUpdatesTable'; // fixed summary table
const BOQ_TAB = 'ExportSheet';                // tab to export
const FOLDER_ID = '1M1PhLq2a0zpzJ6RXwnld5IXVgYEP_mj0'; // your Drive folder
const EXPORT_PREFIX = 'GCSLautoBOQ';          // filename prefix

// Table layout (for fixed summary)
const HEADER_ROW = [
  'Timestamp','Area (numeric)','Area (label)','Area (grid cells)','Wall count',
  'Total wall length (numeric)','Total wall length (label)','Total wall length (grid cells)',
  'Last wall length (numeric)','Last wall length (label)','Unit label','Units per square','Grid spacing (px)',
  'Door area (numeric)','Door area (label)','Window area (numeric)','Window area (label)'
];
const FIXED_START_ROW = 2;
const FIXED_LABEL_COL = 1;
const FIXED_VALUE_COL = 2;

// =========================
// WEB APP ENTRY POINTS
// =========================
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = (params.action || '').toLowerCase();
  const type = (params.type || '').toLowerCase();

  // --- Handle Export ---
  if (action === 'export') {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(BOQ_TAB);
      if (!sheet) return createResponse({ success: false, message: `Tab "${BOQ_TAB}" not found.` });

      const gid = sheet.getSheetId();
      const ssId = ss.getId();
      const stamp = formatStamp();
      const folder = DriveApp.getFolderById(FOLDER_ID);

      if (type === 'xlsx') {
        const xlsxUrl = `https://docs.google.com/spreadsheets/d/${ssId}/export?format=xlsx&gid=${gid}`;
        const fileUrl = createExportFileToFolder(xlsxUrl, `${EXPORT_PREFIX}_${stamp}.xlsx`,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', folder);
        return createResponse({ success: true, type: 'xlsx', downloadUrl: fileUrl });
      }

      // default to PDF
      const pdfUrl = buildPdfExportUrl(ssId, gid);
      const fileUrl = createExportFileToFolder(pdfUrl, `${EXPORT_PREFIX}_${stamp}.pdf`,
        'application/pdf', folder);
      return createResponse({ success: true, type: 'pdf', downloadUrl: fileUrl });
    } catch (err) {
      return createResponse({ success: false, message: err.message || String(err) });
    }
  }

  // --- Default: info message ---
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, hint: 'POST JSON to log metrics or GET ?action=export&type=pdf|xlsx' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(3000);
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createResponse({ success: false, message: 'No request body found. Ensure the web app is called with a JSON payload.' });
    }

    const body = parseRequestBody(e.postData.contents);
    const metrics = normalizeMetrics(body);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return createResponse({ success: false, message: 'No active spreadsheet (is this script bound to a Sheet?).' });

    // --- 1) Append metrics log ---
    const logSheet = getOrCreateSheet(ss);
    ensureHeaderRow(logSheet);
    logSheet.appendRow(buildRow(metrics));

    // --- 2) Update fixed summary table ---
    const ensureInfo = ensureTargetLayout(ss);
    writeFixedValues(ensureInfo.sheet, metrics);

    SpreadsheetApp.flush();
    return createResponse({
      success: true,
      message: 'Metrics appended and fixed table updated.',
      rowNumber: logSheet.getLastRow()
    });

  } catch (error) {
    return createResponse({ success: false, message: error instanceof Error ? error.message : String(error) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// =========================
// HELPERS
// =========================
function parseRequestBody(contents) {
  try { return JSON.parse(contents); }
  catch (_) { throw new Error('Request body was not valid JSON.'); }
}

function normalizeMetrics(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Request payload must be a JSON object.');
  const t = payload.timestamp ? new Date(payload.timestamp) : new Date();
  const m = payload.metrics && typeof payload.metrics === 'object' ? payload.metrics : {};
  return {
    timestamp: t,
    area: coerceNumber(m.area),
    areaLabel: m.areaLabel || '',
    areaCells: coerceNumber(m.areaCells),
    wallCount: coerceNumber(m.wallCount, 0),
    totalWallLength: coerceNumber(m.totalWallLength),
    totalWallLengthLabel: m.totalWallLengthLabel || '',
    totalWallLengthCells: coerceNumber(m.totalWallLengthCells),
    lastWallLength: coerceNumber(m.lastWallLength),
    lastWallLengthLabel: m.lastWallLengthLabel || '',
    unitLabel: m.unitLabel || '',
    unitsPerSquare: coerceNumber(m.unitsPerSquare),
    gridSpacing: coerceNumber(m.gridSpacing),
    doorArea: coerceNumber(m.doorArea),
    doorAreaLabel: m.doorAreaLabel || '',
    windowArea: coerceNumber(m.windowArea),
    windowAreaLabel: m.windowAreaLabel || ''
  };
}

function buildRow(m) {
  return [
    m.timestamp, m.area, m.areaLabel, m.areaCells, m.wallCount,
    m.totalWallLength, m.totalWallLengthLabel, m.totalWallLengthCells,
    m.lastWallLength, m.lastWallLengthLabel, m.unitLabel,
    m.unitsPerSquare, m.gridSpacing,
    m.doorArea, m.doorAreaLabel, m.windowArea, m.windowAreaLabel
  ];
}

function getOrCreateSheet(ss) {
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function ensureHeaderRow(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER_ROW);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, HEADER_ROW.length).getValues()[0];
  const ok = existing.every((v, i) => String(v || '').trim() === HEADER_ROW[i]);
  if (!ok) {
    sheet.insertRows(1);
    sheet.getRange(1, 1, 1, HEADER_ROW.length).setValues([HEADER_ROW]);
  }
}

function ensureTargetLayout(ss) {
  let sheet = ss.getSheetByName(TARGET_TAB);
  let created = false;
  if (!sheet) { sheet = ss.insertSheet(TARGET_TAB); created = true; }

  const labels = [
    'Area (numeric)','Area (label)','Area (grid cells)','Wall count',
    'Total wall length (numeric)','Total wall length (label)','Total wall length (grid cells)',
    'Last wall length (numeric)','Last wall length (label)','Unit label',
    'Units per square','Grid spacing (px)','Door area (numeric)','Door area (label)',
    'Window area (numeric)','Window area (label)','Last updated'
  ];
  const current = sheet.getRange(FIXED_START_ROW, FIXED_LABEL_COL, labels.length, 1)
                      .getValues().map(r => r[0]);
  let needs = created;
  if (!needs) for (let i = 0; i < labels.length; i++)
    if (String(current[i] || '') !== labels[i]) { needs = true; break; }
  if (needs) sheet.getRange(FIXED_START_ROW, FIXED_LABEL_COL, labels.length, 1)
                  .setValues(labels.map(l => [l]));
  return { sheet, created };
}

function writeFixedValues(sheet, m) {
  const values = [
    m.area, m.areaLabel, m.areaCells, m.wallCount,
    m.totalWallLength, m.totalWallLengthLabel, m.totalWallLengthCells,
    m.lastWallLength, m.lastWallLengthLabel, m.unitLabel,
    m.unitsPerSquare, m.gridSpacing, m.doorArea, m.doorAreaLabel,
    m.windowArea, m.windowAreaLabel, new Date()
  ];
  sheet.getRange(FIXED_START_ROW, FIXED_VALUE_COL, values.length, 1)
       .setValues(values.map(v => [v]));
}

// =========================
// EXPORT UTILITIES
// =========================
function buildPdfExportUrl(ssId, gid) {
  const params = {
    format: 'pdf', gid: gid, size: 'A4', portrait: 'false', fitw: 'true',
    gridlines: 'false', printtitle: 'false', sheetnames: 'false',
    pagenum: 'CENTER', fzr: 'true', scale: '2',
    top_margin: '0.5', right_margin: '0.5', bottom_margin: '0.5', left_margin: '0.5'
  };
  const q = Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  return `https://docs.google.com/spreadsheets/d/${ssId}/export?${q}`;
}

function createExportFileToFolder(exportUrl, filename, mimeType, folder) {
  const resp = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  const blob = resp.getBlob().setName(filename).setContentType(mimeType);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function formatStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function coerceNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return (fallback !== undefined) ? fallback : '';
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback !== undefined ? fallback : '');
}

function createResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
