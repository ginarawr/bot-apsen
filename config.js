require('dotenv').config();

module.exports = {
  // Google Spreadsheet
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,

  // Bot
  BOT_PREFIX: process.env.BOT_PREFIX || '!',

  // Sheet Names
  SHEET_GROUPS: 'Groups',
  SHEET_TODOLIST: 'TodoList',
};
