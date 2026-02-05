import TelegramBot from "node-telegram-bot-api";

console.log("🤖 Bot Telegram avviato");

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) {
  console.error("❌ TELEGRAM_TOKEN mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

/* =======================
   /start
======================= */
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "utente";

  bot.sendMessage(
    chatId,
    `👋 Ciao ${name}!\n\nCon questo bot puoi:\n• partecipare alle aste\n• compilare il modulo direttamente qui`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⚖️ Aste",
              switch_inline_query_current_chat: "/aste"
            }
          ]
        ]
      }
    }
  );
});

/* =======================
   /aste → MODULO IN CHAT
======================= */
bot.onText(/\/aste/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(
    chatId,
    `🏷️ *Modulo Asta*\n\nRispondi a queste domande:\n\n1️⃣ Nome\n2️⃣ Prodotto\n3️⃣ Offerta\n\n✍️ Scrivi tutto in un unico messaggio.`,
    { parse_mode: "Markdown" }
  );
});