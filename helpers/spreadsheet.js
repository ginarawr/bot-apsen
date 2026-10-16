// helpers/spreadsheet.js – Google Spreadsheet sebagai sumber data utama
// Tab "todolist" : Nomor | Nama | Deskripsi | Priority | Status | Category | TeamID | created_at
// Tab "grup"     : group_id | group_name | registered_at

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('../config');

let doc = null;

const HEADERS_GROUPS = ['group_id', 'group_name', 'registered_at'];
const HEADERS_TODOLIST = ['Nomor', 'Nama', 'Deskripsi', 'Priority', 'Status', 'Category', 'TeamID', 'created_at'];

// ─────────────────────────────────────────────────────────────────────────────
//  KONEKSI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cari sheet berdasarkan nama tab.
 * Pencocokan tidak case-sensitive, karena nama tab di Google Sheets sering
 * ditulis berbeda (mis. tab "TodoList" sedangkan config menulis "todolist").
 * @returns {GoogleSpreadsheetWorksheet|null}
 */
function findSheet(document, sheetName) {
  const sheetsByTitle = document.sheetsByTitle || {};
  if (sheetsByTitle[sheetName]) return sheetsByTitle[sheetName];

  const wanted = String(sheetName).toLowerCase();
  return Object.values(sheetsByTitle).find((s) => s.title.toLowerCase() === wanted) || null;
}

/**
 * Sama seperti findSheet, tapi melempar error yang jelas kalau tab tidak ada
 * (dulu mengembalikan undefined sehingga error-nya menyesatkan:
 * "Cannot read properties of undefined (reading 'getRows')").
 */
function resolveSheet(document, sheetName) {
  const sheet = findSheet(document, sheetName);
  if (sheet) return sheet;

  const available = Object.keys(document.sheetsByTitle || {}).map((t) => `"${t}"`).join(', ');
  throw new Error(
    `Tab "${sheetName}" tidak ada di Spreadsheet "${document.title}". ` +
    `Tab yang tersedia: ${available || '(tidak ada)'}. ` +
    `Perbaiki nama tab atau nilai SHEET_* di config.js.`
  );
}

/**
 * Pastikan satu tab ada beserta header-nya (buat kalau belum ada).
 */
async function ensureSheet(document, title, headerValues) {
  const existing = findSheet(document, title);
  if (existing) {
    try {
      await existing.loadHeaderRow();
    } catch {
      await existing.setHeaderRow(headerValues);
    }
    return existing;
  }

  const created = await document.addSheet({ title, headerValues });
  console.log(`[Spreadsheet] Tab "${title}" dibuat.`);
  return created;
}

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

  // Pakai variabel lokal dulu: kalau inisialisasi gagal di tengah jalan,
  // cache `doc` tidak ikut terisi objek setengah jadi (dulu itu membuat semua
  // perintah berikutnya gagal dengan error yang tidak jelas).
  const document = new GoogleSpreadsheet(config.SPREADSHEET_ID, auth);
  await document.loadInfo();
  console.log(`[Spreadsheet] Terhubung ke: ${document.title}`);

  // Pastikan tab "grup" dan "todolist" ada
  await ensureSheet(document, config.SHEET_GROUPS, HEADERS_GROUPS);
  await ensureSheet(document, config.SHEET_TODOLIST, HEADERS_TODOLIST);

  doc = document;
  return doc;
}

/**
 * Ambil sheet berdasarkan nama tab.
 */
async function getSheet(sheetName) {
  const document = await initSpreadsheet();
  return resolveSheet(document, sheetName);
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
