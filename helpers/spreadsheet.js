// helpers/spreadsheet.js – Google Spreadsheet sebagai sumber data utama
// Tab "todolist" : Nomor | Nama | Deskripsi | Priority | Status | Category | TeamID | created_at
// Tab "grup"     : group_id | group_name | registered_at

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('../config');

let doc = null;

// ─────────────────────────────────────────────────────────────────────────────
//  KONEKSI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inisialisasi koneksi ke Google Spreadsheet dan pastikan header tab sudah ada.
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

  // Pastikan tab "grup" ada
  let grupSheet = doc.sheetsByTitle[config.SHEET_GROUPS];
  if (!grupSheet) {
    grupSheet = await doc.addSheet({
      title: config.SHEET_GROUPS,
      headerValues: ['group_id', 'group_name', 'registered_at'],
    });
    console.log(`[Spreadsheet] Tab "${config.SHEET_GROUPS}" dibuat.`);
  } else {
    try { await grupSheet.loadHeaderRow(); } catch {
      await grupSheet.setHeaderRow(['group_id', 'group_name', 'registered_at']);
    }
  }

  // Pastikan tab "todolist" ada
  let todoSheet = doc.sheetsByTitle[config.SHEET_TODOLIST];
  if (!todoSheet) {
    todoSheet = await doc.addSheet({
      title: config.SHEET_TODOLIST,
      headerValues: ['Nomor', 'Nama', 'Deskripsi', 'Priority', 'Status', 'Category', 'TeamID', 'created_at'],
    });
    console.log(`[Spreadsheet] Tab "${config.SHEET_TODOLIST}" dibuat.`);
  } else {
    try { await todoSheet.loadHeaderRow(); } catch {
      await todoSheet.setHeaderRow(['Nomor', 'Nama', 'Deskripsi', 'Priority', 'Status', 'Category', 'TeamID', 'created_at']);
    }
  }

  return doc;
}

/**
 * Ambil sheet berdasarkan nama tab.
 */
async function getSheet(sheetName) {
  const document = await initSpreadsheet();
  return document.sheetsByTitle[sheetName];
}

// ─────────────────────────────────────────────────────────────────────────────
//  TAB GRUP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ambil semua baris grup.
 */
async function getAllGroups() {
  const sheet = await getSheet(config.SHEET_GROUPS);
  return await sheet.getRows();
}

/**
 * Cari grup berdasarkan group_id.
 * @returns {GoogleSpreadsheetRow|null}
 */
async function getGroupById(groupId) {
  const rows = await getAllGroups();
  return rows.find((r) => r.get('group_id') === groupId) || null;
}

/**
 * Daftarkan grup baru ke Spreadsheet.
 * Jika sudah ada, kembalikan baris yang ada (tidak duplikat).
 */
async function addGroup(groupId, groupName) {
  const existing = await getGroupById(groupId);
  if (existing) return { row: existing, isNew: false };

  const sheet = await getSheet(config.SHEET_GROUPS);
  const now = new Date().toISOString();
  const row = await sheet.addRow({
    group_id: groupId,
    group_name: groupName,
    registered_at: now,
  });
  return { row, isNew: true };
}

/**
 * Hapus grup dari Spreadsheet.
 */
async function removeGroup(groupId) {
  const row = await getGroupById(groupId);
  if (!row) return false;
  await row.delete();
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
//  TAB TODOLIST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ambil semua tugas untuk TeamID tertentu, urut berdasarkan Nomor.
 * @param {string|null} teamId – jika null ambil semua.
 * @returns {Array<{nomor, nama, deskripsi, priority, status, category, teamId, createdAt, _row}>}
 */
async function getTasks(teamId = null) {
  const sheet = await getSheet(config.SHEET_TODOLIST);
  const rows = await sheet.getRows();

  return rows
    .filter((r) => !teamId || r.get('TeamID') === teamId)
    .map((r) => ({
      nomor: Number(r.get('Nomor')),
      nama: r.get('Nama') || '',
      deskripsi: r.get('Deskripsi') || '',
      priority: r.get('Priority') || 'Medium',
      status: r.get('Status') || 'Open',
      category: r.get('Category') || 'Software',
      teamId: r.get('TeamID') || '',
      createdAt: r.get('created_at') || '',
      _row: r,
    }))
    .sort((a, b) => a.nomor - b.nomor);
}

/**
 * Cari satu tugas berdasarkan nomor urut dan teamId.
 */
async function getTaskByNomor(nomor, teamId) {
  const tasks = await getTasks(teamId);
  return tasks.find((t) => t.nomor === Number(nomor)) || null;
}

/**
 * Tambah tugas baru. Nomor ditentukan otomatis (max + 1 dari seluruh tugas di grup).
 */
async function addTask({ teamId, nama, deskripsi, priority, category = 'Software' }) {
  const sheet = await getSheet(config.SHEET_TODOLIST);

  // Hitung nomor urut berikutnya untuk grup ini
  const existing = await getTasks(teamId);
  const nextNomor = existing.length > 0 ? Math.max(...existing.map((t) => t.nomor)) + 1 : 1;

  const now = new Date().toISOString();
  const row = await sheet.addRow({
    Nomor: nextNomor,
    Nama: nama,
    Deskripsi: deskripsi || '-',
    Priority: priority || 'Medium',
    Status: 'Open',
    Category: category,
    TeamID: teamId,
    created_at: now,
  });

  return {
    nomor: nextNomor,
    nama,
    deskripsi,
    priority,
    status: 'Open',
    category,
    teamId,
    createdAt: now,
    _row: row,
  };
}

/**
 * Update satu field tugas (Status, Nama, Deskripsi, Priority, Category).
 * @param {GoogleSpreadsheetRow} row – baris dari getTasks()._row
 * @param {Object} fields – { Nama?, Deskripsi?, Priority?, Status?, Category? }
 */
async function updateTaskFields(row, fields) {
  for (const [key, value] of Object.entries(fields)) {
    row.set(key, value);
  }
  await row.save();
}

/**
 * Hapus tugas (hapus baris dari spreadsheet).
 * @param {GoogleSpreadsheetRow} row
 */
async function deleteTask(row) {
  await row.delete();
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXPORT
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  initSpreadsheet,
  getSheet,
  // Grup
  getAllGroups,
  getGroupById,
  addGroup,
  removeGroup,
  // Tugas
  getTasks,
  getTaskByNomor,
  addTask,
  updateTaskFields,
  deleteTask,
};
