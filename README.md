# 🤖 BOT APSEN — WhatsApp Bot

WhatsApp Bot modular menggunakan **OpenWA** + **Google Spreadsheet** sebagai database.

## 📁 Struktur Project

```
bot-apsen/
├── index.js                  # Entry point utama
├── config.js                 # Konfigurasi environment
├── package.json
├── .env.example              # Template environment variables
├── .gitignore
├── helpers/
│   └── spreadsheet.js        # Helper CRUD Google Spreadsheet
└── modules/
    ├── list_group.js          # Modul manajemen grup
    └── todolist.js            # Modul todo list
```

## 🚀 Cara Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Google Spreadsheet

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru → aktifkan **Google Sheets API**
3. Buat **Service Account** → download credentials JSON
4. Copy `client_email` dan `private_key` dari file JSON
5. Buat spreadsheet baru di Google Sheets
6. **Share** spreadsheet tersebut ke `client_email` (editor)
7. Copy **Spreadsheet ID** dari URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_DISINI/edit
   ```

### 3. Setup Environment Variables

Copy `.env.example` ke `.env`, lalu isi:
```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-email@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID=your_spreadsheet_id
BOT_PREFIX=!
```

### 4. Jalankan Bot
```bash
npm start
```
Scan QR Code yang muncul dengan WhatsApp.

## 📌 Daftar Perintah

### Modul Group Management
| Perintah       | Fungsi                              |
| -------------- | ----------------------------------- |
| `!daftar`      | Daftarkan grup agar bisa pakai bot  |
| `!hapus`       | Hapus grup dari daftar              |
| `!listgrup`    | Lihat semua grup terdaftar          |

### Modul TodoList *(grup harus terdaftar)*
| Perintah                                  | Fungsi              |
| ----------------------------------------- | -------------------- |
| `!task_list`                              | Lihat semua task     |
| `!add_task nama \| deskripsi \| priority` | Tambah task baru     |
| `!remove_task task_id`                    | Hapus task           |
| `!edit_task task_id \| field \| value`    | Edit task            |

### Contoh Penggunaan TodoList

```
!add_task Rapat Mingguan | Rapat divisi setiap hari Senin | high

!add_task Beli ATK | Beli pulpen dan kertas A4 | medium

!remove_task lxk3ab2c

!edit_task lxk3ab2c | priority | urgent

!edit_task lxk3ab2c | status | done

!edit_task lxk3ab2c | task_name | Rapat Bulanan
```

**Priority yang tersedia:** `low`, `medium`, `high`, `urgent`

**Field yang bisa diedit:** `task_name`, `description`, `priority`, `status`
