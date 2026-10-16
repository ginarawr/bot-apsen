// ---------------------------------------------------------------
//  index.js  –  Bot APSEN (whatsapp-web.js)
// ---------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { initSpreadsheet } = require('./helpers/spreadsheet');

// Import modul
const listGroup = require('./modules/list_group');
const todolist = require('./modules/todolist');

const prefix = config.BOT_PREFIX;

/* ------------------------------------------------------------------
   Hapus lock Chromium yang tertinggal di volume sesi.
   Chromium menyimpan hostname+PID di SingletonLock; setelah container
   dibuat ulang hostname berubah, sehingga Chromium mengira profil
   sedang dipakai "komputer lain" dan menolak start (Code 21).
------------------------------------------------------------------- */
function removeStaleChromiumLocks(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (['SingletonLock', 'SingletonSocket', 'SingletonCookie'].includes(entry.name)) {
      fs.rmSync(full, { force: true });
    } else if (entry.isDirectory()) {
      removeStaleChromiumLocks(full);
    }
  }
}
removeStaleChromiumLocks(path.resolve('.wwebjs_auth'));

/* ------------------------------------------------------------------
   Cek profil sesi WhatsApp sebelum start.
   LocalAuth menyimpan sesi di .wwebjs_auth/session (Chromium userDataDir).
   Kalau folder itu hilang/kosong (volume tidak ter-mount, atau kena
   `docker compose down -v`), bot pasti menampilkan QR untuk pairing baru -
   log ini membuat penyebabnya langsung kelihatan.
------------------------------------------------------------------- */
function logSessionStatus() {
  const sessionDir = path.resolve('.wwebjs_auth/session');
  const hasProfile = fs.existsSync(path.join(sessionDir, 'Default'));
  if (hasProfile) {
    console.log(`[Bot] Profil sesi ditemukan di ${sessionDir}`);
  } else {
    console.warn(
      `[Bot] Profil sesi TIDAK ADA di ${sessionDir} — QR akan muncul untuk pairing baru.\n` +
        `[Bot] Cek volume .wwebjs_auth masih ter-mount dan jangan pakai \`docker compose down -v\`.`
    );
  }
}

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
  // Hubungkan ke Google Spreadsheet (opsional)
  try {
    await initSpreadsheet();
    console.log('[Bot] Spreadsheet berhasil terhubung!');
  } catch (e) {
    console.warn('[Bot] Catatan Spreadsheet:', e.message);
  }

  // Verifikasi koneksi Notion
  try {
    const notionHelper = require('./helpers/notion');
    const groups = await notionHelper.listAllGroups();
    console.log(`[Bot] Notion berhasil terhubung! (${groups.length} grup di database)`);
  } catch (e) {
    console.warn('[Bot] Catatan Notion:', e.message);
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

logSessionStatus();
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
  if (body === `${prefix}faiz`) {
    await client.sendMessage(chatId, 'anomali');
    return;
  }

    // ---- jumi ----
  if (body === `${prefix}jumiati` || body === `${prefix}jumi`) {
    await client.sendMessage(chatId, 'Worth it');
    return;
  }

      // ---- sarah ----
  if (body === `${prefix}sarah`) {
    await client.sendMessage(chatId, 'maggot');
    return;
  }
  // --- Ihza ----
  if (body === `${prefix}ihza`) {
    await client.sendMessage(chatId, 'galon');
    return;
  }

  // ---- Dimas ----
  if (body === `${prefix}dimas`) {
    await client.sendMessage(chatId, 'panas dingin');
    return;
  }

  // ---- Andika ----
  if (body === `${prefix}andika`) {
    await client.sendMessage(chatId, 'tubesensing');
    return;
  }

    // ---- Fadel ----
  if (body === `${prefix}fadel`) {
    await client.sendMessage(chatId, 'kepala suku');
    return;
  }

      // ---- Fardan ----
  if (body === `${prefix}fardan`) {
    await client.sendMessage(chatId, 'haloo guys, bentar kita meeting progress artikel yaa');
    return;
  }

  // ---- Miftah ----
  if (body === `${prefix}miftah`) {
    await client.sendMessage(chatId, 'Alumni Machida');
    return;
  }

    // ---- Gina ----
  if (body === `${prefix}gina`) {
    await client.sendMessage(chatId, 'machida bot');
    return;
  }

    // ---- Firqah ----
  if (body === `${prefix}firqah`) {
    await client.sendMessage(chatId, 'ahli anggur');
    return;
  }

    // ---- Inna ----
  if (body === `${prefix}inna`) {
    await client.sendMessage(chatId, 'turbidity');
    return;
  }

  // ---- Om sukron ----
  if (body === `${prefix}sukron`) {
    await client.sendMessage(chatId, 'om sukron');
    return;
  }

   // ---- Pak jumadi ----
  if (body === `${prefix}Jumadi`) {
    await client.sendMessage(chatId, 'Enak ji perasaan ta hari ini?');
    return;
  }

  // ---- Pak Wahid ----
  if (body === `${prefix}Wahid`) {
    await client.sendMessage(chatId, 'Info progress artikelnya suda sampai mana?');
    return;
  }

  // ---- Pak Syahid ----
  if (body === `${prefix}Syahid`) {
    await client.sendMessage(chatId, 'Oleh-oleh');
    return;
  }

  // ---- MODUL LIST GROUP (admin = fromMe) ----
  // Perintah: !register | Nama Tim  /  !reg | Nama Tim  /  !hapus  /  !listgrup
  const groupCmdPrefixes = [
    `${prefix}register`,
    `${prefix}reg`,
    `${prefix}hapus`,
    `${prefix}listgrup`,
  ];
  if (groupCmdPrefixes.some((c) => body === c || body.startsWith(`${c} `) || body.startsWith(`${c}|`))) {
    await listGroup.handleCommand(client, message, chat, chatId, isGroup);
    return;
  }

  // ---- MODUL TODO LIST & PROGRESS (Spreadsheet → Notion) ----
  // Perintah lengkap + alias singkat
  const todoCmdPrefixes = [
    // Lengkap
    `${prefix}list`,
    `${prefix}task_list`,
    `${prefix}add`,
    `${prefix}add_task`,
    `${prefix}remove`,
    `${prefix}remove_task`,
    `${prefix}edit`,
    `${prefix}edit_task`,
    `${prefix}done`,
    `${prefix}complete`,
    `${prefix}undone`,
    `${prefix}incomplete`,
    `${prefix}progress`,
    `${prefix}report`,
    `${prefix}q`,
    // Alias singkat
    `${prefix}l`,   // !list
    `${prefix}p`,   // !progress
    `${prefix}d`,   // !done
    `${prefix}u`,   // !undone
    `${prefix}a`,   // !add
    `${prefix}e`,   // !edit
    `${prefix}rm`,  // !remove
  ];
  if (todoCmdPrefixes.some((c) => body === c || body.startsWith(`${c} `) || body.startsWith(`${c}\n`))) {
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
  menu += `💡 Ketik *${prefix}add template* atau *${prefix}edit template* untuk contoh format.\n`;
  menu += `💡 Ketik *${prefix}progress* atau *${prefix}q gimana progress Tim?* untuk laporan.\n`;
  if (!isBotOwner) {
    menu += `⚠️ Grup harus *terdaftar* terlebih dahulu. Minta Admin Bot ketik *${prefix}register | Nama Tim*.`;
  }
  return menu;
}