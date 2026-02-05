import TelegramBot from "node-telegram-bot-api";

console.log("🤖 Bot Telegram avviato");

const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; // IL TUO TELEGRAM ID

if (!TOKEN || !ADMIN_ID) {
  console.error("❌ Variabili mancanti");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "👋 Benvenuto!\n\nPremi il bottone Aste e invia il modulo.",
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

// /aste → modulo
bot.onText(/\/aste/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🏷️ *Modulo Asta*\n
1️⃣ Nome
2️⃣ Prodotto
3️⃣ Offerta

✍️ Scrivi tutto in un unico messaggio.`,
    { parse_mode: "Markdown" }
  );
});

// risposta al modulo
bot.on("message", (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;

  const user = msg.from;
  const text = msg.text;

  // conferma all’utente
  bot.sendMessage(msg.chat.id, "✅ Modulo inviato correttamente!");

  // invio all’admin
  bot.sendMessage(
    ADMIN_ID,
    `📥 *Nuovo modulo asta*\n\n👤 ${user.first_name} (@${user.username || "no username"})\n🆔 ${user.id}\n\n📄 ${text}`,
    { parse_mode: "Markdown" }
  );
});