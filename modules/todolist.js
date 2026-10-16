// modules/todolist.js – TodoList & Progress terintegrasi Spreadsheet + Notion
// Alur: WA → Spreadsheet (sumber data) → Notion (sync/tampilan)
//
// Perintah anggota:
//   !list  / !l        – Lihat semua tugas tim
//   !progress / !p     – Laporan progress
//   !done <n> / !d <n> – Tandai tugas selesai
//   !undone <n> / !u <n> – Kembalikan ke Open
//   !add <n>|<d>|<p>  / !a   – Tambah tugas baru
//   !edit <n>|<n>|<d>|<p> / !e – Edit tugas
//   !remove <n> / !rm  – Hapus tugas
//   !q <tanya>         – Tanya progress tim

const config = require('../config');
const sheet = require('../helpers/spreadsheet');
const notionHelper = require('../helpers/notion');

// ─────────────────────────────────────────────────────────────────────────────
//  FORMATTING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getPrioEmoji(prio = '') {
  const p = prio.toLowerCase();
  if (p.includes('high') || p.includes('tinggi')) return '🔴';
  if (p.includes('med') || p.includes('sedang')) return '🟡';
  if (p.includes('low') || p.includes('rendah')) return '🟢';
  return '⚪';
}

function isCompleted(status = '') {
  return /done|selesai|completed|finish/i.test(status);
}

function generateProgressBar(percentage, length = 14) {
  const filled = Math.round((percentage / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

/**
 * Format daftar tugas untuk pesan WA.
 */
function formatTasks(tasks) {
  if (!tasks.length) return '🗒️ Belum ada tugas di grup ini.';

  return tasks
    .map((t) => {
      const icon = isCompleted(t.status) ? '✅ [SELESAI]' : '⏳ [PENDING]';
      return (
        `*${t.nomor}. ${icon} ${t.nama}*\n` +
        `   _Desc_: ${t.deskripsi}\n` +
        `   _Prio_: ${getPrioEmoji(t.priority)} ${t.priority}\n` +
        `   _Status_: ${t.status}`
      );
    })
    .join('\n\n');
}

/**
 * Format laporan progress lengkap.
 */
function formatProgressReport(tasks, groupTitle) {
  const prefix = config.BOT_PREFIX;
  if (!tasks.length) {
    return (
      `📊 *LAPORAN PROGRESS TIM*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Grup: *${groupTitle || 'Tim'}*\n\n` +
      `🗒️ Belum ada tugas yang terdaftar.\n` +
      `Ketik *${prefix}add Nama | Deskripsi | Priority* untuk menambahkan tugas!`
    );
  }

  const done = tasks.filter((t) => isCompleted(t.status));
  const pending = tasks.filter((t) => !isCompleted(t.status));
  const percent = Math.round((done.length / tasks.length) * 100);
  const bar = generateProgressBar(percent);

  let text =
    `📊 *LAPORAN PROGRESS TIM*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Grup: *${groupTitle || 'Tim'}*\n` +
    `Total Tugas: *${tasks.length} Task*\n\n` +
    `*Kemajuan:* ${percent}%\n` +
    `[${bar}] (${done.length}/${tasks.length} Selesai)\n\n`;

  if (pending.length) {
    text += `⏳ *BELUM SELESAI (${pending.length}):*\n`;
    pending.forEach((t) => {
      text += `${t.nomor}. ${getPrioEmoji(t.priority)} *${t.nama}* — ${t.deskripsi}\n`;
    });
    text += '\n';
  }

  if (done.length) {
    text += `🎉 *SUDAH SELESAI (${done.length}):*\n`;
    done.forEach((t) => { text += `~${t.nomor}. ${t.nama}~\n`; });
    text += '\n';
  }

  text += `💡 Ketik *${prefix}done <nomor>* untuk menandai tugas selesai.`;
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
//  TEMPLATE TEKS
// ─────────────────────────────────────────────────────────────────────────────

function getAddTemplate(prefix) {
  return (
    `📝 *TEMPLATE TAMBAH TUGAS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Format:\n` +
    `*${prefix}add Nama | Deskripsi | Priority*\n\n` +
    `Contoh:\n` +
    `*${prefix}add Turbidity Sensor | Implementasi sensor turbidity | High*\n\n` +
    `💡 Priority: low / medium / high\n` +
    `💡 Alias singkat: *${prefix}a*`
  );
}

function getEditTemplate(prefix) {
  return (
    `📝 *TEMPLATE EDIT TUGAS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Format:\n` +
    `*${prefix}edit Nomor | Nama Baru | Deskripsi Baru | Priority*\n\n` +
    `Contoh:\n` +
    `*${prefix}edit 1 | Turbidity Sensor | Sensor turbidity + kalibrasi | High*\n\n` +
    `💡 Nomor = nomor dari *${prefix}list*\n` +
    `💡 Alias singkat: *${prefix}e*`
  );
}

function getRemoveTemplate(prefix) {
  return (
    `📝 *TEMPLATE HAPUS TUGAS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Format:\n` +
    `*${prefix}remove Nomor*\n\n` +
    `Contoh:\n` +
    `*${prefix}remove 2*\n\n` +
    `💡 Alias singkat: *${prefix}rm*`
  );
}

function getDoneTemplate(prefix) {
  return (
    `📝 *TEMPLATE TANDAI SELESAI*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Format:\n` +
    `*${prefix}done Nomor*\n\n` +
    `Contoh:\n` +
    `*${prefix}done 1*\n\n` +
    `💡 Alias singkat: *${prefix}d*\n` +
    `💡 Untuk mengembalikan: *${prefix}undone Nomor*  (alias: *${prefix}u*)`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SYNC HELPER – perbarui Notion setelah perubahan di Sheet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync satu tugas dari spreadsheet ke Notion.
 * Tidak melempar error jika Notion gagal agar operasi sheet tetap berhasil.
 */
async function syncTaskToNotion(task, groupId) {
  try {
    // Cek apakah sudah ada di Notion berdasarkan nama tugas + groupId
    const existingTasks = await notionHelper.getTasksByGroup(groupId);
    const matched = existingTasks.find(
      (t) => t.taskName.toLowerCase() === task.nama.toLowerCase()
    );

    if (matched) {
      await notionHelper.editTask(matched.pageId, task.nama, task.deskripsi, task.priority);
      if (task.status) {
        await notionHelper.updateTaskStatus(matched.pageId, isCompleted(task.status));
      }
    } else {
      await notionHelper.addTask(groupId, task.nama, task.deskripsi, task.priority);
    }
  } catch (err) {
    console.warn('[TodoList] Notion sync warning (data Sheet sudah tersimpan):', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMMAND HANDLER UTAMA
// ─────────────────────────────────────────────────────────────────────────────

async function handleCommand(client, message, isRegistered, chatId, isGroup) {
  const body = message.body.trim();
  const prefix = config.BOT_PREFIX;
  const groupId = isGroup ? chatId : null;

  // Blokir jika grup belum terdaftar
  if (!isRegistered) {
    return client.sendMessage(
      chatId,
      `⚠️ Grup belum terdaftar atau akses bot dinonaktifkan.\n` +
      `Minta Admin Bot untuk mengetik *${prefix}register | Nama Tim* terlebih dahulu.`
    );
  }

  // ── Helper: normalisasi command (hapus prefix + cmd, ambil sisa) ──────────
  const parseArgs = (aliases) => {
    const regex = new RegExp(`^\\${prefix}(${aliases.join('|')})\\s*`, 'i');
    return body.replace(regex, '').trim();
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  !list / !l
  // ─────────────────────────────────────────────────────────────────────────
  if (/^![l]$|^!list$/i.test(body) || body === `${prefix}list` || body === `${prefix}l`) {
    try {
      const tasks = await sheet.getTasks(groupId);
      return client.sendMessage(
        chatId,
        `📋 *DAFTAR TUGAS TIM*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` + formatTasks(tasks)
      );
    } catch (err) {
      console.error('[TodoList] Error list:', err);
      return client.sendMessage(chatId, `❌ Gagal mengambil tugas: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  !progress / !p  /  !report  /  !q <tanya>
  // ─────────────────────────────────────────────────────────────────────────
  const isProgress =
    body === `${prefix}progress` ||
    body === `${prefix}p` ||
    body === `${prefix}report` ||
    body.toLowerCase().startsWith(`${prefix}q`);

  if (isProgress) {
    try {
      const chat = await message.getChat().catch(() => null);
      const groupTitle = chat?.name || 'Tim';
      const tasks = await sheet.getTasks(groupId);
      return client.sendMessage(chatId, formatProgressReport(tasks, groupTitle));
    } catch (err) {
      console.error('[TodoList] Error progress:', err);
      return client.sendMessage(chatId, `❌ Gagal membuat laporan: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  !done <nomor> / !d <nomor>
  // ─────────────────────────────────────────────────────────────────────────
  const isDoneCmd =
    body.startsWith(`${prefix}done`) || body.startsWith(`${prefix}complete`) ||
    new RegExp(`^\\${prefix}d\\s+\\d`, 'i').test(body);

  if (isDoneCmd) {
    const arg = parseArgs(['done', 'complete', 'd']).toLowerCase();
    if (!arg || arg === 'template' || arg === 'help') {
      return client.sendMessage(chatId, getDoneTemplate(prefix));
    }

    const taskNo = parseInt(arg);
    try {
      const target = await sheet.getTaskByNomor(taskNo, groupId);
      if (!target) {
        return client.sendMessage(
          chatId,
          `❌ Tugas nomor *${taskNo}* tidak ditemukan.\nKetik *${prefix}list* untuk melihat daftar nomor.`
        );
      }

      if (isCompleted(target.status)) {
        return client.sendMessage(chatId, `ℹ️ Tugas #${taskNo} (*${target.nama}*) sudah berstatus *${target.status}*.`);
      }

      // 1️⃣ Update Sheet
      await sheet.updateTaskFields(target._row, { Status: 'Done' });

      // 2️⃣ Sync Notion (non-blocking)
      notionHelper.getTasksByGroup(groupId).then(async (tasks) => {
        const n = tasks.find((t) => t.taskName.toLowerCase() === target.nama.toLowerCase());
        if (n) await notionHelper.updateTaskStatus(n.pageId, true).catch(() => {});
      }).catch(() => {});

      return client.sendMessage(
        chatId,
        `🎉 *Tugas Selesai!*\n` +
        `Task #${taskNo} (*${target.nama}*) ditandai sebagai *Done*. ✅`
      );
    } catch (err) {
      console.error('[TodoList] Error done:', err);
      return client.sendMessage(chatId, `❌ Gagal memperbarui status: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  !undone <nomor> / !u <nomor>
  // ─────────────────────────────────────────────────────────────────────────
  const isUndoneCmd =
    body.startsWith(`${prefix}undone`) || body.startsWith(`${prefix}incomplete`) ||
    new RegExp(`^\\${prefix}u\\s+\\d`, 'i').test(body);

  if (isUndoneCmd) {
    const arg = parseArgs(['undone', 'incomplete', 'u']).toLowerCase();
    if (!arg || arg === 'template' || arg === 'help') {
      return client.sendMessage(chatId, `📝 Contoh format: *${prefix}undone 1*  (alias: *${prefix}u 1*)`);
    }

    const taskNo = parseInt(arg);
    try {
      const target = await sheet.getTaskByNomor(taskNo, groupId);
      if (!target) {
        return client.sendMessage(
          chatId,
          `❌ Tugas nomor *${taskNo}* tidak ditemukan.\nKetik *${prefix}list* untuk melihat daftar nomor.`
        );
      }

      // 1️⃣ Update Sheet
      await sheet.updateTaskFields(target._row, { Status: 'Open' });

      // 2️⃣ Sync Notion (non-blocking)
      notionHelper.getTasksByGroup(groupId).then(async (tasks) => {
        const n = tasks.find((t) => t.taskName.toLowerCase() === target.nama.toLowerCase());
        if (n) await notionHelper.updateTaskStatus(n.pageId, false).catch(() => {});
      }).catch(() => {});

      return client.sendMessage(
        chatId,
        `⏳ Task #${taskNo} (*${target.nama}*) dikembalikan ke status *Open*.`
      );
    } catch (err) {
      console.error('[TodoList] Error undone:', err);
      return client.sendMessage(chatId, `❌ Gagal memperbarui status: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  !add <nama> | <deskripsi> | <priority>  / !a
  // ─────────────────────────────────────────────────────────────────────────
  const isAddCmd =
    body.startsWith(`${prefix}add`) || body.startsWith(`${prefix}add_task`) ||
    new RegExp(`^\\${prefix}a\\s`, 'i').test(body);

  if (isAddCmd) {
    const arg = parseArgs(['add_task', 'add', 'a']);
    if (!arg || arg.toLowerCase() === 'template' || arg.toLowerCase() === 'help') {
      return client.sendMessage(chatId, getAddTemplate(prefix));
    }

    const parts = arg.split('|').map((s) => s.trim());
    if (parts.length < 3) {
      return client.sendMessage(chatId, `⚠️ Format kurang lengkap.\n\n` + getAddTemplate(prefix));
    }

    const [nama, deskripsi, priority] = parts;

    try {
      // 1️⃣ Simpan ke Spreadsheet
      const newTask = await sheet.addTask({ teamId: groupId, nama, deskripsi, priority });

      // 2️⃣ Sync ke Notion (non-blocking)
      notionHelper.addTask(groupId, nama, deskripsi, priority).catch((e) =>
        console.warn('[TodoList] Notion add sync:', e.message)
      );

      return client.sendMessage(
        chatId,
        `✅ Tugas berhasil ditambahkan!\n` +
        `• No: *${newTask.nomor}*\n` +
        `• Nama: *${nama}*\n` +
        `• Deskripsi: _${deskripsi}_\n` +
        `• Priority: ${getPrioEmoji(priority)} *${priority}*\n` +
        `• Status: *Open*`
      );
    } catch (err) {
      console.error('[TodoList] Error add:', err);
      return client.sendMessage(chatId, `❌ Gagal menambahkan tugas: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  !remove <nomor> / !rm <nomor>
  // ─────────────────────────────────────────────────────────────────────────
  const isRemoveCmd =
    body.startsWith(`${prefix}remove`) || body.startsWith(`${prefix}remove_task`) ||
    new RegExp(`^\\${prefix}rm\\s`, 'i').test(body);

  if (isRemoveCmd) {
    const arg = parseArgs(['remove_task', 'remove', 'rm']);
    if (!arg || arg.toLowerCase() === 'template' || arg.toLowerCase() === 'help') {
      return client.sendMessage(chatId, getRemoveTemplate(prefix));
    }

    const taskNo = parseInt(arg);
    try {
      const target = await sheet.getTaskByNomor(taskNo, groupId);
      if (!target) {
        return client.sendMessage(
          chatId,
          `❌ Tugas nomor *${taskNo}* tidak ditemukan.\nKetik *${prefix}list* untuk melihat daftar nomor.`
        );
      }

      const taskName = target.nama;

      // 1️⃣ Hapus dari Spreadsheet
      await sheet.deleteTask(target._row);

      // 2️⃣ Archive di Notion (non-blocking)
      notionHelper.getTasksByGroup(groupId).then(async (tasks) => {
        const n = tasks.find((t) => t.taskName.toLowerCase() === taskName.toLowerCase());
        if (n) await notionHelper.deleteTask(n.pageId).catch(() => {});
      }).catch(() => {});

      return client.sendMessage(
        chatId,
        `✅ Task #${taskNo} (*${taskName}*) berhasil dihapus dari Spreadsheet.`
      );
    } catch (err) {
      console.error('[TodoList] Error remove:', err);
      return client.sendMessage(chatId, `❌ Gagal menghapus tugas: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  !edit <nomor> | <nama> | <deskripsi> | <priority>  / !e
  // ─────────────────────────────────────────────────────────────────────────
  const isEditCmd =
    body.startsWith(`${prefix}edit`) || body.startsWith(`${prefix}edit_task`) ||
    new RegExp(`^\\${prefix}e\\s`, 'i').test(body);

  if (isEditCmd) {
    const arg = parseArgs(['edit_task', 'edit', 'e']);
    if (!arg || arg.toLowerCase() === 'template' || arg.toLowerCase() === 'help') {
      return client.sendMessage(chatId, getEditTemplate(prefix));
    }

    const parts = arg.split('|').map((s) => s.trim());
    if (parts.length < 4) {
      return client.sendMessage(chatId, `⚠️ Format kurang lengkap.\n\n` + getEditTemplate(prefix));
    }

    const [taskNoStr, newNama, newDesc, newPrio] = parts;
    const taskNo = parseInt(taskNoStr);

    try {
      const target = await sheet.getTaskByNomor(taskNo, groupId);
      if (!target) {
        return client.sendMessage(
          chatId,
          `❌ Tugas nomor *${taskNo}* tidak ditemukan.\nKetik *${prefix}list* untuk melihat daftar nomor.`
        );
      }

      // 1️⃣ Update Spreadsheet
      await sheet.updateTaskFields(target._row, {
        Nama: newNama,
        Deskripsi: newDesc,
        Priority: newPrio,
      });

      // 2️⃣ Sync ke Notion (non-blocking)
      notionHelper.getTasksByGroup(groupId).then(async (tasks) => {
        const n = tasks.find((t) => t.taskName.toLowerCase() === target.nama.toLowerCase());
        if (n) await notionHelper.editTask(n.pageId, newNama, newDesc, newPrio).catch(() => {});
      }).catch(() => {});

      return client.sendMessage(
        chatId,
        `✅ Task #${taskNo} berhasil diperbarui!\n` +
        `• Nama: *${newNama}*\n` +
        `• Deskripsi: _${newDesc}_\n` +
        `• Priority: ${getPrioEmoji(newPrio)} *${newPrio}*`
      );
    } catch (err) {
      console.error('[TodoList] Error edit:', err);
      return client.sendMessage(chatId, `❌ Gagal mengedit tugas: ${err.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MENU TEXT
// ─────────────────────────────────────────────────────────────────────────────

function helpText(prefix) {
  return (
    `👥 *FITUR ANGGOTA GRUP (TUGAS & PROGRESS)*\n` +
    `*${prefix}list*  _(${prefix}l)_  – Lihat semua tugas tim\n` +
    `*${prefix}progress*  _(${prefix}p)_  – Laporan persentase & kemajuan tim\n` +
    `*${prefix}done <no>*  _(${prefix}d)_  – Tandai tugas selesai\n` +
    `*${prefix}undone <no>*  _(${prefix}u)_  – Kembalikan tugas ke Open\n` +
    `*${prefix}add <nama>|<desk>|<prio>*  _(${prefix}a)_  – Tambah tugas baru\n` +
    `*${prefix}edit <no>|<nama>|<desk>|<prio>*  _(${prefix}e)_  – Edit tugas\n` +
    `*${prefix}remove <no>*  _(${prefix}rm)_  – Hapus tugas\n` +
    `*${prefix}q <tanya>*  – Tanya progress tim\n\n` +
    `💡 Ketik perintah tanpa argumen untuk melihat template lengkap.\n` +
    `   Contoh: *${prefix}add template*`
  );
}

module.exports = {
  handleCommand,
  helpText,
  formatTasks,
  formatProgressReport,
};