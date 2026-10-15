require('dotenv').config();

module.exports = {
  // Google Spreadsheet
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,

  // Notion Configuration
  NOTION_API_KEY: process.env.NOTION_API_KEY,
  NOTION_TASKS_DATA_SOURCE_ID: process.env.NOTION_TASKS_DATA_SOURCE_ID || 'd2e258d0-ecc2-4158-ad40-7c51d463ab74',
  NOTION_GROUPS_DATA_SOURCE_ID: process.env.NOTION_GROUPS_DATA_SOURCE_ID || 'e68962d5-053c-4acc-a31f-f90b74a59e59',

  // Bot
  BOT_PREFIX: process.env.BOT_PREFIX || '!',

  // Sheet Names
  SHEET_GROUPS: 'Groups',
  SHEET_TODOLIST: 'TodoList',
};
