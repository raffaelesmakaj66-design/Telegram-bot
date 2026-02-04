import TelegramBot from "node-telegram-bot-api";

const TOKEN = process.env.TELEGRAM_TOKEN; // il token di BotFather
if (!TOKEN) {
  console.error("❌ TELEGRAM_TOKEN mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// LINK dei tuoi moduli (da cambiare con link reali)
const LISTINO_URL = "https://example.com/listino";
const ORDINI_URL = "https://example.com/modulo-ordini";
const ASTE_URL = "https://example.com/modulo-aste";

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "utente";

  bot.sendMessage(
    chatId,
    `👋 Ciao ${name}!\nBenvenuto nel bot.\nPuoi consultare il listino digitale, inviare ordinazioni o partecipare alle aste.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 Listino digitale", url: LISTINO_URL }],
          [{ text: "🛒 Modulo ordinazioni", url: ORDINI_URL }]
        ]
      }
    }
  );
});

// /aste
bot.onText(/\/aste/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(
    chatId,
    "🏷️ Modulo Aste\nClicca qui sotto per partecipare:",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "⚖️ Vai al modulo aste", url: ASTE_URL }]]
      }
    }
  );
});

// Risposta generica
bot.on("message", (msg) => {
  if (msg.text && !msg.text.startsWith("/")) {
    bot.sendMessage(msg.chat.id, "ℹ️ Usa /start per vedere le opzioni disponibili.");
  }
});