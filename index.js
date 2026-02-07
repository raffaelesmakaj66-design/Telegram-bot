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

// =====================
// IMMAGINE DI BENVENUTO
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ"; // ← metti qui il file_id corretto
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

// =====================
// FILE RECENSIONI
// =====================
const REVIEWS_FILE = "./reviews.json";
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, JSON.stringify([]));

const loadReviews = () => JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));
const saveReviews = (reviews) => fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));

const saveReview = (review) => {
  const reviews = loadReviews();
  reviews.push(review);
  saveReviews(reviews);
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
const reviewState = new Map(); // userId -> { rating, chatId, waitingComment }
const reviewCooldown = new Map();
const REVIEW_COOLDOWN_MS = 60 * 1000;

// utenti in assistenza o moduli
const assistenzaUsers = new Set(); 

// admin -> utente per risposta assistenza
const adminReplyMap = {};

// helper markdown
const escapeMarkdown = (text) => text.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendPhoto(chatId, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei seguenti bottoni per continuare:`,
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
        [{ text: "⭐ Lascia una Recensione", callback_data: "OPEN_REVIEW" }],
        [{ text: "📢 Richiedi uno Sponsor", callback_data: "OPEN_SPONSOR" }],
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
  const chatId = q.message?.chat?.id || q.from.id;

  // ⭐ Rating recensione
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    const now = Date.now();
    const last = reviewCooldown.get(userId) || 0;

    if (now - last < REVIEW_COOLDOWN_MS) {
      bot.answerCallbackQuery(q.id, { text: "⏳ Attendi prima di lasciare un'altra recensione", show_alert: true });
      return;
    }

    reviewCooldown.set(userId, now);
    reviewState.set(userId, { rating, chatId, waitingComment: true });

    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });

    bot.sendMessage(chatId,
      `Hai votato ⭐ ${rating}/5\nVuoi lasciare un commento?`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]]
        }
      }
    );
    return;
  }

  // ⭐ Skip recensione
  if (q.data.startsWith("SKIP_")) {
    const rating = Number(q.data.split("_")[1]);
    saveReview({ rating, comment: null, userId });

    const avg = getAverage();
    const total = loadReviews().length;

    bot.answerCallbackQuery(q.id, { text: "Recensione inviata!" });
    bot.sendMessage(chatId,
      `✅ Recensione inviata correttamente!\n⭐ Voto: ${rating}/5\n📊 Media attuale: ${avg} (${total} voti)`);

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n💬 Nessun commento`);
    });

    reviewState.delete(userId);
    return;
  }

  // =====================
  // Menu
  // =====================
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, `⭐ *Lascia una recensione*\nSeleziona un voto da 1 a 5:`, {
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
      });
      break;

    case "OPEN_LISTINO":
      bot.sendMessage(chatId,
        `📄 *Listino Sponsor*\n• Base → 1k\n• Medio → 2.5k\n• Premium → 5k\n• Elite → 10k`,
        { parse_mode: "Markdown" });
      break;

    case "OPEN_ASTA":
      assistenzaUsers.add(chatId);
      bot.sendMessage(chatId,
        `🏷️ *Modulo Asta*\n\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ Oggetto/i\n3️⃣ Prezzo base\n4️⃣ Rilancio`,
        { parse_mode: "Markdown" });
      break;

    case "OPEN_ORDINI":
      assistenzaUsers.add(chatId);
      bot.sendMessage(chatId,
        `📝 *Modulo Ordinazioni*\n\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti desiderati`,
        { parse_mode: "Markdown" });
      break;

    case "OPEN_ASSISTENZA":
      assistenzaUsers.add(chatId);
      bot.sendMessage(chatId, "🆘 Scrivi il tuo messaggio per l’assistenza. Sarà inviato agli admin.", { parse_mode: "Markdown" });
      break;

    case "OPEN_SPONSOR":
      bot.sendMessage(chatId,
        `⭐ *Sponsor*\n• Base → 1k\n• Medio → 2.5k\n• Premium → 5k\n• Elite → 10k`,
        { parse_mode: "Markdown" });
      break;

    case "OPEN_CANDIDATURA":
      assistenzaUsers.add(chatId);
      bot.sendMessage(chatId,
        `📝 *Come fare il curriculum*\n\nCompila il tuo curriculum seguendo questi punti:\n\n` +
        `1️⃣ *Dati personali*: @ Telegram, Discord, telefono, nome, ore totali e settimanali (/tempo)\n` +
        `2️⃣ *Parlaci di te*: chi sei, passioni...\n` +
        `3️⃣ *Perché dovremmo sceglierti*\n` +
        `4️⃣ *Esperienze lavorative*: se presenti e se lavori attualmente in un’azienda\n` +
        `5️⃣ *Competenze*: uso della cassa e capacità di cucinare\n` +
        `6️⃣ *Pregi e difetti*\n\n` +
        `📍 *Consegna del curriculum*: Bancarella 8, coordinate -505 64 22, davanti all’ospedale`,
        { parse_mode: "Markdown" });
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGE (COMMENTO / MODULI / ASSISTENZA)
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = Number(msg.from.id);

  // ⭐ Commento recensione
  const state = reviewState.get(userId);
  if (state && state.waitingComment) {
    reviewState.delete(userId);
    saveReview({ rating: state.rating, comment: escapeMarkdown(msg.text), userId });

    const avg = getAverage();
    const total = loadReviews().length;

    bot.sendMessage(chatId,
      `✅ Recensione inviata correttamente!\n⭐ Voto: ${state.rating}/5\n💬 Commento: ${escapeMarkdown(msg.text)}\n📊 Media attuale: ${avg} (${total} voti)`);

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${msg.from.first_name}\n⭐ ${state.rating}/5\n💬 ${escapeMarkdown(msg.text)}`);
    });
    return;
  }

  // =====================
  // Moduli / Assistenza
  if (assistenzaUsers.has(chatId)) {
    bot.sendMessage(chatId, "✅ Messaggio inviato correttamente!");

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(id,
        `📩 *Nuovo modulo / assistenza*\n\n👤 ${msg.from.first_name} (@${msg.from.username || "nessuno"})\n🆔 ${msg.from.id}\n\n${escapeMarkdown(msg.text)}`,
        { parse_mode: "Markdown" }
      );
      adminReplyMap[id] = chatId; // permette rispondere all'utente
    });
    return;
  }

  // Messaggi generici
  bot.sendMessage(chatId, "✅ Modulo inviato correttamente!");
  ADMIN_IDS.forEach(id => {
    bot.sendMessage(id,
      `📥 *Nuovo messaggio*\n\n👤 ${msg.from.first_name}\n🆔 ${msg.from.id}\n\n${escapeMarkdown(msg.text)}`,
      { parse_mode: "Markdown" }
    );
  });
});

// =====================
// COMANDO /delreview (solo admin)
// =====================
bot.onText(/\/delreview(?: (\d+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = Number(msg.from.id);

  if (!ADMIN_IDS.includes(fromId)) {
    bot.sendMessage(chatId, "❌ Non sei autorizzato a usare questo comando.");
    return;
  }

  let reviews = loadReviews();
  if (reviews.length === 0) {
    bot.sendMessage(chatId, "⚠️ Nessuna recensione presente.");
    return;
  }

  const targetUserId = match[1] ? Number(match[1]) : null;

  if (targetUserId) {
    const beforeCount = reviews.length;
    reviews = reviews.filter(r => r.userId !== targetUserId);
    saveReviews(reviews);
    const removed = beforeCount - reviews.length;
    bot.sendMessage(chatId, `✅ Eliminate ${removed} recensioni dell'utente ${targetUserId}.`);
  } else {
    const removedReview = reviews.pop();
    saveReviews(reviews);
    bot.sendMessage(chatId, `✅ Eliminata l'ultima recensione di ⭐ ${removedReview.rating}/5.`);
  }
});