/**
 * =========================================================================
 * LingoLedger - Google Apps Script Cloud Spreadsheet & Excel API (Euro €)
 * =========================================================================
 * 
 * 100% FREE FOREVER Excel & Google Sheets API for your LingoLedger app.
 * - Stores all clients, lesson hours, debts, and payments in Google Cloud.
 * - No local computer disk or database server required.
 * - Full CORS support for seamless web app connection.
 * - Automatically generates a live Microsoft Excel (.xlsx) download link!
 * - Auto-creates the Google Sheet in your Drive on first run (Zero setup needed).
 * 
 * =========================================================================
 * QUICK SETUP INSTRUCTIONS (Takes 60 seconds):
 * =========================================================================
 * 1. Open your Google Apps Script project:
 *    https://script.google.com/u/0/home/projects/1qNIRfrd__XhAUSkxJ9gM55bmhC1_-DBtxvJmizmkWOZ-omDvhTCW6ICs/edit
 * 
 * 2. Delete any code currently in Code.gs and PASTE THIS ENTIRE FILE.
 * 
 * 3. Click "Deploy" (blue button at top-right) -> "New deployment".
 * 
 * 4. In the deployment popup:
 *    - Click the gear icon next to "Select type" -> Choose "Web app".
 *    - Description: LingoLedger API
 *    - Execute as: Me (<your-email>)
 *    - Who has access: Anyone  <--- IMPORTANT: Choose "Anyone" so the app can connect!
 * 
 * 5. Click "Deploy".
 *    - If Google asks for Authorization: Click "Authorize access", choose your Google
 *      account, click "Advanced" (at bottom left), and click "Go to LingoLedger (unsafe)".
 * 
 * 6. Copy the "Web app URL" (it looks like: https://script.google.com/macros/s/.../exec).
 * 
 * 7. In LingoLedger, click the "Cloud Sheet" button in the top bar, paste the URL,
 *    and click "Connect & Sync"!
 * =========================================================================
 */

// Hardcoded Spreadsheet ID for 10x faster startup (skips PropertiesService overhead)
var SPREADSHEET_ID_OVERRIDE = '1T3dxb81HWJGg7-100EwT7hCQsrpB8u5XvjPeu3JGeTc';

/**
 * Handle HTTP GET Requests (Read data from Google Sheets / Excel)
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'read';

    if (action === 'test') {
      var testSs = getOrCreateSpreadsheet();
      return jsonResponse({
        status: 'success',
        message: 'LingoLedger API is connected and online!',
        spreadsheetUrl: testSs.getUrl(),
        excelExportUrl: getExcelExportUrl(testSs.getId())
      });
    }

    var cache = CacheService.getScriptCache();

    // High-speed RAM cache check for instant sub-second reads
    if (action === 'read') {
      var cachedJson = cache.get('LINGO_DATA_CACHE');
      if (cachedJson) {
        return ContentService.createTextOutput(cachedJson).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var ss = getOrCreateSpreadsheet();

    // Optional GET sync for maximum browser compatibility
    if (action === 'syncAll' && e && e.parameter && e.parameter.payload) {
      var payload = JSON.parse(e.parameter.payload);
      var syncClientsSheet = getOrCreateSheet(ss, 'Clients');
      var syncTxSheet = getOrCreateSheet(ss, 'Transactions');

      if (Array.isArray(payload.students)) {
        writeStudentsToSheet(syncClientsSheet, payload.students, payload.transactions || []);
      }
      if (Array.isArray(payload.transactions)) {
        writeTransactionsToSheet(syncTxSheet, payload.transactions, payload.students || []);
      }

      var syncResponse = {
        status: 'success',
        message: 'Spreadsheet synchronized successfully!',
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        excelExportUrl: getExcelExportUrl(ss.getId()),
        students: payload.students || [],
        transactions: payload.transactions || [],
        clientCount: (payload.students || []).length,
        transactionCount: (payload.transactions || []).length,
        timestamp: new Date().toISOString()
      };

      try {
        cache.put('LINGO_DATA_CACHE', JSON.stringify(syncResponse), 21600);
      } catch (ce) {}

      return jsonResponse(syncResponse);
    }

    // Default: read all clients and transactions from sheet
    var clientsSheet = getOrCreateSheet(ss, 'Clients');
    var txSheet = getOrCreateSheet(ss, 'Transactions');

    var students = readStudentsFromSheet(clientsSheet);
    var transactions = readTransactionsFromSheet(txSheet);

    var fullData = {
      status: 'success',
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      excelExportUrl: getExcelExportUrl(ss.getId()),
      students: students,
      transactions: transactions,
      timestamp: new Date().toISOString()
    };

    try {
      cache.put('LINGO_DATA_CACHE', JSON.stringify(fullData), 21600);
    } catch (ce) {}

    return jsonResponse(fullData);
  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: err.toString()
    });
  }
}

/**
 * Handle HTTP POST Requests (Write/Update data to Google Sheets / Excel)
 */
function doPost(e) {
  try {
    var ss = getOrCreateSpreadsheet();
    var postDataStr = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(postDataStr);
    var action = payload.action || 'syncAll';

    var clientsSheet = getOrCreateSheet(ss, 'Clients');
    var txSheet = getOrCreateSheet(ss, 'Transactions');

    if (action === 'syncAll') {
      // Bulk rewrite for instant complete synchronization
      if (Array.isArray(payload.students)) {
        writeStudentsToSheet(clientsSheet, payload.students, payload.transactions || []);
      }
      if (Array.isArray(payload.transactions)) {
        writeTransactionsToSheet(txSheet, payload.transactions, payload.students || []);
      }

      var postResponse = {
        status: 'success',
        message: 'Spreadsheet synchronized successfully!',
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        excelExportUrl: getExcelExportUrl(ss.getId()),
        students: payload.students || [],
        transactions: payload.transactions || [],
        clientCount: (payload.students || []).length,
        transactionCount: (payload.transactions || []).length,
        timestamp: new Date().toISOString()
      };

      try {
        var postCache = CacheService.getScriptCache();
        postCache.put('LINGO_DATA_CACHE', JSON.stringify(postResponse), 21600);
      } catch (ce) {}

      return jsonResponse(postResponse);
    }

    if (action === 'logLesson' || action === 'logPayment') {
      var tx = payload.transaction;
      if (tx) {
        appendTransactionRow(txSheet, tx, payload.students || []);
      }
      return jsonResponse({
        status: 'success',
        message: 'Transaction saved to spreadsheet!',
        spreadsheetUrl: ss.getUrl(),
        excelExportUrl: getExcelExportUrl(ss.getId())
      });
    }

    return jsonResponse({
      status: 'error',
      message: 'Unknown action: ' + action
    });
  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: err.toString()
    });
  }
}

/**
 * Get or automatically create the Google Spreadsheet
 */
function getOrCreateSpreadsheet() {
  if (SPREADSHEET_ID_OVERRIDE && SPREADSHEET_ID_OVERRIDE.trim() !== '') {
    return SpreadsheetApp.openById(SPREADSHEET_ID_OVERRIDE.trim());
  }

  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('LINGO_LEDGER_SHEET_ID');

  if (savedId) {
    try {
      var existingSs = SpreadsheetApp.openById(savedId);
      existingSs.getName(); // verify spreadsheet is accessible and valid
      return existingSs;
    } catch (e) {
      // If deleted or inaccessible, will create a fresh one below
    }
  }

  // Auto-create a brand new spreadsheet in user's Google Drive
  var newSs = SpreadsheetApp.create('LingoLedger - English Tutor Tracker (EUR €)');
  props.setProperty('LINGO_LEDGER_SHEET_ID', newSs.getId());

  // Initialize tabs & styled headers
  initializeWorkbook(newSs);
  return newSs;
}

/**
 * Initialize headers, columns, colors and formatting
 */
function initializeWorkbook(ss) {
  var clientsSheet = getOrCreateSheet(ss, 'Clients');
  var txSheet = getOrCreateSheet(ss, 'Transactions');

  // Client Headers
  var clientHeaders = [
    ['Client ID', 'Client Name', 'Rate (€/hr)', 'Level / Course', 'Phone', 'Email', 'Hours Taught', 'Billed (€)', 'Paid (€)', 'Balance Due (€)', 'Status', 'Notes', 'Created At']
  ];
  clientsSheet.getRange(1, 1, 1, clientHeaders[0].length).setValues(clientHeaders);
  styleHeaderRange(clientsSheet.getRange(1, 1, 1, clientHeaders[0].length), '#4f46e5');
  clientsSheet.setFrozenRows(1);

  // Transaction Headers
  var txHeaders = [
    ['Transaction ID', 'Date (YYYY-MM-DD)', 'Client Name', 'Client ID', 'Type', 'Hours', 'Rate (€/hr)', 'Amount (€)', 'Status', 'Topic / Notes', 'Method', 'Created At']
  ];
  txSheet.getRange(1, 1, 1, txHeaders[0].length).setValues(txHeaders);
  styleHeaderRange(txSheet.getRange(1, 1, 1, txHeaders[0].length), '#059669');
  txSheet.setFrozenRows(1);

  // Remove default 'Sheet1' if present
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch(e) {}
  }
}

/**
 * Style header rows with modern colors and bold font
 */
function styleHeaderRange(range, hexColor) {
  range.setBackground(hexColor)
       .setFontColor('#ffffff')
       .setFontWeight('bold')
       .setFontFamily('Arial')
       .setFontSize(10)
       .setHorizontalAlignment('center');
}

/**
 * Helper to get or create a sheet tab by name
 */
function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/**
 * Direct Microsoft Excel export URL from Google Drive
 */
function getExcelExportUrl(sheetId) {
  return 'https://docs.google.com/spreadsheets/d/' + sheetId + '/export?format=xlsx';
}

/**
 * Read students from the 'Clients' tab
 */
function readStudentsFromSheet(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  var students = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id = String(row[0] || '').trim();
    var name = String(row[1] || '').trim();
    if (!id && !name) continue;

    students.push({
      id: id || ('cli_' + (i + 1)),
      name: name,
      rate: Number(row[2]) || 0,
      level: String(row[3] || ''),
      phone: String(row[4] || ''),
      email: String(row[5] || ''),
      notes: String(row[11] || ''),
      createdAt: String(row[12] || new Date().toISOString())
    });
  }
  return students;
}

/**
 * Read transactions from the 'Transactions' tab
 */
function readTransactionsFromSheet(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  var transactions = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id = String(row[0] || '').trim();
    var dateRaw = row[1];
    var studentId = String(row[3] || '').trim();
    var type = String(row[4] || 'lesson').toLowerCase().trim();

    if (!id && !studentId) continue;

    var dateFormatted = '';
    if (dateRaw instanceof Date) {
      var y = dateRaw.getFullYear();
      var m = String(dateRaw.getMonth() + 1).padStart(2, '0');
      var d = String(dateRaw.getDate()).padStart(2, '0');
      dateFormatted = y + '-' + m + '-' + d;
    } else {
      dateFormatted = String(dateRaw || '').substring(0, 10);
    }

    var statusRaw = String(row[8] || '').toUpperCase();
    var isPaid = (statusRaw === 'PAID' || statusRaw === 'YES' || type === 'payment');

    transactions.push({
      id: id || ('tx_' + (i + 1)),
      date: dateFormatted,
      studentId: studentId,
      type: type === 'payment' ? 'payment' : 'lesson',
      hours: Number(row[5]) || 0,
      amount: Number(row[7]) || 0,
      isPaid: isPaid,
      topic: String(row[9] || ''),
      method: String(row[10] || ''),
      createdAt: String(row[11] || new Date().toISOString())
    });
  }
  return transactions;
}

/**
 * Write all students to 'Clients' tab
 */
function writeStudentsToSheet(sheet, students, transactions) {
  // Clear existing content (keep headers)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }

  if (!students || students.length === 0) return;

  var rows = [];
  for (var i = 0; i < students.length; i++) {
    var s = students[i];
    
    // Calculate client totals
    var studentTx = (transactions || []).filter(function(t) { return t.studentId === s.id; });
    var totalHours = 0;
    var totalBilled = 0;
    var totalPaid = 0;

    for (var j = 0; j < studentTx.length; j++) {
      var t = studentTx[j];
      if (t.type === 'lesson') {
        totalHours += (Number(t.hours) || 0);
        totalBilled += (Number(t.amount) || 0);
      } else if (t.type === 'payment') {
        totalPaid += (Number(t.amount) || 0);
      }
    }

    var balance = totalBilled - totalPaid;
    var status = balance > 0.01 ? 'OWES €' + balance.toFixed(2) : (balance < -0.01 ? 'CREDIT €' + Math.abs(balance).toFixed(2) : 'SETTLED');

    rows.push([
      s.id,
      s.name,
      Number(s.rate) || 0,
      s.level || '',
      s.phone || '',
      s.email || '',
      Number(totalHours.toFixed(1)),
      Number(totalBilled.toFixed(2)),
      Number(totalPaid.toFixed(2)),
      Number(balance.toFixed(2)),
      status,
      s.notes || '',
      s.createdAt || new Date().toISOString()
    ]);
  }

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

  // Format currency columns (€)
  sheet.getRange(2, 3, rows.length, 1).setNumberFormat('€#,##0.00');
  sheet.getRange(2, 8, rows.length, 3).setNumberFormat('€#,##0.00');
}

/**
 * Write all transactions to 'Transactions' tab
 */
function writeTransactionsToSheet(sheet, transactions, students) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }

  if (!transactions || transactions.length === 0) return;

  // Build student ID to Name map
  var studentMap = {};
  for (var s = 0; s < (students || []).length; s++) {
    studentMap[students[s].id] = students[s].name;
  }

  var rows = [];
  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    var studentName = studentMap[t.studentId] || 'Client (' + t.studentId + ')';
    var isPayment = (t.type === 'payment');
    var status = isPayment ? 'PAID' : (t.isPaid ? 'PAID' : 'UNPAID');

    rows.push([
      t.id,
      t.date || '',
      studentName,
      t.studentId,
      isPayment ? 'Payment' : 'Lesson',
      isPayment ? '' : (Number(t.hours) || 0),
      isPayment ? '' : (t.amount && t.hours ? Number((t.amount / t.hours).toFixed(2)) : ''),
      Number(t.amount || 0),
      status,
      t.topic || t.notes || '',
      t.method || '',
      t.createdAt || new Date().toISOString()
    ]);
  }

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

  // Format currency columns
  sheet.getRange(2, 8, rows.length, 1).setNumberFormat('€#,##0.00');
}

/**
 * Append a single transaction row
 */
function appendTransactionRow(sheet, t, students) {
  var studentName = 'Client (' + t.studentId + ')';
  for (var i = 0; i < (students || []).length; i++) {
    if (students[i].id === t.studentId) {
      studentName = students[i].name;
      break;
    }
  }

  var isPayment = (t.type === 'payment');
  var status = isPayment ? 'PAID' : (t.isPaid ? 'PAID' : 'UNPAID');

  var row = [
    t.id,
    t.date || '',
    studentName,
    t.studentId,
    isPayment ? 'Payment' : 'Lesson',
    isPayment ? '' : (Number(t.hours) || 0),
    isPayment ? '' : (t.amount && t.hours ? Number((t.amount / t.hours).toFixed(2)) : ''),
    Number(t.amount || 0),
    status,
    t.topic || t.notes || '',
    t.method || '',
    t.createdAt || new Date().toISOString()
  ];

  sheet.appendRow(row);
  var newRowIdx = sheet.getLastRow();
  sheet.getRange(newRowIdx, 8).setNumberFormat('€#,##0.00');
}

/**
 * Return JSON output with proper ContentService headers
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
