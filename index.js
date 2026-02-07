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
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, JSON.stringify([]));

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
const assistenzaUsers = new Set(); // utenti in assistenza
const adminReplyMap = {};          // admin -> utente
const reviewState = new Map();     // userId -> { rating, waitingComment }
const reviewCooldown = new Map();
const REVIEW_COOLDOWN_MS = 60 * 1000;

// helper markdown
const escapeMarkdown = (text) => text.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendPhoto(chatId, WELCOME_IMAGE, {
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
  const userId = Number(q.from.id);
  const chatId = q.message.chat.id;

  // ⭐ rating
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    const now = Date.now();
    const last = reviewCooldown.get(userId) || 0;

    if (now - last < REVIEW_COOLDOWN_MS) {
      bot.answerCallbackQuery(q.id, { text: "⏳ Devi attendere prima di lasciare un'altra recensione", show_alert: true });
      return;
    }

    reviewCooldown.set(userId, now);
    reviewState.set(userId, { rating, waitingComment: true });

    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });
    bot.sendMessage(chatId,
      `Hai votato ⭐ ${rating}/5\nVuoi lasciare un commento?`,
      {
        reply_markup: {
          inline_keyboard: [[
            // Qui il bottone Skip passa il rating nella callback
            { text: "⏭️ Skip", callback_data: `SKIP_${rating}` }
          ]]
        }
      }
    );
    return;
  }

  // ⭐ skip
  if (q.data.startsWith("SKIP_")) {
    const rating = Number(q.data.split("_")[1]);
    saveReview({ rating, comment: null });

    const avg = getAverage();
    const total = loadReviews().length;

    bot.answerCallbackQuery(q.id, { text: "Recensione inviata!" });
    bot.sendMessage(chatId,
      `✅ Recensione inviata correttamente!\n⭐ Voto: ${rating}/5\n📊 Media attuale: ${avg} (${total} voti)`);

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(id,
        `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n💬 Nessun commento`);
    });

    // Rimuovo stato dell'utente in memoria se esiste
    reviewState.delete(userId);
    return;
  }

  // =====================
  // MENU
  // =====================
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId,
        `⭐ *Lascia una recensione*\nSeleziona un voto da 1 a 5:`,
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
      bot.sendMessage(chatId,
        `📄 *Listino Sponsor*\n• Base → *1k*\n• Medio → *2.5k*\n• Premium → *5k*\n• Elite → *10k*`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASTA":
      bot.sendMessage(chatId,
        `🏷️ *Modulo Asta*\n1️⃣ Oggetto/i\n2️⃣ Nickname\n3️⃣ Prezzo base\n4️⃣ Rilancio`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ORDINI":
      bot.sendMessage(chatId,
        `📝 *Modulo Ordini*\n1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti desiderati`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASSISTENZA":
      assistenzaUsers.add(chatId);
      bot.sendMessage(chatId, "🆘 Scrivi il tuo messaggio per l’assistenza.");
      break;

    case "OPEN_CANDIDATURA":
      bot.sendMessage(chatId,
        `📝 *Come fare il curriculum*\n1️⃣ Dati personali\n2️⃣ Parlaci di te\n3️⃣ Perché dovremmo sceglierti\n4️⃣ Esperienze\n5️⃣ Competenze\n6️⃣ Pregi e difetti\n📍 Consegna: Bancarella 8 – coordinate -505 64 22, davanti all’ospedale`,
        { parse_mode: "Markdown" }
      );
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGE (COMMENTO)
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  const userId = Number(msg.from.id);
  const chatId = msg.chat.id;
  const state = reviewState.get(userId);

  if (state && state.waitingComment) {
    reviewState.delete(userId);
    saveReview({ rating: state.rating, comment: escapeMarkdown(msg.text) });

    const avg = getAverage();
    const total = loadReviews().length;

    bot.sendMessage(chatId,
      `✅ Recensione inviata correttamente!\n⭐ Voto: ${state.rating}/5\n💬 Commento: ${escapeMarkdown(msg.text)}\n📊 Media attuale: ${avg} (${total} voti)`);

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(id,
        `⭐ Nuova recensione\n👤 ${msg.from.first_name}\n⭐ ${state.rating}/5\n💬 ${escapeMarkdown(msg.text)}`);
    });
  }
});