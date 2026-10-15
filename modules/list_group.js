// modules/list_group.js – Modul manajemen grup terhubung ke database Notion
const config = require('../config');
const notionHelper = require('../helpers/notion');

/**
 * Cek apakah grup terdaftar di Notion dan Akses Bot bernilai "Diizinkan"
 */
async function isGroupRegistered(groupId) {
  if (!groupId) return false;
  return await notionHelper.isGroupRegistered(groupId);
}

/**
 * Handle perintah: daftar, hapus, listgrup
 */
async function handleCommand(client, message, chat, chatId, isGroup) {
  const prefix = config.BOT_PREFIX;
  const body = message.body.trim();

  // Hanya izinkan perintah manajemen grup dilakukan oleh akun Bot sendiri
  if (!message.fromMe) {
    return client.sendMessage(
      chatId,
      `⛔ Perintah *${body}* hanya dapat dilakukan oleh Admin Bot (Nomor Bot).`
    );
  }

  const groupId = isGroup ? chatId : null;

  // ---- DAFTAR GRUP ----
  if (body === `${prefix}daftar`) {
    if (!groupId) {
      return client.sendMessage(chatId, '❌ Perintah ini hanya dapat dijalankan di dalam grup WhatsApp.');
    }

    const groupName = chat?.name || 'Grup WhatsApp';

    try {
      const res = await notionHelper.registerGroup(groupId, groupName);

      if (res.status === 'ALREADY_ALLOWED') {
        return client.sendMessage(
          chatId,
          `✅ Grup *${res.groupName}* sudah terdaftar di Notion dengan status *Diizinkan*.`
        );
      }

      if (res.status === 'RE_ENABLED') {
        return client.sendMessage(
          chatId,
          `✅ Akses bot untuk grup *${res.groupName}* berhasil diaktifkan kembali (*Diizinkan*) di Notion!`
        );
      }

      return client.sendMessage(
        chatId,
        `✅ Grup *${res.groupName}* berhasil didaftarkan ke Notion!\n` +
        `Status Akses: *Diizinkan*.\n` +
        `Anggota grup sekarang dapat menggunakan seluruh fitur tugas tim.`
      );
    } catch (err) {
      console.error('[ListGroup] Gagal mendaftarkan grup ke Notion:', err);
      return client.sendMessage(
        chatId,
        `❌ Gagal mendaftarkan grup ke Notion: ${err.message}`
      );
    }
  }

  // ---- HAPUS / CABUT AKSES GRUP ----
  if (body === `${prefix}hapus`) {
    if (!groupId) {
      return client.sendMessage(chatId, '❌ Perintah ini hanya dapat dijalankan di dalam grup WhatsApp.');
    }

    try {
      const res = await notionHelper.revokeGroup(groupId);

      if (res.status === 'NOT_FOUND') {
        return client.sendMessage(chatId, '❌ Grup ini belum terdaftar di database Notion.');
      }

      return client.sendMessage(
        chatId,
        `✅ Akses bot untuk grup ini telah dicabut (Status diubah ke: *Dinonaktifkan*).\n` +
        `💡 Data riwayat grup tetap tersimpan di Notion.`
      );
    } catch (err) {
      console.error('[ListGroup] Gagal mencabut akses grup di Notion:', err);
      return client.sendMessage(
        chatId,
        `❌ Gagal mencabut akses grup di Notion: ${err.message}`
      );
    }
  }

  // ---- LIHAT SEMUA GRUP ----
  if (body === `${prefix}listgrup`) {
    try {
      const groups = await notionHelper.listAllGroups();

      if (!groups.length) {
        return client.sendMessage(chatId, '📋 Belum ada grup yang terdaftar di database Notion.');
      }

      const text = groups
        .map((g, i) => {
          const statusIcon = g.access.toLowerCase() === 'diizinkan' ? '🟢 Diizinkan' : '🔴 Dinonaktifkan';
          return `${i + 1}. *${g.groupName}*\n` +
                 `   ID: \`${g.groupId}\`\n` +
                 `   Akses: ${statusIcon}`;
        })
        .join('\n\n');

      return client.sendMessage(
        chatId,
        `📋 *DAFTAR GRUP DI DATABASE NOTION:*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${text}`
      );
    } catch (err) {
      console.error('[ListGroup] Gagal membaca daftar grup dari Notion:', err);
      return client.sendMessage(
        chatId,
        `❌ Gagal membaca daftar grup dari Notion: ${err.message}`
      );
    }
  }
}

/**
 * Teks bantuan (menu)
 */
function helpText(prefix) {
  return `👑 *KHUSUS BOT (ADMIN)*\n` +
         `*${prefix}daftar* – Daftarkan grup ke Notion (Akses: Diizinkan)\n` +
         `*${prefix}hapus* – Cabut akses grup (Status: Dinonaktifkan)\n` +
         `*${prefix}listgrup* – Lihat seluruh grup terdaftar di Notion`;
}

module.exports = {
  isGroupRegistered,
  handleCommand,
  helpText,
};