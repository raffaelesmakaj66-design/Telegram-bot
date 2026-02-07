import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ Config mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// =====================
// FILE DATI
// =====================
const ADMINS_FILE = path.join(process.cwd(), "admins.json");
const CHATLOG_FILE = path.join(process.cwd(), "chatlog.json");
const REVIEWS_FILE = path.join(process.cwd(), "reviews.json");

// ======= Creazione file se non esistono =======
if (!fs.existsSync(ADMINS_FILE)) fs.writeFileSync(ADMINS_FILE, JSON.stringify([SUPER_ADMIN], null, 2));
if (!fs.existsSync(CHATLOG_FILE)) fs.writeFileSync(CHATLOG_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, JSON.stringify([], null, 2));

// =====================
// FUNZIONI UTILI
// =====================
const loadAdmins = () => JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8"));
const saveAdmins = (admins) => fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));

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

const escapeMarkdown = (text) => text.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

// =====================
// STATI
// =====================
const reviewState = new Map(); // userId -> { rating, chatId, waitingComment }
const reviewCooldown = new Map();
const REVIEW_COOLDOWN_MS = 60 * 1000;

const userState = new Map(); // userId -> tipo modulo
const adminReplyMap = {};     // adminId -> userId

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

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
  const chatId = q.message.chat.id;
  const admins = loadAdmins();

  // ⭐ Rating recensione
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    const now = Date.now();
    if (now - (reviewCooldown.get(userId) || 0) < REVIEW_COOLDOWN_MS) {
      bot.answerCallbackQuery(q.id, { text: "⏳ Attendi un po’", show_alert: true });
      return;
    }

    reviewCooldown.set(userId, now);
    reviewState.set(userId, { rating, chatId, waitingComment: true });

    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });
    bot.sendMessage(chatId,
      `Hai votato ⭐ ${rating}/5\nVuoi lasciare un commento?`,
      { reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]] } }
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

    admins.forEach(id => {
      bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n💬 Nessun commento`);
    });

    reviewState.delete(userId);
    return;
  }

  // =====================
  // MENU
  // =====================
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, `⭐ *Lascia una recensione*\nSeleziona un voto da 1 a 5 stelle ⭐`, {
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
      bot.sendMessage(chatId, `📄 *Listino Sponsor*\n• Base → 1k\n• Medio → 2.5k\n• Premium → 5k\n• Elite → 10k`, { parse_mode:"Markdown" });
      break;

    case "OPEN_ASTA":
      userState.set(userId, "ASTA");
      bot.sendMessage(chatId,
        `🏷️ *Modulo Asta*\n\nScrivi in un unico messaggio:\n1️⃣ *Nickname*\n2️⃣ *Oggetto/i*\n3️⃣ *Prezzo base*\n4️⃣ *Rilancio*`,
        { parse_mode: "Markdown" });
      break;

    case "OPEN_ORDINI":
      userState.set(userId, "ORDINE");
      bot.sendMessage(chatId,
        `📝 *Modulo Ordinazioni*\n\nScrivi in un unico messaggio:\n1️⃣ *Nickname*\n2️⃣ *@ Telegram*\n3️⃣ *Prodotti desiderati*`,
        { parse_mode: "Markdown" });
      break;

    case "OPEN_ASSISTENZA":
      userState.set(userId, "ASSISTENZA");
      bot.sendMessage(chatId,
        `🆘 *Assistenza*\n\nSe hai bisogno di aiuto o supporto contatta un admin direttamente o scrivi qui la tua richiesta.`,
        { parse_mode: "Markdown" });
      break;

    case "OPEN_SPONSOR":
      userState.set(userId, "SPONSOR");
      bot.sendMessage(chatId,
        `📢 *Richiedi uno Sponsor*\nScrivi in un unico messaggio il tipo, durata e dettagli aggiuntivi`,
        { parse_mode: "Markdown" });
      break;

    case "OPEN_CANDIDATURA":
      bot.sendMessage(chatId,
        `📝 *Modulo Candidatura Dipendente*\n\nCompila il tuo curriculum seguendo questi punti:\n\n` +
        `1️⃣ *Dati personali*: @ Telegram, Discord, nome, ore totali e settimanali (/tempo)\n` +
        `2️⃣ *Parlaci di te*: chi sei, passioni, motivazioni\n` +
        `3️⃣ *Perché dovremmo sceglierti?*\n` +
        `4️⃣ *Esperienze lavorative*: se presenti e se lavori attualmente in un’azienda\n` +
        `5️⃣ *Competenze pratiche*: uso della cassa, capacità di cucinare\n` +
        `6️⃣ *Pregi e difetti*\n\n` +
        `📍 *Consegna del curriculum*: Bancarella 8, coordinate -505 64 22, davanti all’ospedale`,
        { parse_mode: "Markdown" });
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI UTENTE
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = Number(msg.from.id);
  const admins = loadAdmins();

  // COMMENTO RECENSIONE
  const state = reviewState.get(userId);
  if (state && state.waitingComment) {
    reviewState.delete(userId);
    saveReview({ rating: state.rating, comment: escapeMarkdown(msg.text), userId });

    const avg = getAverage();
    const total = loadReviews().length;

    bot.sendMessage(chatId,
      `✅ Recensione inviata correttamente!\n⭐ Voto: ${state.rating}/5\n💬 Commento: ${escapeMarkdown(msg.text)}\n📊 Media attuale: ${avg} (${total} voti)`);

    admins.forEach(id => {
      bot.sendMessage(id,
        `⭐ Nuova recensione\n👤 ${msg.from.first_name}\n⭐ ${state.rating}/5\n💬 ${escapeMarkdown(msg.text)}`,
        { parse_mode: "Markdown" });
    });
    return;
  }

  // MODULI / ASSISTENZA
  const currentState = userState.get(userId);
  if (currentState) {
    userState.delete(userId);

    let responseText = currentState === "ASSISTENZA"
      ? "✅ Messaggio inviato correttamente!"
      : "✅ Modulo inviato con successo!";

    bot.sendMessage(chatId, responseText);

    admins.forEach(id => {
      bot.sendMessage(id,
        `📩 *${currentState}*\n👤 ${msg.from.first_name} (@${msg.from.username || "nessuno"})\n🆔 ${userId}\n\n${escapeMarkdown(msg.text)}`,
        { parse_mode: "Markdown" }
      );
      adminReplyMap[id] = userId; // collega admin → utente
    });
  }
});