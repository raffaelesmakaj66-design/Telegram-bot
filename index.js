import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_IDS = process.env.ADMIN_ID?.split(",").map(id => Number(id.trim())) || [];

if (!TOKEN || ADMIN_IDS.length === 0) {
  console.error("❌ TELEGRAM_TOKEN o ADMIN_ID mancanti");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

const WELCOME_IMAGE =
  "AgACAgQAAxkBAAM1aYRXYd4FNs3LsBgpox5c0av2Ic8AAg8OaxsyrSlQ23YZ-nsoLoABAAMCAAN5AAM4BA";

const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

// =====================
// FILE RECENSIONI
// =====================
const REVIEWS_FILE = "./reviews.json";
if (!fs.existsSync(REVIEWS_FILE)) {
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify([]));
}

const loadReviews = () => JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));

const saveReview = (review) => {
  const reviews = loadReviews();
  reviews.push(review);
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
};

const getAverage = () => {
  const reviews = loadReviews();
  if (reviews.length === 0) return "0.0";
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  return (sum / reviews.length).toFixed(1);
};

// =====================
// STATI
// =====================
const assistenzaUsers = new Set();          // utenti in assistenza
const adminReplyMap = {};                   // admin -> utente

// ⭐ Stato recensione stabile
// userId -> { rating, waitingComment }
const reviewState = new Map();

// ⭐ Anti-spam SOLO recensioni
const reviewCooldown = new Map();
const REVIEW_COOLDOWN_MS = 60 * 1000; // 1 minuto

// =====================
// HELPERS
// =====================
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");
}

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  bot.sendPhoto(msg.chat.id, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*`,
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
        [{ text: "⭐ Recensione", callback_data: "OPEN_REVIEW" }],
        [{ text: "⭐ Sponsor", callback_data: "OPEN_SPONSOR" }],
        [{ text: "💼 Candidati dipendente", callback_data: "OPEN_CANDIDATURA" }]
      ]
    }
  });
});

// =====================
// CALLBACK QUERY
// =====================
bot.on("callback_query", (q) => {
  const chatId = q.message.chat.id;
  const userId = Number(q.from.id);

  // =====================
  // ⭐ CLICK STELLE
  // =====================
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    const now = Date.now();

    const last = reviewCooldown.get(userId) || 0;
    if (now - last < REVIEW_COOLDOWN_MS) {
      bot.answerCallbackQuery(q.id, {
        text: "⏳ Attendi prima di lasciare un’altra recensione",
        show_alert: true
      });
      return;
    }

    reviewCooldown.set(userId, now);

    // ⭐ Imposto lo stato per il commento
    reviewState.set(userId, { rating, waitingComment: true });

    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });

    bot.sendMessage(
      chatId,
      `🙏 *Grazie per aver votato!*

⭐ Voto: *${rating}/5*

Vuoi lasciare un commento?`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⏭️ Skip", callback_data: "SKIP_REVIEW" }]
          ]
        }
      }
    );
    return;
  }

  // =====================
  // ⏭️ SKIP COMMENTO
  // =====================
  if (q.data === "SKIP_REVIEW") {
    const state = reviewState.get(userId);
    if (!state) {
      bot.answerCallbackQuery(q.id, { text: "❌ Stato recensione non trovato", show_alert: true });
      return;
    }

    reviewState.delete(userId);
    saveReview({ rating: state.rating, comment: null });

    const avg = getAverage();
    const total = loadReviews().length;

    bot.answerCallbackQuery(q.id, { text: "Recensione inviata!" });
    bot.sendMessage(
      chatId,
      `✅ *Grazie per la recensione!*

⭐ Voto: *${state.rating}/5*
📊 Media attuale: *${avg}* (${total} voti)`,
      { parse_mode: "Markdown" }
    );

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(
        id,
        `⭐ *Nuova recensione*

👤 ${q.from.first_name}
⭐ ${state.rating}/5
💬 Nessun commento`,
        { parse_mode: "Markdown" }
      );
    });
    return;
  }

  // =====================
  // MENU
  // =====================
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(
        chatId,
        `⭐ *Lascia una recensione*

Seleziona un voto da *1 a 5 stelle* ⭐`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "⭐ 1", callback_data: "RATE_1" },
              { text: "⭐ 2", callback_data: "RATE_2" },
              { text: "⭐ 3", callback_data: "RATE_3" },
              { text: "⭐ 4", callback_data: "RATE_4" },
              { text: "⭐ 5", callback_data: "RATE_5" }
            ]]
          }
        }
      );
      break;

    case "OPEN_LISTINO":
    case "OPEN_SPONSOR":
      bot.sendMessage(
        chatId,
        `📄 *Listino Sponsor*

• Base → *1k*
• Medio → *2.5k*
• Premium → *5k*
• Elite → *10k*`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASTA":
      bot.sendMessage(
        chatId,
        `🏷️ *Modulo Asta*

1️⃣ Oggetto/i  
2️⃣ Nickname  
3️⃣ Prezzo base  
4️⃣ Rilancio`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ORDINI":
      bot.sendMessage(
        chatId,
        `📝 *Modulo Ordini*

1️⃣ Nickname  
2️⃣ @ Telegram  
3️⃣ Prodotti desiderati`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASSISTENZA":
      assistenzaUsers.add(chatId);
      bot.sendMessage(chatId, "🆘 Scrivi il tuo messaggio per l’assistenza.");
      break;

    case "OPEN_CANDIDATURA":
      bot.sendMessage(
        chatId,
        `📝 *Come fare il curriculum*

1️⃣ Dati personali  
2️⃣ Parlaci di te (passioni, carattere…)  
3️⃣ Perché dovremmo sceglierti  
4️⃣ Esperienze lavorative  
5️⃣ Competenze  
6️⃣ Pregi e difetti

📍 *Consegna:*  
Bancarella 8 – coordinate -505 64 22, davanti all’ospedale`,
        { parse_mode: "Markdown" }
      );
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = Number(msg.from.id);

  // ⭐ COMMENTO RECENSIONE
  const state = reviewState.get(userId);
  if (state && state.waitingComment) {
    reviewState.delete(userId);
    saveReview({ rating: state.rating, comment: escapeMarkdown(msg.text) });

    const avg = getAverage();
    const total = loadReviews().length;

    bot.sendMessage(
      chatId,
      `✅ *Grazie per la recensione!*

⭐ Voto: *${state.rating}/5*
💬 Commento: _${escapeMarkdown(msg.text)}_
📊 Media attuale: *${avg}* (${total} voti)`,
      { parse_mode: "Markdown" }
    );

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(
        id,
        `⭐ *Nuova recensione*

👤 ${msg.from.first_name}
⭐ ${state.rating}/5
💬 ${escapeMarkdown(msg.text)}`,
        { parse_mode: "Markdown" }
      );
    });
    return;
  }

  // =====================
  // RISPOSTA ADMIN
  // =====================
  if (ADMIN_IDS.includes(userId)) {
    const target = adminReplyMap[userId];
    if (target) {
      bot.sendMessage(
        target,
        `💬 *Risposta assistenza:*\n\n${escapeMarkdown(msg.text)}`,
        { parse_mode: "Markdown" }
      );
      delete adminReplyMap[userId];
    }
    return;
  }

  // =====================
  // ASSISTENZA
  // =====================
  if (assistenzaUsers.has(chatId)) {
    bot.sendMessage(chatId, "✅ Messaggio inviato correttamente!");

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(
        id,
        `📩 *Messaggio assistenza*

👤 ${msg.from.first_name} (@${msg.from.username || "nessuno"})
🆔 ${msg.from.id}

${escapeMarkdown(msg.text)}`,
        { parse_mode: "Markdown" }
      );
      adminReplyMap[id] = chatId;
    });
    return;
  }

  // =====================
  // MODULI
  // =====================
  bot.sendMessage(chatId, "✅ Modulo inviato correttamente!");
  ADMIN_IDS.forEach(id => {
    bot.sendMessage(
      id,
      `📥 *Nuovo modulo*

👤 ${msg.from.first_name}
🆔 ${msg.from.id}

${escapeMarkdown(msg.text)}`,
      { parse_mode: "Markdown" }
    );
  });
});