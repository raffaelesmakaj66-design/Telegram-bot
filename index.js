import TelegramBot from "node-telegram-bot-api";

console.log("🤖 Bot Telegram avviato");

// ===== TOKEN =====
const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) {
  console.error("❌ TELEGRAM_TOKEN mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== LINK MODULI (CAMBIALI) =====
const LISTINO_URL = "https://example.com/listino";
const ORDINI_URL = "https://example.com/modulo-ordini";
const ASTE_URL = "https://example.com/modulo-aste";

// ===== /start =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "utente";

  bot.sendMessage(
    chatId,
    `👋 Ciao ${name}!\n\nCon questo bot puoi:\n• consultare il listino digitale\n• inviare ordinazioni\n• partecipare alle aste`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 Listino digitale", url: LISTINO_URL }],
          [{ text: "🛒 Modulo ordinazioni", url: ORDINI_URL }],
          [{ text: "⚖️ Aste", callback_data: "ASTE_CMD" }]
        ]
      }
    }
  );
});

// ===== CALLBACK BOTTONE ASTE =====
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;

  if (query.data === "ASTE_CMD") {
    // mostra il comando in chat (effetto /aste)
    bot.sendMessage(chatId, "/aste");

    // manda il modulo aste
    bot.sendMessage(
      chatId,
      "🏷️ *Modulo Aste*\nClicca il bottone qui sotto:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "👉 Vai al modulo aste", url: ASTE_URL }]
          ]
        }
      }
    );
  }

  // rimuove il caricamento del bottone
  bot.answerCallbackQuery(query.id);
});

// ===== /aste (funziona anche scritto a mano) =====
bot.onText(/\/aste/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(
    chatId,
    "🏷️ *Modulo Aste*\nClicca il bottone qui sotto:",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "👉 Vai al modulo aste", url: ASTE_URL }]
        ]
      }
    }
  );
});