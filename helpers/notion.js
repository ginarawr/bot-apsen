// helpers/notion.js – Integrasi Database Notion (Grup & Tugas Tim)
const { Client } = require('@notionhq/client');
const config = require('../config');

let notionClient = null;
const schemaCache = {};

/**
 * Inisialisasi client Notion
 */
function getNotionClient() {
  if (!config.NOTION_API_KEY || config.NOTION_API_KEY === 'token_koneksi_internal') {
    throw new Error(
      'NOTION_API_KEY belum disetel di file .env. Silakan masukkan token integrasi internal Notion Anda.'
    );
  }
  if (!notionClient) {
    notionClient = new Client({ auth: config.NOTION_API_KEY });
  }
  return notionClient;
}

/**
 * Ambil schema properties database (dicache dalam memory)
 */
async function getDatabaseSchema(databaseId) {
  if (!databaseId) throw new Error('Database ID tidak boleh kosong.');
  if (schemaCache[databaseId]) return schemaCache[databaseId];

  const notion = getNotionClient();
  const db = await notion.databases.retrieve({ database_id: databaseId });
  schemaCache[databaseId] = db.properties;
  return db.properties;
}

/**
 * Cari nama property berdasarkan regex atau tipe
 */
function findPropKey(properties, regexPatterns, preferredType = null) {
  const entries = Object.entries(properties);
  
  // 1. Coba cocokkan dengan regex
  for (const pattern of regexPatterns) {
    const found = entries.find(([name]) => pattern.test(name));
    if (found) return found[0];
  }

  // 2. Jika ada preferredType, cari yang sesuai
  if (preferredType) {
    const found = entries.find(([, meta]) => meta.type === preferredType);
    if (found) return found[0];
  }

  return null;
}

/**
 * Format payload property untuk pembuatan/update halaman Notion
 */
function formatPropPayload(propMeta, value) {
  if (!propMeta || value === undefined || value === null) return null;
  const strVal = String(value).trim();

  switch (propMeta.type) {
    case 'title':
      return { title: [{ text: { content: strVal } }] };

    case 'rich_text':
      return { rich_text: [{ text: { content: strVal } }] };

    case 'select': {
      const options = propMeta.select?.options || [];
      const matched = options.find((o) => o.name.toLowerCase() === strVal.toLowerCase());
      return { select: { name: matched ? matched.name : strVal } };
    }

    case 'status': {
      const options = propMeta.status?.options || [];
      const matched = options.find((o) => o.name.toLowerCase() === strVal.toLowerCase());
      return { status: { name: matched ? matched.name : strVal } };
    }

    default:
      return null;
  }
}

/**
 * Ekstrak nilai plain text dari property halaman Notion
 */
function extractPropValue(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':
      return prop.title?.map((t) => t.plain_text).join('') || '';
    case 'rich_text':
      return prop.rich_text?.map((t) => t.plain_text).join('') || '';
    case 'select':
      return prop.select?.name || '';
    case 'status':
      return prop.status?.name || '';
    case 'date':
      return prop.date?.start || '';
    case 'number':
      return prop.number !== null && prop.number !== undefined ? String(prop.number) : '';
    case 'checkbox':
      return prop.checkbox ? 'true' : 'false';
    default:
      return '';
  }
}

/**
 * Ubah object halaman Notion menjadi record sederhana
 */
function pageToRecord(page) {
  const record = { id: page.id, _page: page };
  for (const [key, prop] of Object.entries(page.properties)) {
    record[key] = extractPropValue(prop);
  }
  return record;
}

// ==================================================================
//  OPERASI DATABASE GRUP (NOTION_GROUPS_DATA_SOURCE_ID)
// ==================================================================

/**
 * Query semua grup dari database Notion
 */
async function queryGroups() {
  const notion = getNotionClient();
  const dbId = config.NOTION_GROUPS_DATA_SOURCE_ID;
  const schema = await getDatabaseSchema(dbId);

  const response = await notion.databases.query({
    database_id: dbId,
  });

  const idKey = findPropKey(schema, [/id.*grup/i, /group.*id/i, /whatsapp/i], 'rich_text') || 'ID Grup WhatsApp';
  const nameKey = findPropKey(schema, [/nama.*grup/i, /nama/i, /name/i, /group/i], 'title') || 'Nama Grup';
  const accessKey = findPropKey(schema, [/akses.*bot/i, /akses/i, /status/i], 'select') || 'Akses Bot';

  return response.results.map((p) => {
    const rec = pageToRecord(p);
    return {
      pageId: p.id,
      groupId: rec[idKey] || (p.properties[idKey] ? extractPropValue(p.properties[idKey]) : ''),
      groupName: rec[nameKey] || (p.properties[nameKey] ? extractPropValue(p.properties[nameKey]) : 'Grup'),
      access: rec[accessKey] || (p.properties[accessKey] ? extractPropValue(p.properties[accessKey]) : ''),
      _raw: p,
      _keys: { idKey, nameKey, accessKey },
    };
  });
}

/**
 * Cek apakah grup terdaftar dan Akses Bot bernilai "Diizinkan"
 */
async function isGroupRegistered(groupId) {
  try {
    const groups = await queryGroups();
    const group = groups.find((g) => g.groupId === groupId);
    if (!group) return false;
    return group.access.trim().toLowerCase() === 'diizinkan';
  } catch (err) {
    console.error('[Notion Groups] Error checking group registration:', err.message);
    return false;
  }
}

/**
 * Daftarkan grup ke database Notion (Akses Bot: Diizinkan)
 */
async function registerGroup(groupId, groupName) {
  const notion = getNotionClient();
  const dbId = config.NOTION_GROUPS_DATA_SOURCE_ID;
  const schema = await getDatabaseSchema(dbId);

  const idKey = findPropKey(schema, [/id.*grup/i, /group.*id/i, /whatsapp/i], 'rich_text') || 'ID Grup WhatsApp';
  const nameKey = findPropKey(schema, [/nama.*grup/i, /nama/i, /name/i, /group/i], 'title') || 'Nama Grup';
  const accessKey = findPropKey(schema, [/akses.*bot/i, /akses/i, /status/i], 'select') || 'Akses Bot';

  const groups = await queryGroups();
  const existing = groups.find((g) => g.groupId === groupId);

  if (existing) {
    // Jika sudah ada tapi dinonaktifkan, ubah kembali ke Diizinkan
    if (existing.access.trim().toLowerCase() === 'diizinkan') {
      return { status: 'ALREADY_ALLOWED', groupName: existing.groupName };
    }

    const updatePayload = {};
    const accessPayload = formatPropPayload(schema[accessKey], 'Diizinkan');
    if (accessPayload) updatePayload[accessKey] = accessPayload;

    if (groupName && groupName !== existing.groupName && schema[nameKey]) {
      const namePayload = formatPropPayload(schema[nameKey], groupName);
      if (namePayload) updatePayload[nameKey] = namePayload;
    }

    await notion.pages.update({
      page_id: existing.pageId,
      properties: updatePayload,
    });

    return { status: 'RE_ENABLED', groupName: groupName || existing.groupName };
  }

  // Buat halaman baru di database Notion
  const propertiesPayload = {};

  if (schema[nameKey]) {
    propertiesPayload[nameKey] = formatPropPayload(schema[nameKey], groupName || 'Grup WhatsApp');
  }
  if (schema[idKey]) {
    propertiesPayload[idKey] = formatPropPayload(schema[idKey], groupId);
  }
  if (schema[accessKey]) {
    propertiesPayload[accessKey] = formatPropPayload(schema[accessKey], 'Diizinkan');
  }

  await notion.pages.create({
    parent: { database_id: dbId },
    properties: propertiesPayload,
  });

  return { status: 'CREATED', groupName: groupName || 'Grup WhatsApp' };
}

/**
 * Cabut akses grup (Ubah Akses Bot menjadi "Dinonaktifkan" tanpa menghapus baris)
 */
async function revokeGroup(groupId) {
  const notion = getNotionClient();
  const dbId = config.NOTION_GROUPS_DATA_SOURCE_ID;
  const schema = await getDatabaseSchema(dbId);

  const accessKey = findPropKey(schema, [/akses.*bot/i, /akses/i, /status/i], 'select') || 'Akses Bot';
  const groups = await queryGroups();
  const existing = groups.find((g) => g.groupId === groupId);

  if (!existing) {
    return { status: 'NOT_FOUND' };
  }

  const updatePayload = {};
  const accessPayload = formatPropPayload(schema[accessKey], 'Dinonaktifkan');
  if (accessPayload) updatePayload[accessKey] = accessPayload;

  await notion.pages.update({
    page_id: existing.pageId,
    properties: updatePayload,
  });

  return { status: 'REVOKED', groupName: existing.groupName };
}

/**
 * Ambil daftar seluruh grup
 */
async function listAllGroups() {
  return await queryGroups();
}

// ==================================================================
//  OPERASI DATABASE TUGAS (NOTION_TASKS_DATA_SOURCE_ID) [Tugas Tim]
// ==================================================================

/**
 * Query semua tugas untuk grup tertentu dari database Notion
 */
async function getTasksByGroup(groupId) {
  const notion = getNotionClient();
  const dbId = config.NOTION_TASKS_DATA_SOURCE_ID;
  const schema = await getDatabaseSchema(dbId);

  const titleKey = findPropKey(schema, [/nama.*tugas/i, /nama/i, /task/i, /tugas/i, /title/i], 'title') || 'Nama Tugas';
  const groupKey = findPropKey(schema, [/id.*grup/i, /grup/i, /group/i, /whatsapp/i], 'rich_text') || 'ID Grup WhatsApp';
  const descKey = findPropKey(schema, [/deskripsi/i, /desc/i, /keterangan/i], 'rich_text') || 'Deskripsi';
  const prioKey = findPropKey(schema, [/prioritas/i, /priority/i, /prio/i], 'select') || 'Prioritas';
  const statusKey = findPropKey(schema, [/status/i], 'status') || 'Status';

  const response = await notion.databases.query({
    database_id: dbId,
    sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
  });

  const tasks = [];
  for (const p of response.results) {
    const rec = pageToRecord(p);
    const taskGroupId = rec[groupKey] || (p.properties[groupKey] ? extractPropValue(p.properties[groupKey]) : '');

    // Cocokkan task dengan groupId grup ini
    if (!groupId || taskGroupId === groupId) {
      const taskName = rec[titleKey] || (p.properties[titleKey] ? extractPropValue(p.properties[titleKey]) : 'Tanpa Judul');
      const desc = rec[descKey] || (p.properties[descKey] ? extractPropValue(p.properties[descKey]) : '-');
      const prio = rec[prioKey] || (p.properties[prioKey] ? extractPropValue(p.properties[prioKey]) : '-');
      const status = rec[statusKey] || (p.properties[statusKey] ? extractPropValue(p.properties[statusKey]) : 'Belum Selesai');

      tasks.push({
        pageId: p.id,
        taskName,
        description: desc,
        priority: prio,
        status,
        createdTime: p.created_time,
        _keys: { titleKey, groupKey, descKey, prioKey, statusKey },
      });
    }
  }

  return tasks;
}

/**
 * Tambah tugas baru ke Notion
 */
async function addTask(groupId, taskName, description, priority) {
  const notion = getNotionClient();
  const dbId = config.NOTION_TASKS_DATA_SOURCE_ID;
  const schema = await getDatabaseSchema(dbId);

  const titleKey = findPropKey(schema, [/nama.*tugas/i, /nama/i, /task/i, /tugas/i, /title/i], 'title') || 'Nama Tugas';
  const groupKey = findPropKey(schema, [/id.*grup/i, /grup/i, /group/i, /whatsapp/i], 'rich_text') || 'ID Grup WhatsApp';
  const descKey = findPropKey(schema, [/deskripsi/i, /desc/i, /keterangan/i], 'rich_text') || 'Deskripsi';
  const prioKey = findPropKey(schema, [/prioritas/i, /priority/i, /prio/i], 'select') || 'Prioritas';
  const statusKey = findPropKey(schema, [/status/i], 'status') || 'Status';

  const propertiesPayload = {};

  if (schema[titleKey]) {
    propertiesPayload[titleKey] = formatPropPayload(schema[titleKey], taskName);
  }
  if (schema[groupKey]) {
    propertiesPayload[groupKey] = formatPropPayload(schema[groupKey], groupId);
  }
  if (schema[descKey]) {
    propertiesPayload[descKey] = formatPropPayload(schema[descKey], description || '-');
  }
  if (schema[prioKey]) {
    propertiesPayload[prioKey] = formatPropPayload(schema[prioKey], priority || 'medium');
  }
  if (schema[statusKey]) {
    // Pilih default status yang belum selesai
    const opts = schema[statusKey].status?.options || schema[statusKey].select?.options || [];
    const openOpt = opts.find((o) => /not started|belum|open|to do/i.test(o.name));
    const defaultStatus = openOpt ? openOpt.name : 'Belum Selesai';
    propertiesPayload[statusKey] = formatPropPayload(schema[statusKey], defaultStatus);
  }

  const response = await notion.pages.create({
    parent: { database_id: dbId },
    properties: propertiesPayload,
  });

  return { pageId: response.id, taskName };
}

/**
 * Edit tugas di Notion
 */
async function editTask(pageId, newName, newDesc, newPrio) {
  const notion = getNotionClient();
  const dbId = config.NOTION_TASKS_DATA_SOURCE_ID;
  const schema = await getDatabaseSchema(dbId);

  const titleKey = findPropKey(schema, [/nama.*tugas/i, /nama/i, /task/i, /tugas/i, /title/i], 'title') || 'Nama Tugas';
  const descKey = findPropKey(schema, [/deskripsi/i, /desc/i, /keterangan/i], 'rich_text') || 'Deskripsi';
  const prioKey = findPropKey(schema, [/prioritas/i, /priority/i, /prio/i], 'select') || 'Prioritas';

  const updatePayload = {};
  if (newName && schema[titleKey]) {
    updatePayload[titleKey] = formatPropPayload(schema[titleKey], newName);
  }
  if (newDesc && schema[descKey]) {
    updatePayload[descKey] = formatPropPayload(schema[descKey], newDesc);
  }
  if (newPrio && schema[prioKey]) {
    updatePayload[prioKey] = formatPropPayload(schema[prioKey], newPrio);
  }

  await notion.pages.update({
    page_id: pageId,
    properties: updatePayload,
  });

  return true;
}

/**
 * Ubah status tugas (Done vs Undone/Pending)
 */
async function updateTaskStatus(pageId, isDone) {
  const notion = getNotionClient();
  const dbId = config.NOTION_TASKS_DATA_SOURCE_ID;
  const schema = await getDatabaseSchema(dbId);

  const statusKey = findPropKey(schema, [/status/i], 'status') || 'Status';
  if (!schema[statusKey]) return false;

  const opts = schema[statusKey].status?.options || schema[statusKey].select?.options || [];

  let targetStatus = '';
  if (isDone) {
    const doneOpt = opts.find((o) => /done|selesai|completed|finish/i.test(o.name));
    targetStatus = doneOpt ? doneOpt.name : 'Selesai';
  } else {
    const undoneOpt = opts.find((o) => /not started|belum|open|to do|in progress/i.test(o.name));
    targetStatus = undoneOpt ? undoneOpt.name : 'Belum Selesai';
  }

  const statusPayload = formatPropPayload(schema[statusKey], targetStatus);
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [statusKey]: statusPayload,
    },
  });

  return targetStatus;
}

/**
 * Hapus (archive) halaman tugas di Notion
 */
async function deleteTask(pageId) {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: pageId,
    archived: true,
  });
  return true;
}

/**
 * Cek apakah string status menunjukkan selesai
 */
function isTaskCompleted(statusStr) {
  if (!statusStr) return false;
  return /done|selesai|completed|finish/i.test(statusStr);
}

module.exports = {
  getNotionClient,
  getDatabaseSchema,
  isGroupRegistered,
  registerGroup,
  revokeGroup,
  listAllGroups,
  getTasksByGroup,
  addTask,
  editTask,
  updateTaskStatus,
  deleteTask,
  isTaskCompleted,
};
