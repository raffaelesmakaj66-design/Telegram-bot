import TelegramBot from "node-telegram-bot-api";

console.log("🤖 Bot Telegram avviato");

const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (!TOKEN || !ADMIN_ID) {
  console.error("❌ TELEGRAM_TOKEN o ADMIN_ID mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// MULTI-ADMIN (separati da virgola)
const ADMIN_IDS = process.env.ADMIN_ID.split(",").map(id => id.trim());

// FILE_ID IMMAGINE DI BENVENUTO
const WELCOME_IMAGE =
  "AgACAgQAAxkBAAM1aYRXYd4FNs3LsBgpox5c0av2Ic8AAg8OaxsyrSlQ23YZ-nsoLoABAAMCAAN5AAM4BA";

// LINK CANALE UFFICIALE (CAMBIALO CON IL TUO)
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

/* =====================
   /start
===================== */
bot.onText(/\/start/, (msg) => {
  bot.sendPhoto(
    msg.chat.id,
    WELCOME_IMAGE,
    {
      caption: `👋 *Benvenuto nel bot ufficiale di Capybar!*

Premi un bottone qui sotto per accedere alle funzioni:`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          // 📣 Canale
          [
            { text: "📣 Canale", url: CHANNEL_URL }
          ],
          // ⚖️ Aste | 📄 Listino
          [
            { text: "⚖️ Aste", callback_data: "OPEN_ASTA" },
            { text: "📄 Listino", callback_data: "OPEN_LISTINO" }
          ],
          // 📝 Modulo ordinazioni | 🆘 Assistenza
          [
            { text: "📝 Ordina", callback_data: "OPEN_ORDINI" },
            { text: "🆘 Assistenza", callback_data: "OPEN_ASSISTENZA" }
          ],
          // 💼 Candidati dipendente (lungo quanto 2 bottoni)
          [
            { text: "💼 Candidati dipendente", callback_data: "OPEN_CANDIDATURA" }
          ]
        ]
      }
    }
  );
});

/* =====================
   BOTTONI
===================== */
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;

  switch (query.data) {
    case "OPEN_ASTA":
      bot.sendMessage(
        chatId,
        `🏷️ *Modulo Asta*

Scrivi in un unico messaggio:

1️⃣ Oggetto/i  
2️⃣ Nickname  
3️⃣ Prezzo base  
4️⃣ Rilancio`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_LISTINO":
      bot.sendMessage(
        chatId,
        `📄 *Listino*

- Prodotto A: €10  
- Prodotto B: €15  
- Prodotto C: €20`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ORDINI":
      bot.sendMessage(
        chatId,
        `📝 *Modulo Ordinazioni*

Scrivi in un unico messaggio:

1️⃣ Nickname  
2️⃣ @ Telegram  
3️⃣ Prodotti desiderati`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_CANDIDATURA":
      bot.sendMessage(
        chatId,
        `📝 *Come fare il curriculum*

Compila il tuo curriculum seguendo questi punti:

1️⃣ Dati personali: @Telegram, Discord, telefono, nome e ore disponibili  
2️⃣ Parlaci di te (es: cucina e lavoro)  
3️⃣ Perché dovremmo sceglierti  
4️⃣ Esperienze lavorative (se presenti) e se lavori attualmente in un’azienda  
5️⃣ Competenze: uso della cassa e capacità di cucinare  
6️⃣ Pregi e difetti

📍 *Consegna del curriculum*:  
Bancarella 8, coordinate -505 64 22, davanti all’ospedale`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASSISTENZA":
      bot.sendMessage(
        chatId,
        `🆘 *Assistenza*

Se hai bisogno di aiuto o supporto contatta un admin direttamente o scrivi qui la tua richiesta.`,
        { parse_mode: "Markdown" }
      );
      break;
  }

  bot.answerCallbackQuery(query.id);
});

/* =====================
   RICEZIONE MODULI
===================== */
bot.on("message", (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;

  const user = msg.from;

  // conferma all’utente
  bot.sendMessage(msg.chat.id, "✅ Modulo inviato correttamente!");

  // invio a tutti gli admin
  ADMIN_IDS.forEach(adminId => {
    bot.sendMessage(
      adminId,
      `📥 *Nuovo modulo ricevuto*

👤 ${user.first_name} (@${user.username || "nessuno"})
🆔 ${user.id}

📄 ${msg.text}`,
      { parse_mode: "Markdown" }
    );
  });
});