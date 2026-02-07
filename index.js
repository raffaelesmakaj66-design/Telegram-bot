import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_IDS = process.env.ADMIN_ID?.split(",").map(id => Number(id.trim())) || [];
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ Config mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

// =====================
// RECENSIONI
// =====================
const REVIEWS_FILE = "./reviews.json";
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, JSON.stringify([]));

const loadReviews = () => JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));
const saveReviews = (r) => fs.writeFileSync(REVIEWS_FILE, JSON.stringify(r, null, 2));
const saveReview = (review) => {
  const r = loadReviews();
  r.push(review);
  saveReviews(r);
};
const getAverage = () => {
  const r = loadReviews();
  if (!r.length) return "0.0";
  return (r.reduce((a, b) => a + b.rating, 0) / r.length).toFixed(1);
};

// =====================
// STATI
// =====================
const reviewState = new Map();        // userId -> { rating, chatId }
const reviewCooldown = new Map();
const userState = new Map();          // userId -> tipo modulo
const adminReplyMap = {};             // adminId -> userChatId

const REVIEW_COOLDOWN_MS = 60 * 1000;

// =====================
// UTILS
// =====================
const escape = (t) => t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");
const getAllAdmins = () => new Set([...ADMIN_IDS, SUPER_ADMIN]);

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  bot.sendPhoto(msg.chat.id, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei bottoni qui sotto 👇`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📣 Canale", url: CHANNEL_URL }],
        [{ text: "⚖️ Aste", callback_data: "OPEN_ASTA" }, { text: "📄 Listino", callback_data: "OPEN_LISTINO" }],
        [{ text: "📝 Ordina", callback_data: "OPEN_ORDINI" }, { text: "🆘 Assistenza", callback_data: "OPEN_ASSISTENZA" }],
        [{ text: "⭐ Lascia una Recensione", callback_data: "OPEN_REVIEW" }],
        [{ text: "📢 Richiedi Sponsor", callback_data: "OPEN_SPONSOR" }],
        [{ text: "💼 Candidati dipendente", callback_data: "OPEN_CANDIDATURA" }]
      ]
    }
  });
});

// =====================
// CALLBACK
// =====================
bot.on("callback_query", (q) => {
  const userId = q.from.id;
  const chatId = q.message.chat.id;

  // ⭐ RECENSIONE
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    const now = Date.now();
    if (now - (reviewCooldown.get(userId) || 0) < REVIEW_COOLDOWN_MS) {
      bot.answerCallbackQuery(q.id, { text: "⏳ Attendi un po’", show_alert: true });
      return;
    }

    reviewCooldown.set(userId, now);
    reviewState.set(userId, { rating, chatId });

    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });
    bot.sendMessage(chatId, `Hai votato ⭐ ${rating}/5\nScrivi un commento o premi Skip`, {
      reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]] }
    });
    return;
  }

  if (q.data.startsWith("SKIP_")) {
    const rating = Number(q.data.split("_")[1]);
    saveReview({ rating, comment: null, userId });

    const avg = getAverage();
    bot.sendMessage(chatId, `✅ Recensione inviata!\n⭐ ${rating}/5\n📊 Media: ${avg}`);
    getAllAdmins().forEach(id =>
      bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5`)
    );
    reviewState.delete(userId);
    return;
  }

  // MENU
  if (q.data === "OPEN_REVIEW") {
    bot.sendMessage(chatId, "⭐ Scegli un voto:", {
      reply_markup: { inline_keyboard: [[1,2,3,4,5].map(n => ({ text:`⭐ ${n}`, callback_data:`RATE_${n}` }))] }
    });
  }

  if (q.data === "OPEN_LISTINO") {
    bot.sendMessage(chatId, "*Listino Sponsor*\n• Base 1k\n• Medio 2.5k\n• Premium 5k\n• Elite 10k", { parse_mode:"Markdown" });
  }

  if (q.data === "OPEN_ASTA") {
    userState.set(userId, "ASTA");
    bot.sendMessage(chatId, "*Modulo Asta*\n1️⃣ Nickname\n2️⃣ Oggetto\n3️⃣ Prezzo base\n4️⃣ Rilancio", { parse_mode:"Markdown" });
  }

  if (q.data === "OPEN_ORDINI") {
    userState.set(userId, "ORDINE");
    bot.sendMessage(chatId, "*Modulo Ordini*\n1️⃣ Nickname\n2️⃣ @Telegram\n3️⃣ Prodotti", { parse_mode:"Markdown" });
  }

  if (q.data === "OPEN_ASSISTENZA") {
    userState.set(userId, "ASSISTENZA");
    bot.sendMessage(chatId, "🆘 Scrivi il messaggio per l’assistenza");
  }

  if (q.data === "OPEN_SPONSOR") {
    userState.set(userId, "SPONSOR");
    bot.sendMessage(chatId, "📢 Scrivi la richiesta sponsor");
  }

  if (q.data === "OPEN_CANDIDATURA") {
    bot.sendMessage(chatId,
`📝 *Come fare il curriculum*
1️⃣ Dati personali
2️⃣ Parlaci di te
3️⃣ Perché dovremmo sceglierti
4️⃣ Esperienze
5️⃣ Competenze
6️⃣ Pregi e difetti

📍 Bancarella 8`, { parse_mode:"Markdown" });
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // COMMENTO RECENSIONE
  if (reviewState.has(userId)) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);
    saveReview({ rating, comment: msg.text, userId });

    bot.sendMessage(chatId, "✅ Recensione inviata correttamente!");
    getAllAdmins().forEach(id =>
      bot.sendMessage(id, `⭐ Recensione\n👤 ${msg.from.first_name}\n⭐ ${rating}/5\n💬 ${escape(msg.text)}`, { parse_mode:"Markdown" })
    );
    return;
  }

  // MODULI / ASSISTENZA
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);

    bot.sendMessage(chatId, type === "ASSISTENZA"
      ? "✅ Messaggio ricevuto! Un admin risponderà a breve."
      : "✅ Modulo inviato con successo!");

    getAllAdmins().forEach(id => {
      bot.sendMessage(id,
        `📩 *${type}*\n👤 ${msg.from.first_name}\n🆔 ${userId}\n\n${escape(msg.text)}`,
        { parse_mode:"Markdown" }
      );
      adminReplyMap[id] = chatId;
    });
  }
});

// =====================
// /reply (ADMIN)
// =====================
bot.onText(/\/reply (.+)/, (msg, match) => {
  const adminId = msg.from.id;
  if (!getAllAdmins().has(adminId)) return;

  const target = adminReplyMap[adminId];
  if (!target) {
    bot.sendMessage(msg.chat.id, "❌ Nessun utente da rispondere");
    return;
  }

  bot.sendMessage(target,
    `💬 *Risposta da ${msg.from.first_name}:*\n\n${escape(match[1])}`,
    { parse_mode:"Markdown" }
  );

  bot.sendMessage(msg.chat.id, "✅ Risposta inviata all’utente");
  delete adminReplyMap[adminId];
});