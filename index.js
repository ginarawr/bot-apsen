// ---------------------------------------------------------------
//  index.js  –  Bot APSEN (whatsapp-web.js)
// ---------------------------------------------------------------
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { initSpreadsheet } = require('./helpers/spreadsheet');

// Import modul
const listGroup = require('./modules/list_group');
const todolist = require('./modules/todolist');

const prefix = config.BOT_PREFIX;

/* ------------------------------------------------------------------
   Inisialisasi client WhatsApp
   - `LocalAuth` menyimpan sesi di folder ./session-data
   - QR‑code ditampilkan di terminal via qrcode‑terminal
------------------------------------------------------------------- */
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  },
  puppeteer: {
    headless: true,               // jalankan Chrome headless
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  // Tampilkan QR‑code di terminal (ASCII)
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log(`
╔══════════════════════════════════╗
║     BOT APSEN - WhatsApp Bot     ║
║   Powered by whatsapp-web.js     ║
╚══════════════════════════════════╝`);
  // Hubungkan ke Google Spreadsheet
  try {
    await initSpreadsheet();
    console.log('[Bot] Spreadsheet berhasil terhubung!');
  } catch (e) {
    console.error('[Bot] Gagal terhubung ke Spreadsheet:', e.message);
  }

  console.log(`[Bot] Bot siap! Prefix: ${prefix}`);
  console.log('[Bot] Menunggu pesan masuk...');
});

client.on('message_create', async (msg) => {
  if (!msg.body || !msg.body.startsWith(prefix)) return;
  console.log(`[DEBUG] Pesan (${msg.fromMe ? 'Bot/Owner' : 'Member'}) dari: ${msg.from} | isi: "${msg.body}"`);
  try {
    await handleMessage(client, msg);
  } catch (e) {
    console.error('[Bot] Error handling message:', e.message);
    console.error('[Bot] Stack:', e.stack);
  }
});

// Event: sesi lama tidak valid / perlu scan QR ulang
client.on('auth_failure', (msg) => {
  console.error('[Bot] ❌ Auth gagal:', msg);
  console.log('[Bot] Hapus folder .wwebjs_auth dan scan QR ulang.');
});

// Event: disconnected
client.on('disconnected', (reason) => {
  console.warn('[Bot] ⚠️ Bot terputus:', reason);
});

console.log('[Bot] Memulai inisialisasi... (harap tunggu 30-60 detik)');
client.initialize();

async function getChatDetails(client, message) {
  let remoteJid = message.id?.remote;
  if (remoteJid === 'status@broadcast') remoteJid = null;

  let chatId = null;
  if (remoteJid && remoteJid.endsWith('@g.us')) {
    chatId = remoteJid;
  } else if (message.to && message.to.endsWith('@g.us')) {
    chatId = message.to;
  } else if (message.from && message.from.endsWith('@g.us')) {
    chatId = message.from;
  }

  let isGroup = !!chatId;
  let chat = null;

  if (chatId) {
    try {
      chat = await client.getChatById(chatId);
    } catch (e) {
      console.warn('[Bot] Warn: Gagal getChatById:', e.message);
    }
  } else {
    try {
      chat = await message.getChat();
      if (chat) {
        chatId = chat.id._serialized;
        isGroup = chat.isGroup;
      }
    } catch (e) {
      chatId = message.from;
      isGroup = false;
    }
  }

  return { chatId, isGroup, chat };
}

/* ------------------------------------------------------------------
   Handler utama semua pesan masuk
------------------------------------------------------------------- */
async function handleMessage(client, message) {
  const body = message.body?.trim();
  if (!body || !body.startsWith(prefix)) return;

  const { chatId, isGroup, chat } = await getChatDetails(client, message);
  const groupId = isGroup ? chatId : null;

  // Cek grup terdaftar
  let isRegistered = false;
  if (groupId) {
    isRegistered = await listGroup.isGroupRegistered(groupId);
  }

  // ---- MENU / HELP ----
  if (body === `${prefix}menu` || body === `${prefix}help`) {
    await client.sendMessage(chatId, generateMenu(prefix, message.fromMe));
    return;
  }
    // ---- ANOMALI ----
  if (body === `${prefix}anomali`) {
    await client.sendMessage(chatId, 'Faiz anomali');
    return;
  }

    // ---- jumi ----
  if (body === `${prefix}Jumiati`) {
    await client.sendMessage(chatId, 'Worth it');
    return;
  }

  // ---- MODUL LIST GROUP ----
  const groupCmds = [`${prefix}daftar`, `${prefix}hapus`, `${prefix}listgrup`];
  if (groupCmds.includes(body)) {
    await listGroup.handleCommand(client, message, chat, chatId, isGroup);
    return;
  }

  // ---- MODUL TODO LIST ----
  const todoCmds = [
    `${prefix}list`,
    `${prefix}task_list`,
    `${prefix}add`,
    `${prefix}add_task`,
    `${prefix}remove`,
    `${prefix}remove_task`,
    `${prefix}edit`,
    `${prefix}edit_task`,
  ];
  if (todoCmds.some((c) => body === c || body.startsWith(`${c} `) || body.startsWith(`${c}\n`))) {
    await todolist.handleCommand(client, message, isRegistered, chatId, isGroup);
    return;
  }
}

/* ------------------------------------------------------------------
   Generate teks menu utama dinamis
------------------------------------------------------------------- */
function generateMenu(prefix, isBotOwner = false) {
  let menu = '🤖 *BOT APSEN — MENU UTAMA*\n';
  menu += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  if (isBotOwner) {
    menu += listGroup.helpText(prefix) + '\n\n';
  }

  menu += todolist.helpText(prefix) + '\n\n';
  menu += '━━━━━━━━━━━━━━━━━━━━━━\n';
  menu += `💡 Ketik *${prefix}menu* untuk melihat menu lagi.\n`;
  menu += `💡 Ketik *${prefix}add template* atau *${prefix}edit template* untuk contoh cepat.\n`;
  menu += '⚠️ Grup harus *terdaftar* terlebih dahulu untuk menggunakan fitur TodoList.';
  return menu;
}