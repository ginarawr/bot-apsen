// todolist.js – modul TodoList dengan nomor urut dinamis dan template singkat
const { getRows, addRow, deleteRow } = require('../helpers/spreadsheet');
const config = require('../config');
const SHEET_TODOLIST = config.SHEET_TODOLIST;

/**
 * Buat format teks daftar task dengan nomor urut dinamis (1, 2, 3...)
 */
function formatTasks(tasks) {
  if (!tasks.length) return '🗒️ Belum ada task di grup ini.';
  return tasks
    .map((t, index) => {
      const obj = t.toObject();
      return `*${index + 1}. ${obj.task_name}*\n` +
             `_Desc_: ${obj.description}\n` +
             `_Prio_: ${obj.priority}\n` +
             `_Status_: ${obj.status || 'open'}`;
    })
    .join('\n\n');
}

/**
 * Template Bantuan
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


/**
 * Handle semua perintah todo
 */
async function handleCommand(client, message, isRegistered, chatId, isGroup) {
  const { body } = message;
  const prefix = config.BOT_PREFIX;
  const groupId = isGroup ? chatId : null;

  if (!isRegistered) {
    return client.sendMessage(chatId, `⚠️ Grup belum terdaftar. Minta Admin Bot untuk mengetik *${prefix}daftar* dulu.`);
  }

  // ---- LIST TASK ----
  if (body === `${prefix}list` || body === `${prefix}task_list`) {
    const rows = await getRows(SHEET_TODOLIST);
    const tasks = rows.filter(r => (r.get('group_id') || r.toObject().group_id) === groupId);
    return client.sendMessage(chatId, `📋 *DAFTAR TASK GRUP*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` + formatTasks(tasks));
  }

  // ---- ADD TASK ----
  if (body.startsWith(`${prefix}add`) || body.startsWith(`${prefix}add_task`)) {
    const cleanBody = body.replace(/^!(add_task|add)\s*/i, '').trim();

    if (!cleanBody || cleanBody.toLowerCase() === 'template' || cleanBody.toLowerCase() === 'help') {
      return client.sendMessage(chatId, getAddTemplate(prefix));
    }

    const args = cleanBody.split('|').map(s => s.trim());
    if (args.length < 3) {
      return client.sendMessage(chatId, `⚠️ Format kurang lengkap.\n\n` + getAddTemplate(prefix));
    }

    const [task_name, description, priority] = args;
    const id = Date.now().toString(36);

    await addRow(SHEET_TODOLIST, {
      id,
      group_id: groupId,
      task_name,
      description,
      priority,
      status: 'open',
      created_at: new Date().toISOString(),
    });

    return client.sendMessage(chatId, `✅ Task *${task_name}* berhasil ditambahkan!`);
  }

  // ---- REMOVE TASK ----
  if (body.startsWith(`${prefix}remove`) || body.startsWith(`${prefix}remove_task`)) {
    const cleanBody = body.replace(/^!(remove_task|remove)\s*/i, '').trim();

    if (!cleanBody || cleanBody.toLowerCase() === 'template' || cleanBody.toLowerCase() === 'help') {
      return client.sendMessage(chatId, getRemoveTemplate(prefix));
    }

    const taskNo = parseInt(cleanBody);
    const rows = await getRows(SHEET_TODOLIST);
    const tasks = rows.filter(r => (r.get('group_id') || r.toObject().group_id) === groupId);

    if (isNaN(taskNo) || taskNo < 1 || taskNo > tasks.length) {
      return client.sendMessage(
        chatId,
        `❌ Nomor task *${cleanBody}* tidak ditemukan.\nKetik *${prefix}list* untuk melihat daftar nomor task.`
      );
    }

    const targetRow = tasks[taskNo - 1];
    const deletedTaskName = targetRow.get('task_name') || targetRow.toObject().task_name;
    await deleteRow(targetRow);

    return client.sendMessage(chatId, `✅ Task ke-${taskNo} (*${deletedTaskName}*) berhasil dihapus.`);
  }

  // ---- EDIT TASK ----
  if (body.startsWith(`${prefix}edit`) || body.startsWith(`${prefix}edit_task`)) {
    const cleanBody = body.replace(/^!(edit_task|edit)\s*/i, '').trim();

    if (!cleanBody || cleanBody.toLowerCase() === 'template' || cleanBody.toLowerCase() === 'help') {
      return client.sendMessage(chatId, getEditTemplate(prefix));
    }

    const parts = cleanBody.split('|').map(s => s.trim());
    if (parts.length < 4) {
      return client.sendMessage(chatId, `⚠️ Format kurang lengkap.\n\n` + getEditTemplate(prefix));
    }

    const [taskNoStr, newName, newDesc, newPrio] = parts;
    const taskNo = parseInt(taskNoStr);
    const rows = await getRows(SHEET_TODOLIST);
    const tasks = rows.filter(r => (r.get('group_id') || r.toObject().group_id) === groupId);

    if (isNaN(taskNo) || taskNo < 1 || taskNo > tasks.length) {
      return client.sendMessage(
        chatId,
        `❌ Nomor task *${taskNoStr}* tidak ditemukan.\nKetik *${prefix}list* untuk melihat daftar nomor task.`
      );
    }

    const targetRow = tasks[taskNo - 1];
    targetRow.set('task_name', newName);
    targetRow.set('description', newDesc);
    targetRow.set('priority', newPrio);
    await targetRow.save();

    return client.sendMessage(chatId, `✅ Task ke-${taskNo} (*${newName}*) berhasil diperbarui!`);
  }
}

/**
 * Teks bantuan (menu)
 */
function helpText(prefix) {
  return `👥 *FITUR ANGGOTA GRUP (TODOLIST)*\n` +
         `*${prefix}list* – Lihat daftar task grup\n` +
         `*${prefix}add nama | deskripsi | priority* – Tambah task\n` +
         `*${prefix}remove nomor* – Hapus task berdasarkan nomor\n` +
         `*${prefix}edit nomor | nama | deskripsi | priority* – Edit task berdasarkan nomor`;
}

module.exports = {
  handleCommand,
  helpText,
};