// list_group.js  –  menggunakan client dari whatsapp-web.js
const { getRows, addRow, deleteRow } = require('../helpers/spreadsheet');
const config = require('../config');
const SHEET_GROUPS = config.SHEET_GROUPS;

/**
 * Cek apakah grup terdaftar di sheet "Groups"
 */
async function isGroupRegistered(groupId) {
  const rows = await getRows(SHEET_GROUPS);
  return rows.some(r => (r.get('group_id') || r.toObject().group_id) === groupId);
}

/**
 * Handle perintah: daftar, hapus, listgrup
 */
async function handleCommand(client, message, chat, chatId, isGroup) {
  // Hanya izinkan perintah manajemen grup dilakukan oleh akun Bot sendiri
  if (!message.fromMe) {
    return client.sendMessage(
      chatId,
      `⛔ Perintah *${message.body.trim()}* hanya dapat dilakukan oleh Admin Bot (Nomor Bot).`
    );
  }

  const body = message.body.trim();
  const groupId = isGroup ? chatId : null;

  if (body === `${config.BOT_PREFIX}daftar`) {
    if (!groupId) return client.sendMessage(chatId, '❌ Perintah ini hanya untuk grup.');
    if (await isGroupRegistered(groupId))
      return client.sendMessage(chatId, '✅ Grup sudah terdaftar.');
    
    const groupName = chat?.name || 'Grup WhatsApp';

    await addRow(SHEET_GROUPS, {
      group_id: groupId,
      group_name: groupName,
      registered_at: new Date().toISOString(),
    });
    return client.sendMessage(chatId, '✅ Grup berhasil didaftarkan.');
  }

  if (body === `${config.BOT_PREFIX}hapus`) {
    if (!groupId) return client.sendMessage(chatId, '❌ Perintah ini hanya untuk grup.');
    const rows = await getRows(SHEET_GROUPS);
    const row = rows.find((r) => (r.get('group_id') || r.toObject().group_id) === groupId);
    if (!row) return client.sendMessage(chatId, '❌ Grup belum terdaftar.');
    await deleteRow(row);
    return client.sendMessage(chatId, '✅ Grup berhasil dihapus dari daftar.');
  }

  if (body === `${config.BOT_PREFIX}listgrup`) {
    const rows = await getRows(SHEET_GROUPS);
    if (!rows.length) return client.sendMessage(chatId, '📋 Belum ada grup yang terdaftar.');
    const text = rows
      .filter(r => r.get('group_id') || r.toObject().group_id)
      .map((r, i) => {
        const obj = r.toObject();
        return `${i + 1}. *${obj.group_name || 'Grup'}* (${obj.group_id})`;
      })
      .join('\n');
    return client.sendMessage(chatId, `📋 *Daftar Grup Terdaftar:*\n\n${text}`);
  }
}

/**
 * Teks bantuan (menu)
 */
function helpText(prefix) {
  return `👑 *KHUSUS BOT (ADMIN)*\n` +
         `*${prefix}daftar* – Daftarkan grup ke sistem bot\n` +
         `*${prefix}hapus* – Hapus grup dari daftar terdaftar\n` +
         `*${prefix}listgrup* – Lihat daftar seluruh grup terdaftar`;
}

module.exports = {
  isGroupRegistered,
  handleCommand,
  helpText,
};