import TelegramBot from "node-telegram-bot-api";

console.log("🤖 Bot Telegram avviato");

const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (!TOKEN || !ADMIN_ID) {
  console.error("❌ TELEGRAM_TOKEN o ADMIN_ID mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// FILE_ID FOTO BENVENUTO
const WELCOME_IMAGE = "AgACAgQAAxkBAAM1aYRXYd4FNs3LsBgpox5c0av2Ic8AAg8OaxsyrSlQ23YZ-nsoLoABAAMCAAN5AAM4BA";

/* =====================
   /start
===================== */
bot.onText(/\/start/, (msg) => {
  bot.sendPhoto(
    msg.chat.id,
    WELCOME_IMAGE,
    {
      caption: `👋 *Benvenuto!*

Premi un bottone qui sotto per accedere alle funzioni:`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⚖️ Aste", callback_data: "OPEN_ASTA" },
            { text: "📄 Listino digitale", callback_data: "OPEN_LISTINO" }
          ],
          [
            { text: "📝 Modulo ordinazioni", callback_data: "OPEN_ORDINI" }
          ]
        ]
      }
    }
  );
});

/* =====================
   CALLBACK BOTTONI
===================== */
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;

  switch(query.data) {
    case "OPEN_ASTA":
      bot.sendMessage(
        chatId,
        `🏷️ *Modulo Asta*

1️⃣ Nome  
2️⃣ Prodotto  
3️⃣ Offerta  

✍️ Scrivi tutto in *un unico messaggio*.`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_LISTINO":
      bot.sendMessage(
        chatId,
        `📄 *Listino digitale*\n\nEcco il nostro listino completo:\n- Prodotto A: €10\n- Prodotto B: €15\n- Prodotto C: €20`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ORDINI":
      bot.sendMessage(
        chatId,
        `📝 *Modulo Ordinazioni*\n\nRispondi a queste domande:\n1️⃣ Nome\n2️⃣ Prodotto\n3️⃣ Quantità\n4️⃣ Note aggiuntive`,
        { parse_mode: "Markdown" }
      );
      break;
  }

  bot.answerCallbackQuery(query.id);
});

/* =====================
   RISPOSTA AL MODULO ASTA/ORDINI
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
    `📥 *Nuovo modulo ricevuto*\n\n👤 ${user.first_name} (@${user.username || "nessuno"})\n🆔 ${user.id}\n\n📄 ${msg.text}`,
    { parse_mode: "Markdown" }
  );
});