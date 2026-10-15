// modules/todolist.js – Modul TodoList & Tracking Progress terintegrasi dengan Notion
const config = require('../config');
const notionHelper = require('../helpers/notion');

/**
 * Format teks daftar tugas berurutan (1, 2, 3...)
 */
function formatTasks(tasks) {
  if (!tasks.length) return '🗒️ Belum ada task di grup ini.';

  return tasks
    .map((t, index) => {
      const isDone = notionHelper.isTaskCompleted(t.status);
      const icon = isDone ? '✅ [SELESAI]' : '⏳ [PENDING]';
      const prioEmoji = getPrioEmoji(t.priority);

      return `*${index + 1}. ${icon} ${t.taskName}*\n` +
             `   _Desc_: ${t.description}\n` +
             `   _Prio_: ${prioEmoji} ${t.priority}\n` +
             `   _Status_: ${t.status}`;
    })
    .join('\n\n');
}

/**
 * Buat visual progress bar
 */
function generateProgressBar(percentage, length = 14) {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Buat laporan progress komprehensif
 */
function formatProgressReport(tasks, groupTitle) {
  const total = tasks.length;
  if (!total) {
    return `📊 *LAPORAN PROGRESS TIM*\n` +
           `━━━━━━━━━━━━━━━━━━━━━━\n` +
           `Grup: *${groupTitle || 'Tim'}*\n\n` +
           `🗒️ Belum ada task yang terdaftar di Notion.\n` +
           `Ketik *${config.BOT_PREFIX}add* untuk menambahkan tugas baru!`;
  }

  const doneTasks = [];
  const pendingTasks = [];

  tasks.forEach((t, i) => {
    const item = { ...t, no: i + 1 };
    if (notionHelper.isTaskCompleted(t.status)) {
      doneTasks.push(item);
    } else {
      pendingTasks.push(item);
    }
  });

  const percent = Math.round((doneTasks.length / total) * 100);
  const bar = generateProgressBar(percent);

  let text = `📊 *LAPORAN PROGRESS TIM*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Grup: *${groupTitle || 'Tim'}*\n`;
  text += `Total Tugas: *${total} Task*\n\n`;
  text += `*Kemajuan Proyek:* ${percent}%\n`;
  text += `[${bar}] (${doneTasks.length}/${total} Selesai)\n\n`;

  if (pendingTasks.length > 0) {
    text += `⏳ *BELUM SELESAI (${pendingTasks.length}):*\n`;
    pendingTasks.forEach((t) => {
      text += `${t.no}. ${getPrioEmoji(t.priority)} *${t.taskName}* — ${t.description}\n`;
    });
    text += `\n`;
  }

  if (doneTasks.length > 0) {
    text += `🎉 *SUDAH SELESAI (${doneTasks.length}):*\n`;
    doneTasks.forEach((t) => {
      text += `~${t.no}. ${t.taskName}~\n`;
    });
    text += `\n`;
  }

  text += `💡 *Ketik:* *${config.BOT_PREFIX}done <nomor>* untuk menandai tugas selesai.`;
  return text;
}

function getPrioEmoji(prio) {
  const p = String(prio).toLowerCase();
  if (p.includes('high') || p.includes('tinggi')) return '🔴';
  if (p.includes('med') || p.includes('sedang')) return '🟡';
  if (p.includes('low') || p.includes('rendah')) return '🟢';
  return '⚪';
}

/**
 * Template bantuan
 */
function getAddTemplate(prefix) {
  return `📝 *TEMPLATE TAMBAH TASK (!add)*\n` +
         `━━━━━━━━━━━━━━━━━━━━━━\n` +
         `Format:\n` +
         `*${prefix}add Nama | Deskripsi | Priority*\n\n` +
         `Contoh:\n` +
         `*${prefix}add Hardware | Implementasi turbidity | tinggi*\n\n` +
         `💡 *Priority:* low / medium / high (atau rendah / sedang / tinggi)`;
}

function getEditTemplate(prefix) {
  return `📝 *TEMPLATE EDIT TASK (!edit)*\n` +
         `━━━━━━━━━━━━━━━━━━━━━━\n` +
         `Format:\n` +
         `*${prefix}edit Nomor | Nama Baru | Deskripsi Baru | Priority*\n\n` +
         `Contoh:\n` +
         `*${prefix}edit 1 | Hardware Turbidity | Implementasi sensor turbidity & kalibrasi | high*\n\n` +
         `💡 *Nomor:* Nomor urut task dari daftar *${prefix}list*`;
}

function getRemoveTemplate(prefix) {
  return `📝 *TEMPLATE HAPUS TASK (!remove)*\n` +
         `━━━━━━━━━━━━━━━━━━━━━━\n` +
         `Format:\n` +
         `*${prefix}remove Nomor*\n\n` +
         `Contoh:\n` +
         `*${prefix}remove 1*\n\n` +
         `💡 *Nomor:* Nomor urut task dari daftar *${prefix}list*`;
}

function getDoneTemplate(prefix) {
  return `📝 *TEMPLATE SELESAI TASK (!done)*\n` +
         `━━━━━━━━━━━━━━━━━━━━━━\n` +
         `Format:\n` +
         `*${prefix}done Nomor*\n\n` +
         `Contoh:\n` +
         `*${prefix}done 1*\n\n` +
         `💡 Ketik *${prefix}undone Nomor* jika ingin mengembalikan task ke status pending.`;
}

/**
 * Handler utama semua perintah TodoList & Tracking
 */
async function handleCommand(client, message, isRegistered, chatId, isGroup) {
  const { body } = message;
  const prefix = config.BOT_PREFIX;
  const groupId = isGroup ? chatId : null;

  if (!isRegistered) {
    return client.sendMessage(
      chatId,
      `⚠️ Grup belum terdaftar atau akses bot dinonaktifkan di Notion.\n` +
      `Minta Admin Bot untuk mengetik *${prefix}daftar* terlebih dahulu.`
    );
  }

  // ---- LIST TASK ----
  if (body === `${prefix}list` || body === `${prefix}task_list`) {
    try {
      const tasks = await notionHelper.getTasksByGroup(groupId);
      return client.sendMessage(
        chatId,
        `📋 *DAFTAR TUGAS TIM (NOTION)*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` + formatTasks(tasks)
      );
    } catch (err) {
      console.error('[TodoList] Error fetching tasks:', err);
      return client.sendMessage(chatId, `❌ Gagal mengambil tugas dari Notion: ${err.message}`);
    }
  }

  // ---- PROGRESS REPORT (!progress atau !q pertanyaan) ----
  if (
    body === `${prefix}progress` ||
    body.toLowerCase().startsWith(`${prefix}q`) ||
    body.toLowerCase() === `${prefix}report`
  ) {
    try {
      const chat = await message.getChat().catch(() => null);
      const groupTitle = chat?.name || 'Grup';
      const tasks = await notionHelper.getTasksByGroup(groupId);
      const report = formatProgressReport(tasks, groupTitle);
      return client.sendMessage(chatId, report);
    } catch (err) {
      console.error('[TodoList] Error generating progress report:', err);
      return client.sendMessage(chatId, `❌ Gagal membuat laporan progress dari Notion: ${err.message}`);
    }
  }

  // ---- DONE TASK ----
  if (body.startsWith(`${prefix}done`) || body.startsWith(`${prefix}complete`)) {
    const cleanBody = body.replace(/^!(done|complete)\s*/i, '').trim();

    if (!cleanBody || cleanBody.toLowerCase() === 'template' || cleanBody.toLowerCase() === 'help') {
      return client.sendMessage(chatId, getDoneTemplate(prefix));
    }

    const taskNo = parseInt(cleanBody);
    try {
      const tasks = await notionHelper.getTasksByGroup(groupId);

      if (isNaN(taskNo) || taskNo < 1 || taskNo > tasks.length) {
        return client.sendMessage(
          chatId,
          `❌ Nomor task *${cleanBody}* tidak ditemukan.\nKetik *${prefix}list* untuk melihat daftar nomor task.`
        );
      }

      const target = tasks[taskNo - 1];
      const newStatus = await notionHelper.updateTaskStatus(target.pageId, true);

      return client.sendMessage(
        chatId,
        `🎉 *Tugas Selesai!*\n` +
        `Task #${taskNo} (*${target.taskName}*) berhasil ditandai sebagai *${newStatus || 'Selesai'}* di Notion. ✅`
      );
    } catch (err) {
      console.error('[TodoList] Error marking task done:', err);
      return client.sendMessage(chatId, `❌ Gagal memperbarui status tugas di Notion: ${err.message}`);
    }
  }

  // ---- UNDONE TASK ----
  if (body.startsWith(`${prefix}undone`) || body.startsWith(`${prefix}incomplete`)) {
    const cleanBody = body.replace(/^!(undone|incomplete)\s*/i, '').trim();

    if (!cleanBody || cleanBody.toLowerCase() === 'template' || cleanBody.toLowerCase() === 'help') {
      return client.sendMessage(chatId, `📝 Contoh format: *${prefix}undone 1*`);
    }

    const taskNo = parseInt(cleanBody);
    try {
      const tasks = await notionHelper.getTasksByGroup(groupId);

      if (isNaN(taskNo) || taskNo < 1 || taskNo > tasks.length) {
        return client.sendMessage(
          chatId,
          `❌ Nomor task *${cleanBody}* tidak ditemukan.\nKetik *${prefix}list* untuk melihat daftar nomor task.`
        );
      }

      const target = tasks[taskNo - 1];
      const newStatus = await notionHelper.updateTaskStatus(target.pageId, false);

      return client.sendMessage(
        chatId,
        `⏳ Task #${taskNo} (*${target.taskName}*) dikembalikan ke status *${newStatus || 'Belum Selesai'}* di Notion.`
      );
    } catch (err) {
      console.error('[TodoList] Error un-marking task done:', err);
      return client.sendMessage(chatId, `❌ Gagal memperbarui status tugas di Notion: ${err.message}`);
    }
  }

  // ---- ADD TASK ----
  if (body.startsWith(`${prefix}add`) || body.startsWith(`${prefix}add_task`)) {
    const cleanBody = body.replace(/^!(add_task|add)\s*/i, '').trim();

    if (!cleanBody || cleanBody.toLowerCase() === 'template' || cleanBody.toLowerCase() === 'help') {
      return client.sendMessage(chatId, getAddTemplate(prefix));
    }

    const args = cleanBody.split('|').map((s) => s.trim());
    if (args.length < 3) {
      return client.sendMessage(chatId, `⚠️ Format kurang lengkap.\n\n` + getAddTemplate(prefix));
    }

    const [taskName, description, priority] = args;

    try {
      await notionHelper.addTask(groupId, taskName, description, priority);
      return client.sendMessage(
        chatId,
        `✅ Task *${taskName}* berhasil ditambahkan ke database Notion!\n` +
        `Prioritas: *${priority}* | Deskripsi: _${description}_`
      );
    } catch (err) {
      console.error('[TodoList] Error adding task to Notion:', err);
      return client.sendMessage(chatId, `❌ Gagal menambahkan tugas ke Notion: ${err.message}`);
    }
  }

  // ---- REMOVE TASK ----
  if (body.startsWith(`${prefix}remove`) || body.startsWith(`${prefix}remove_task`)) {
    const cleanBody = body.replace(/^!(remove_task|remove)\s*/i, '').trim();

    if (!cleanBody || cleanBody.toLowerCase() === 'template' || cleanBody.toLowerCase() === 'help') {
      return client.sendMessage(chatId, getRemoveTemplate(prefix));
    }

    const taskNo = parseInt(cleanBody);
    try {
      const tasks = await notionHelper.getTasksByGroup(groupId);

      if (isNaN(taskNo) || taskNo < 1 || taskNo > tasks.length) {
        return client.sendMessage(
          chatId,
          `❌ Nomor task *${cleanBody}* tidak ditemukan.\nKetik *${prefix}list* untuk melihat daftar nomor task.`
        );
      }

      const target = tasks[taskNo - 1];
      await notionHelper.deleteTask(target.pageId);

      return client.sendMessage(
        chatId,
        `✅ Task #${taskNo} (*${target.taskName}*) berhasil dihapus dari Notion.`
      );
    } catch (err) {
      console.error('[TodoList] Error deleting task from Notion:', err);
      return client.sendMessage(chatId, `❌ Gagal menghapus tugas di Notion: ${err.message}`);
    }
  }

  // ---- EDIT TASK ----
  if (body.startsWith(`${prefix}edit`) || body.startsWith(`${prefix}edit_task`)) {
    const cleanBody = body.replace(/^!(edit_task|edit)\s*/i, '').trim();

    if (!cleanBody || cleanBody.toLowerCase() === 'template' || cleanBody.toLowerCase() === 'help') {
      return client.sendMessage(chatId, getEditTemplate(prefix));
    }

    const parts = cleanBody.split('|').map((s) => s.trim());
    if (parts.length < 4) {
      return client.sendMessage(chatId, `⚠️ Format kurang lengkap.\n\n` + getEditTemplate(prefix));
    }

    const [taskNoStr, newName, newDesc, newPrio] = parts;
    const taskNo = parseInt(taskNoStr);

    try {
      const tasks = await notionHelper.getTasksByGroup(groupId);

      if (isNaN(taskNo) || taskNo < 1 || taskNo > tasks.length) {
        return client.sendMessage(
          chatId,
          `❌ Nomor task *${taskNoStr}* tidak ditemukan.\nKetik *${prefix}list* untuk melihat daftar nomor task.`
        );
      }

      const target = tasks[taskNo - 1];
      await notionHelper.editTask(target.pageId, newName, newDesc, newPrio);

      return client.sendMessage(
        chatId,
        `✅ Task #${taskNo} (*${newName}*) berhasil diperbarui di Notion!`
      );
    } catch (err) {
      console.error('[TodoList] Error editing task in Notion:', err);
      return client.sendMessage(chatId, `❌ Gagal mengedit tugas di Notion: ${err.message}`);
    }
  }
}

/**
 * Teks bantuan (menu)
 */
function helpText(prefix) {
  return `👥 *FITUR ANGGOTA GRUP (TUGAS & PROGRESS NOTION)*\n` +
         `*${prefix}list* – Lihat semua tugas tim di Notion\n` +
         `*${prefix}progress* – Laporan persentase & status kemajuan tim\n` +
         `*${prefix}done nomor* – Tandai tugas sebagai selesai (Done)\n` +
         `*${prefix}undone nomor* – Kembalikan tugas ke pending (Open)\n` +
         `*${prefix}add nama | deskripsi | priority* – Tambah tugas baru ke Notion\n` +
         `*${prefix}edit nomor | nama | deskripsi | priority* – Edit tugas di Notion\n` +
         `*${prefix}remove nomor* – Hapus tugas dari Notion\n` +
         `*${prefix}q <tanya>* – Tanya progress tim (misal: *${prefix}q gimana progress Tim?*)`;
}

module.exports = {
  handleCommand,
  helpText,
  formatTasks,
  formatProgressReport,
};