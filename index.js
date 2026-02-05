import TelegramBot from "node-telegram-bot-api";

console.log("🤖 Bot Telegram avviato");

const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; // tuo Telegram ID

if (!TOKEN || !ADMIN_ID) {
  console.error("❌ TELEGRAM_TOKEN o ADMIN_ID mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

/* =====================
   /start
===================== */
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `👋 *Benvenuto!*

Premi il bottone qui sotto per partecipare all’asta.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⚖️ Aste", callback_data: "OPEN_ASTA" }]
        ]
      }
    }
  );
});

/* =====================
   BOTTONE ASTE
===================== */
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;

  if (query.data === "OPEN_ASTA") {
    bot.sendMessage(
      chatId,
      `🏷️ *Modulo Asta*

1️⃣ Nome  
2️⃣ Prodotto  
3️⃣ Offerta  

✍️ Scrivi tutto in *un unico messaggio*.`,
      { parse_mode: "Markdown" }
    );
  }

  bot.answerCallbackQuery(query.id);
});

/* =====================
   RISPOSTA AL MODULO
===================== */
bot.on("message", (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;

  const user = msg.from;

  // conferma all’utente
  bot.sendMessage(msg.chat.id, "✅ Modulo inviato correttamente!");

  // invio all’admin
  bot.sendMessage(
    ADMIN_ID,
    `📥 *Nuovo modulo asta*

👤 ${user.first_name} (@${user.username || "nessuno"})
🆔 ${user.id}

📄 ${msg.text}`,
    { parse_mode: "Markdown" }
  );
});