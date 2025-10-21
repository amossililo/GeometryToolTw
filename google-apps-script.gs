const SHEET_NAME = 'Metrics';
const HEADER_ROW = [
  'Timestamp',
  'Area (numeric)',
  'Area (label)',
  'Area (grid cells)',
  'Wall count',
  'Total wall length (numeric)',
  'Total wall length (label)',
  'Total wall length (grid cells)',
  'Last wall length (numeric)',
  'Last wall length (label)',
  'Unit label',
  'Units per square',
  'Grid spacing (px)'
];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createResponse({
        success: false,
        message: 'No request body found. Ensure the web app is called with a JSON payload.'
      });
    }

    const body = parseRequestBody(e.postData.contents);
    const metrics = normalizeMetrics(body);

    const sheet = getOrCreateSheet();
    ensureHeaderRow(sheet);

    const row = buildRow(metrics);
    sheet.appendRow(row);

    return createResponse({
      success: true,
      message: 'Metrics appended to sheet.',
      rowNumber: sheet.getLastRow(),
      data: metrics
    });
  } catch (error) {
    return createResponse({
      success: false,
      message: error instanceof Error ? error.message : 'Unexpected error while processing request.'
    });
  }
}

function parseRequestBody(contents) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error('Request body was not valid JSON.');
  }
}

function normalizeMetrics(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Request payload must be a JSON object.');
  }

  const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
  const metrics = payload.metrics && typeof payload.metrics === 'object' ? payload.metrics : {};

  return {
    timestamp,
    area: coerceNumber(metrics.area),
    areaLabel: metrics.areaLabel || '',
    areaCells: coerceNumber(metrics.areaCells),
    wallCount: coerceNumber(metrics.wallCount, 0),
    totalWallLength: coerceNumber(metrics.totalWallLength),
    totalWallLengthLabel: metrics.totalWallLengthLabel || '',
    totalWallLengthCells: coerceNumber(metrics.totalWallLengthCells),
    lastWallLength: coerceNumber(metrics.lastWallLength),
    lastWallLengthLabel: metrics.lastWallLengthLabel || '',
    unitLabel: metrics.unitLabel || '',
    unitsPerSquare: coerceNumber(metrics.unitsPerSquare),
    gridSpacing: coerceNumber(metrics.gridSpacing)
  };
}

function buildRow(metrics) {
  return [
    metrics.timestamp,
    metrics.area,
    metrics.areaLabel,
    metrics.areaCells,
    metrics.wallCount,
    metrics.totalWallLength,
    metrics.totalWallLengthLabel,
    metrics.totalWallLengthCells,
    metrics.lastWallLength,
    metrics.lastWallLengthLabel,
    metrics.unitLabel,
    metrics.unitsPerSquare,
    metrics.gridSpacing
  ];
}

function getOrCreateSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const existing = spreadsheet.getSheetByName(SHEET_NAME);
  if (existing) return existing;
  return spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaderRow(sheet) {
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow(HEADER_ROW);
    return;
  }

  const existingHeaders = sheet.getRange(1, 1, 1, HEADER_ROW.length).getValues()[0];
  const headersMatch = existingHeaders.every(function (value, index) {
    return String(value || '').trim() === HEADER_ROW[index];
  });

  if (!headersMatch) {
    sheet.insertRows(1);
    sheet.getRange(1, 1, 1, HEADER_ROW.length).setValues([HEADER_ROW]);
  }
}

function coerceNumber(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback !== undefined ? fallback : '';
  }
  const numberValue = Number(value);
  if (Number.isFinite(numberValue)) {
    return numberValue;
  }
  return fallback !== undefined ? fallback : '';
}

function createResponse(body) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  output.setContent(JSON.stringify(body));
  return output;
}
