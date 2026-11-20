// An in-memory Google spreadsheet that answers the subset of the Sheets API v4 the app uses,
// the way the real API does (A1 ranges, trimmed empty cells, atomic batchUpdate).
// It knows nothing about budgets; tests/support/budget.js describes the budget layout.

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const colToIndex = (letters) => [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const indexToCol = (i) => { let s = ''; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
const isEmpty = (v) => v === undefined || v === null || v === '';

class Tab {
  constructor(title, sheetId) { this.title = title; this.sheetId = sheetId; this.rows = []; }
  get(r, c) { const row = this.rows[r]; return row ? row[c] : undefined; }
  set(r, c, v) { while (this.rows.length <= r) this.rows.push([]); this.rows[r][c] = v; }
  /** Number of rows up to the last one that has any value. */
  get usedRows() { for (let r = this.rows.length - 1; r >= 0; r--) if ((this.rows[r] || []).some((v) => !isEmpty(v))) return r + 1; return 0; }
  get usedCols() { return Math.max(0, ...this.rows.map((row) => { const row2 = row || []; for (let c = row2.length - 1; c >= 0; c--) if (!isEmpty(row2[c])) return c + 1; return 0; })); }
  clone() { const t = new Tab(this.title, this.sheetId); t.rows = this.rows.map((r) => (r ? r.slice() : [])); return t; }
}

class Spreadsheet {
  constructor(id, title) {
    this.id = id; this.title = title; this.tabs = []; this.nextSheetId = 100;
  }

  addTab(title) { const t = new Tab(title, this.nextSheetId++); this.tabs.push(t); return t; }
  tab(title) { const t = this.tabs.find((x) => x.title === title); if (!t) throw new ApiError(400, 'Unable to parse range: ' + title); return t; }
  tabById(sheetId) { const t = this.tabs.find((x) => x.sheetId === sheetId); if (!t) throw new ApiError(400, 'No grid with id: ' + sheetId); return t; }

  /** Parses 'Tab!A2:F', 'Tab!A:A', 'Tab!B5' into a tab and 0-based bounds (end exclusive, null = open). */
  parseRange(a1) {
    const bang = a1.lastIndexOf('!');
    if (bang < 0) throw new ApiError(400, 'Unable to parse range: ' + a1);
    let title = a1.slice(0, bang); const cells = a1.slice(bang + 1);
    if (title.startsWith("'") && title.endsWith("'")) title = title.slice(1, -1).replace(/''/g, "'");
    const tab = this.tab(title);
    const m = /^([A-Z]+)?(\d+)?(?::([A-Z]+)?(\d+)?)?$/i.exec(cells);
    if (!m) throw new ApiError(400, 'Unable to parse range: ' + a1);
    const [, c1, r1, c2, r2] = m;
    const single = !cells.includes(':');
    return {
      tab,
      startCol: c1 ? colToIndex(c1) : 0,
      startRow: r1 ? Number(r1) - 1 : 0,
      endCol: single ? (c1 ? colToIndex(c1) + 1 : null) : (c2 ? colToIndex(c2) + 1 : null),
      endRow: single ? (r1 ? Number(r1) : null) : (r2 ? Number(r2) : null),
    };
  }

  /** values.get / batchGet: rows of values with trailing empty cells and rows left out. */
  read(a1) {
    const { tab, startRow, startCol, endRow, endCol } = this.parseRange(a1);
    const lastRow = endRow == null ? tab.usedRows : Math.min(endRow, tab.usedRows);
    const lastCol = endCol == null ? tab.usedCols : endCol;
    const out = [];
    for (let r = startRow; r < lastRow; r++) {
      const row = [];
      for (let c = startCol; c < lastCol; c++) row.push(tab.get(r, c));
      while (row.length && isEmpty(row[row.length - 1])) row.pop();
      out.push(row.map((v) => (isEmpty(v) ? '' : v)));
    }
    while (out.length && !out[out.length - 1].length) out.pop();
    return out;
  }

  /** values.update with valueInputOption=RAW. */
  write(a1, values) {
    const { tab, startRow, startCol } = this.parseRange(a1);
    values.forEach((row, i) => row.forEach((v, j) => tab.set(startRow + i, startCol + j, v)));
    return { updatedRange: a1, updatedRows: values.length, updatedCells: values.reduce((n, r) => n + r.length, 0) };
  }

  /** spreadsheets.batchUpdate: all requests apply, or none do. */
  batchUpdate(requests) {
    const backup = this.tabs.map((t) => t.clone());
    try {
      return { replies: requests.map((req) => this.applyRequest(req)) };
    } catch (e) {
      this.tabs = backup;
      throw e;
    }
  }

  applyRequest(req) {
    const [kind] = Object.keys(req);
    const body = req[kind];
    switch (kind) {
      case 'insertRange': {
        if (body.shiftDimension !== 'ROWS') throw new ApiError(400, 'fake: only ROWS shifting is supported');
        const g = body.range; const tab = this.tabById(g.sheetId);
        const n = g.endRowIndex - g.startRowIndex;
        const c0 = g.startColumnIndex || 0; const c1 = g.endColumnIndex == null ? Math.max(tab.usedCols, c0) : g.endColumnIndex;
        for (let c = c0; c < c1; c++) {
          for (let r = tab.usedRows - 1; r >= g.startRowIndex; r--) tab.set(r + n, c, tab.get(r, c));
          for (let r = g.startRowIndex; r < g.endRowIndex; r++) tab.set(r, c, undefined);
        }
        return {};
      }
      case 'copyPaste': {
        // Formats are not modelled; check the ranges are valid and move on.
        this.tabById(body.source.sheetId); this.tabById(body.destination.sheetId);
        if (body.pasteType !== 'PASTE_FORMAT') throw new ApiError(400, 'fake: only PASTE_FORMAT is supported');
        return {};
      }
      case 'updateCells': {
        if (!body.start) throw new ApiError(400, 'fake: updateCells needs start');
        const tab = this.tabById(body.start.sheetId);
        body.rows.forEach((row, i) => (row.values || []).forEach((cell, j) => {
          const v = cell.userEnteredValue || {};
          const value = 'numberValue' in v ? v.numberValue : 'boolValue' in v ? v.boolValue : 'stringValue' in v ? v.stringValue : undefined;
          tab.set(body.start.rowIndex + i, (body.start.columnIndex || 0) + j, value);
        }));
        return {};
      }
      case 'deleteDimension': {
        const g = body.range; const tab = this.tabById(g.sheetId);
        if (g.dimension !== 'ROWS') throw new ApiError(400, 'fake: only ROWS deletion is supported');
        tab.rows.splice(g.startIndex, g.endIndex - g.startIndex);
        return {};
      }
      default:
        throw new ApiError(400, 'fake: unsupported batchUpdate request ' + kind);
    }
  }

  metadata() {
    return { spreadsheetId: this.id, properties: { title: this.title }, sheets: this.tabs.map((t) => ({ properties: { sheetId: t.sheetId, title: t.title } })) };
  }

  copy(id, title) {
    const s = new Spreadsheet(id, title);
    s.tabs = this.tabs.map((t) => t.clone()); s.nextSheetId = this.nextSheetId;
    return s;
  }
}

module.exports = { Spreadsheet, Tab, ApiError, colToIndex, indexToCol };
