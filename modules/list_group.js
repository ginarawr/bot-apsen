// modules/list_group.js – Manajemen registrasi grup
// Alur: WA → Spreadsheet (sumber data) → Notion (sync/tampilan)
//
// Perintah (admin only = fromMe):
//   !register | <nama tim>  /  !reg | <nama tim>   – daftar grup ini
//   !hapus                                          – cabut/hapus grup ini
//   !listgrup                                       – lihat semua grup terdaftar

const config = require('../config');
const sheet = require('../helpers/spreadsheet');
const notionHelper = require('../helpers/notion');

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cek apakah grup terdaftar (baca dari Spreadsheet, fallback ke Notion).
 */
async function isGroupRegistered(groupId) {
  if (!groupId) return false;
  try {
    const row = await sheet.getGroupById(groupId);
    return !!row;
  } catch {
    // fallback: cek Notion
    return notionHelper.isGroupRegistered(groupId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HANDLER PERINTAH
// ─────────────────────────────────────────────────────────────────────────────

async function handleCommand(client, message, chat, chatId, isGroup) {
  const prefix = config.BOT_PREFIX;
  const body = message.body.trim();

  // ── Admin check: hanya fromMe (nomor bot) ──
  if (!message.fromMe) {
    return client.sendMessage(
      chatId,
      `⛔ Perintah *${body.split(' ')[0]}* hanya dapat dilakukan oleh Admin Bot (Nomor Bot).`
    );
  }

  const groupId = isGroup ? chatId : null;

  // ── !register | <nama tim>  atau  !reg | <nama tim> ──────────────────────
  const isRegister =
    body.toLowerCase().startsWith(`${prefix}register`) ||
    body.toLowerCase().startsWith(`${prefix}reg`);

  if (isRegister) {
    if (!groupId) {
      return client.sendMessage(chatId, '❌ Perintah ini hanya dapat dijalankan di dalam grup WhatsApp.');
    }

    // Parse nama tim setelah tanda "|"
    const pipeIdx = body.indexOf('|');
    const teamName =
      pipeIdx !== -1
        ? body.slice(pipeIdx + 1).trim()
        : chat?.name || 'Grup WhatsApp';

    if (!teamName) {
      return client.sendMessage(
        chatId,
        `⚠️ Format: *${prefix}register | Nama Tim*\nContoh: *${prefix}register | Tim AI*`
      );
    }

    try {
      // 1️⃣ Simpan/update ke Spreadsheet dulu
      const { isNew } = await sheet.addGroup(groupId, teamName);

      // 2️⃣ Sync ke Notion
      let notionStatus = '';
      try {
        const res = await notionHelper.registerGroup(groupId, teamName);
        notionStatus = res.status;
      } catch (notionErr) {
        console.warn('[ListGroup] Notion sync gagal (data tetap tersimpan di Sheet):', notionErr.message);
      }

      if (!isNew) {
        return client.sendMessage(
          chatId,
          `ℹ️ Grup ini sudah terdaftar sebelumnya.\n` +
          `• Nama Tim: *${teamName}*\n` +
          `• Group ID: \`${groupId}\`\n` +
          `💡 Gunakan *${prefix}hapus* untuk menghapus terlebih dahulu jika ingin ganti nama.`
        );
      }

      return client.sendMessage(
        chatId,
        `✅ Grup berhasil didaftarkan!\n` +
        `• Nama Tim: *${teamName}*\n` +
        `• Group ID: \`${groupId}\`\n` +
        `• Data disimpan di Spreadsheet${notionStatus ? ' & Notion' : ' (Notion: gagal sync)'}.`
      );
    } catch (err) {
      console.error('[ListGroup] Gagal mendaftarkan grup:', err);
      return client.sendMessage(chatId, `❌ Gagal mendaftarkan grup: ${err.message}`);
    }
  }

  // ── !hapus ────────────────────────────────────────────────────────────────
  if (body === `${prefix}hapus`) {
    if (!groupId) {
      return client.sendMessage(chatId, '❌ Perintah ini hanya dapat dijalankan di dalam grup WhatsApp.');
    }

    try {
      // 1️⃣ Hapus dari Spreadsheet
      const deleted = await sheet.removeGroup(groupId);

      // 2️⃣ Cabut akses di Notion
      let notionMsg = '';
      try {
        const res = await notionHelper.revokeGroup(groupId);
        notionMsg = res.status !== 'NOT_FOUND' ? ' & Notion' : '';
      } catch {}

      if (!deleted) {
        return client.sendMessage(chatId, '❌ Grup ini belum terdaftar di Spreadsheet.');
      }

      return client.sendMessage(
        chatId,
        `✅ Grup berhasil dihapus dari Spreadsheet${notionMsg}.\n` +
        `💡 Anggota grup tidak lagi dapat menggunakan fitur bot.`
      );
    } catch (err) {
      console.error('[ListGroup] Gagal menghapus grup:', err);
      return client.sendMessage(chatId, `❌ Gagal menghapus grup: ${err.message}`);
    }
  }

  // ── !listgrup ─────────────────────────────────────────────────────────────
  if (body === `${prefix}listgrup`) {
    try {
      const rows = await sheet.getAllGroups();

      if (!rows.length) {
        return client.sendMessage(chatId, '📋 Belum ada grup yang terdaftar di Spreadsheet.');
      }

      const text = rows
        .map((r, i) => {
          const id = r.get('group_id');
          const name = r.get('group_name');
          const regAt = r.get('registered_at')
            ? new Date(r.get('registered_at')).toLocaleDateString('id-ID')
            : '-';
          return `${i + 1}. *${name}*\n   ID: \`${id}\`\n   Terdaftar: ${regAt}`;
        })
        .join('\n\n');

      return client.sendMessage(
        chatId,
        `📋 *DAFTAR GRUP TERDAFTAR (SPREADSHEET):*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${text}`
      );
    } catch (err) {
      console.error('[ListGroup] Gagal membaca daftar grup:', err);
      return client.sendMessage(chatId, `❌ Gagal membaca daftar grup: ${err.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MENU TEXT
// ─────────────────────────────────────────────────────────────────────────────

function helpText(prefix) {
  return (
    `👑 *KHUSUS BOT (ADMIN)*\n` +
    `*${prefix}register | Nama Tim*  _(alias: ${prefix}reg)_  – Daftarkan grup ini\n` +
    `*${prefix}hapus*  – Hapus/cabut akses grup ini\n` +
    `*${prefix}listgrup*  – Lihat semua grup terdaftar`
  );
}

module.exports = {
  isGroupRegistered,
  handleCommand,
  helpText,
};