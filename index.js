import TelegramBot from "node-telegram-bot-api";

const TOKEN = process.env.TELEGRAM_TOKEN;

if (!TOKEN) {
  console.error("❌ TELEGRAM_TOKEN mancante!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Bot avviato correttamente");

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Benvenuto! Il bot funziona!");
});

bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`);
});