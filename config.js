require('dotenv').config();

/**
 * Rapikan private key service account.
 * Beberapa cara menjalankan container (mis. `docker run --env-file`) tidak
 * membuang tanda kutip di .env, sehingga key terbaca sebagai
 * '"-----BEGIN PRIVATE KEY-----..."' dan gagal didekripsi OpenSSL.
 */
function normalizePrivateKey(value) {
  if (!value) return value;
  let key = String(value).trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').trim() + '\n';
}

module.exports = {
  // Google Spreadsheet
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,

  // Notion Configuration
  NOTION_API_KEY: process.env.NOTION_API_KEY,
  NOTION_TASKS_DATA_SOURCE_ID: process.env.NOTION_TASKS_DATA_SOURCE_ID || 'd2e258d0-ecc2-4158-ad40-7c51d463ab74',
  NOTION_GROUPS_DATA_SOURCE_ID: process.env.NOTION_GROUPS_DATA_SOURCE_ID || 'e68962d5-053c-4acc-a31f-f90b74a59e59',

  // Bot
  BOT_PREFIX: process.env.BOT_PREFIX || '!',

  // Sheet Names — harus sama dengan nama tab di Spreadsheet Anda
  // (pencocokan tidak case-sensitive, tapi tulis yang persis agar mudah dibaca)
  SHEET_GROUPS: 'grup',       // tab: grup     (kolom: group_id, group_name, registered_at)
  SHEET_TODOLIST: 'TodoList', // tab: TodoList (kolom: Nomor, Nama, Deskripsi, Priority, Status, Category, TeamID, created_at)
};
