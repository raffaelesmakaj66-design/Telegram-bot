import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN); // solo lui può aggiungere/rimuovere admin
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
const REVIEWS_FILE = "./reviews.json";
const DATA_FILE = path.join(process.cwd(), "chatlog.json");

// =====================
// STATI
// =====================
const reviewState = new Map();          // userId -> { rating, chatId, waitingComment }
const reviewCooldown = new Map();       // userId -> timestamp
const REVIEW_COOLDOWN_MS = 60 * 1000;

const userState = new Map();            // userId -> tipo modulo/assistenza
const adminReplyMap = new Map();        // adminId -> { userId, chatId } per rispondere
const ADMINS = new Set([SUPER_ADMIN]);  // admin (super admin incluso)

// =====================
// HELPERS
// =====================
const escapeMarkdown = (text) => text.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

const loadReviews = () => fs.existsSync(REVIEWS_FILE) ? JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8")) : [];
const saveReviews = (reviews) => fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
const saveReview = (review) => { const r = loadReviews(); r.push(review); saveReviews(r); };
const getAverage = () => {
  const reviews = loadReviews();
  if (reviews.length === 0) return "0.0";
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  return (sum / reviews.length).toFixed(1);
};

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
// CALLBACK QUERY
// =====================
bot.on("callback_query", (q) => {
  const userId = Number(q.from.id);
  const chatId = q.message?.chat?.id || q.from.id;

  // ⭐ RECENSIONE
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
      `Hai votato ⭐ ${rating}/5\nScrivi un commento o premi Skip`,
      { reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]] } }
    );
    return;
  }

  if (q.data.startsWith("SKIP_")) {
    const rating = Number(q.data.split("_")[1]);
    saveReview({ rating, comment: null, userId });
    const avg = getAverage();
    const total = loadReviews().length;
    bot.answerCallbackQuery(q.id, { text: "Recensione inviata!" });
    bot.sendMessage(chatId,
      `✅ Recensione inviata correttamente!\n⭐ ${rating}/5\n📊 Media attuale: ${avg} (${total} voti)`
    );
    ADMINS.forEach(id =>
      bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n💬 Nessun commento`)
    );
    reviewState.delete(userId);
    return;
  }

  // MENU
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, "⭐ Scegli un voto:", {
        reply_markup: { inline_keyboard: [[1,2,3,4,5].map(n => ({ text:`⭐ ${n}`, callback_data:`RATE_${n}` }))] }
      });
      break;

    case "OPEN_LISTINO":
      bot.sendMessage(chatId,
        "*Listino Sponsor*\n• Base 1k\n• Medio 2.5k\n• Premium 5k\n• Elite 10k",
        { parse_mode: "Markdown" });
      break;

    case "OPEN_ASTA":
      userState.set(userId, "ASTA");
      bot.sendMessage(chatId,
        "*Modulo Asta*\n1️⃣ Nickname\n2️⃣ Oggetto\n3️⃣ Prezzo base\n4️⃣ Rilancio",
        { parse_mode: "Markdown" });
      break;

    case "OPEN_ORDINI":
      userState.set(userId, "ORDINE");
      bot.sendMessage(chatId,
        "*Modulo Ordini*\n1️⃣ Nickname\n2️⃣ @Telegram\n3️⃣ Prodotti",
        { parse_mode: "Markdown" });
      break;

    case "OPEN_ASSISTENZA":
      userState.set(userId, "ASSISTENZA");
      bot.sendMessage(chatId, "🆘 Scrivi il messaggio per l’assistenza");
      break;

    case "OPEN_SPONSOR":
      userState.set(userId, "SPONSOR");
      bot.sendMessage(chatId, "📢 Scrivi la richiesta sponsor");
      break;

    case "OPEN_CANDIDATURA":
      bot.sendMessage(chatId,
`📝 *Come fare il curriculum*
1️⃣ Dati personali
2️⃣ Parlaci di te
3️⃣ Perché dovremmo sceglierti
4️⃣ Esperienze
5️⃣ Competenze
6️⃣ Pregi e difetti

📍 Bancarella 8`, { parse_mode:"Markdown" });
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI UTENTE
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // COMMENTO RECENSIONE
  if (reviewState.has(userId)) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);
    saveReview({ rating, comment: escapeMarkdown(msg.text), userId });

    bot.sendMessage(chatId, "✅ Recensione inviata correttamente!");
    ADMINS.forEach(id =>
      bot.sendMessage(id,
        `⭐ Recensione\n👤 ${msg.from.first_name}\n⭐ ${rating}/5\n💬 ${escapeMarkdown(msg.text)}`,
        { parse_mode:"Markdown" }
      )
    );
    return;
  }

  // MODULI / ASSISTENZA
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);

    bot.sendMessage(chatId, type === "ASSISTENZA"
      ? "✅ Messaggio inviato correttamente!"
      : "✅ Modulo inviato con successo!");

    ADMINS.forEach(id => {
      bot.sendMessage(id,
        `📩 *${type}*\n👤 ${msg.from.first_name}\n🆔 ${userId}\n\n${escapeMarkdown(msg.text)}`,
        { parse_mode:"Markdown" }
      );
      adminReplyMap.set(id, { userId, chatId }); // tutti gli admin possono rispondere
    });
    return;
  }
});

// =====================
// RISPOSTA ADMIN
// =====================
bot.on("message", (msg) => {
  const adminId = msg.from.id;
  if (!ADMINS.has(adminId)) return;

  if (!adminReplyMap.has(adminId)) return;
  const { userId: targetId, chatId: targetChat } = adminReplyMap.get(adminId);

  if (msg.text.startsWith("/")) return;

  // Invio risposta all'utente
  bot.sendMessage(targetChat,
    `💬 *Risposta da ${msg.from.first_name}:*\n\n${escapeMarkdown(msg.text)}`,
    { parse_mode:"Markdown" }
  );

  // Conferma all'admin che ha risposto
  bot.sendMessage(adminId, "✅ Risposta inviata all’utente");

  // Notifica agli altri admin
  ADMINS.forEach(id => {
    if (id !== adminId) {
      bot.sendMessage(id,
        `💡 L’utente ${targetId} ha ricevuto una risposta da ${msg.from.first_name}:\n\n${escapeMarkdown(msg.text)}`,
        { parse_mode:"Markdown" }
      );
      // gli altri admin possono rispondere anche loro
      adminReplyMap.set(id, { userId: targetId, chatId: targetChat });
    }
  });
});

// =====================
// COMANDO /id
// =====================
bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`);
});

// =====================
// COMANDO /delreview (solo admin)
// =====================
bot.onText(/\/delreview(?: (\d+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = Number(msg.from.id);

  if (!ADMINS.has(fromId)) {
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