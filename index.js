import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_IDS = process.env.ADMIN_ID?.split(",").map(id => Number(id.trim())) || [];

if (!TOKEN || ADMIN_IDS.length === 0) {
  console.error("❌ TELEGRAM_TOKEN o ADMIN_ID mancanti");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

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

const reviewState = new Map(); // userId -> { rating, waitingComment }
const reviewCooldown = new Map();
const REVIEW_COOLDOWN_MS = 60 * 1000;

// helper markdown
const escapeMarkdown = (text) => text.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

// =====================
// START
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `👋 Benvenuto! Usa /review per lasciare una recensione.`);
});

// =====================
// COMMAND /REVIEW
// =====================
bot.onText(/\/review/, (msg) => {
  const chatId = msg.chat.id;
  const userId = Number(msg.from.id);
  const now = Date.now();
  const last = reviewCooldown.get(userId) || 0;

  if (now - last < REVIEW_COOLDOWN_MS) {
    bot.sendMessage(chatId, "⏳ Devi attendere prima di lasciare un'altra recensione.");
    return;
  }

  reviewCooldown.set(userId, now);

  bot.sendMessage(chatId, "⭐ Seleziona un voto da 1 a 5:", {
    reply_markup: {
      inline_keyboard: [[
        { text: "⭐ 1", callback_data: "RATE_1" },
        { text: "⭐ 2", callback_data: "RATE_2" },
        { text: "⭐ 3", callback_data: "RATE_3" },
        { text: "⭐ 4", callback_data: "RATE_4" },
        { text: "⭐ 5", callback_data: "RATE_5" }
      ]]
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
    reviewState.set(userId, { rating, waitingComment: true });

    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });

    bot.sendMessage(chatId,
      `Hai votato ⭐ ${rating}/5\nVuoi lasciare un commento?`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "⏭️ Skip", callback_data: "SKIP_REVIEW" }]]
        }
      }
    );
    return;
  }

  // ⭐ skip
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
    bot.sendMessage(chatId,
      `✅ Recensione inviata correttamente!\n⭐ Voto: ${state.rating}/5\n📊 Media attuale: ${avg} (${total} voti)`);

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(id,
        `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${state.rating}/5\n💬 Nessun commento`);
    });
    return;
  }
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