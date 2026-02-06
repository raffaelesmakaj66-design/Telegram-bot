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

// LINK CANALE UFFICIALE
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

// utenti che hanno già fatto /start
const usersStarted = new Set();

// utenti in assistenza { chatId: true }
const assistenzaUsers = new Set();

// mappa per tracciare conversazioni admin ↔ utente
// { adminId: chatIdUtente }
const adminReplyMap = {};

/* =====================
   /start
===================== */
bot.onText(/\/start/, (msg) => {
  usersStarted.add(msg.from.id);

  bot.sendPhoto(
    msg.chat.id,
    WELCOME_IMAGE,
    {
      caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*

Premi un bottone qui sotto per accedere alle funzioni:`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📣 Canale", url: CHANNEL_URL }],
          [
            { text: "⚖️ Aste", callback_data: "OPEN_ASTA" },
            { text: "📄 Listino", callback_data: "OPEN_LISTINO" }
          ],
          [
            { text: "📝 Ordina", callback_data: "OPEN_ORDINI" },
            { text: "🆘 Assistenza", callback_data: "OPEN_ASSISTENZA" }
          ],
          [{ text: "💼 Candidati dipendente", callback_data: "OPEN_CANDIDATURA" }]
        ]
      }
    }
  );
});

/* =====================
   BOTTONI CALLBACK
===================== */
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;

  switch (query.data) {
    case "OPEN_ASTA":
      bot.sendMessage(
        chatId,
        `🏷️ *Modulo Asta*

Scrivi in un unico messaggio:

1️⃣ Nickname  
2️⃣ Oggetto/i  
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

1️⃣ Dati personali: @ Telegram, Discord, telefono, nome, ore totali e settimanali (/tempo)  
2️⃣ Parlaci di te: chi sei, passioni...  
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
      assistenzaUsers.add(chatId);
      bot.sendMessage(
        chatId,
        `🆘 *Assistenza*

Scrivi qui il tuo messaggio, ti risponderanno gli admin.`,
        { parse_mode: "Markdown" }
      );
      break;
  }

  bot.answerCallbackQuery(query.id);
});

/* =====================
   RICEZIONE MESSAGGI
===================== */
bot.on("message", (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const user = msg.from;

  // --- RISPOSTE ADMIN ---
  if (ADMIN_IDS.includes(user.id)) {
    const targetChatId = adminReplyMap[user.id];
    if (targetChatId) {
      bot.sendMessage(targetChatId, `💬 *Risposta admin:*\n${msg.text}`, { parse_mode: "Markdown" });
      delete adminReplyMap[user.id]; // rimuove mappa dopo risposta
    }
    return; // non trattare come modulo
  }

  // --- ASSISTENZA ---
  if (assistenzaUsers.has(chatId)) {
    // conferma SOLO per l'assistenza
    bot.sendMessage(chatId, "✅ Messaggio inviato correttamente!");

    // invia a tutti gli admin
    ADMIN_IDS.forEach(adminId => {
      bot.sendMessage(
        adminId,
        `📩 *Nuovo messaggio assistenza da utente*

👤 ${user.first_name} (@${user.username || "nessuno"})
🆔 ${user.id}

💬 ${msg.text}`,
        { parse_mode: "Markdown" }
      );

      // traccia conversazione per risposte
      adminReplyMap[adminId] = chatId;
    });

    return; // esci qui, non trattare come modulo
  }

  // --- MODULI NORMALI ---
  if (msg.text.startsWith("/")) return; // ignora comandi
  bot.sendMessage(chatId, "✅ Modulo inviato correttamente!");
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