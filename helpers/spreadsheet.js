const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('../config');

let doc = null;

/**
 * Inisialisasi koneksi ke Google Spreadsheet
 * dan pastikan sheet yang dibutuhkan sudah ada
 * (kompatibel dengan google-spreadsheet v4+)
 */
async function initSpreadsheet() {
  if (doc) return doc;

  const auth = new JWT({
    email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: config.GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  doc = new GoogleSpreadsheet(config.SPREADSHEET_ID, auth);

  await doc.loadInfo();
  console.log(`[Spreadsheet] Terhubung ke: ${doc.title}`);

  // Pastikan sheet "Groups" ada dan memiliki header
  let groupsSheet = doc.sheetsByTitle[config.SHEET_GROUPS];
  if (!groupsSheet) {
    groupsSheet = await doc.addSheet({
      title: config.SHEET_GROUPS,
      headerValues: ['group_id', 'group_name', 'registered_at'],
    });
    console.log(`[Spreadsheet] Sheet "${config.SHEET_GROUPS}" dibuat.`);
  } else {
    try {
      await groupsSheet.loadHeaderRow();
    } catch (e) {
      await groupsSheet.setHeaderRow(['group_id', 'group_name', 'registered_at']);
      console.log(`[Spreadsheet] Header sheet "${config.SHEET_GROUPS}" diatur.`);
    }
  }

  // Pastikan sheet "TodoList" ada dan memiliki header
  let todoSheet = doc.sheetsByTitle[config.SHEET_TODOLIST];
  if (!todoSheet) {
    todoSheet = await doc.addSheet({
      title: config.SHEET_TODOLIST,
      headerValues: ['id', 'group_id', 'task_name', 'description', 'priority', 'status', 'created_at'],
    });
    console.log(`[Spreadsheet] Sheet "${config.SHEET_TODOLIST}" dibuat.`);
  } else {
    try {
      await todoSheet.loadHeaderRow();
    } catch (e) {
      await todoSheet.setHeaderRow(['id', 'group_id', 'task_name', 'description', 'priority', 'status', 'created_at']);
      console.log(`[Spreadsheet] Header sheet "${config.SHEET_TODOLIST}" diatur.`);
    }
  }

  return doc;
}

/**
 * Mendapatkan sheet berdasarkan nama
 */
async function getSheet(sheetName) {
  const document = await initSpreadsheet();
  return document.sheetsByTitle[sheetName];
}

/**
 * Mendapatkan semua baris dari sheet tertentu
 */
async function getRows(sheetName) {
  const sheet = await getSheet(sheetName);
  return await sheet.getRows();
}

/**
 * Menambahkan baris baru ke sheet
 */
async function addRow(sheetName, rowData) {
  const sheet = await getSheet(sheetName);
  return await sheet.addRow(rowData);
}

/**
 * Menghapus baris tertentu
 */
async function deleteRow(row) {
  await row.delete();
}

/**
 * Generate ID unik sederhana berdasarkan timestamp
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

module.exports = {
  initSpreadsheet,
  getSheet,
  getRows,
  addRow,
  deleteRow,
  generateId,
};
