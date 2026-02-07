import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);
const ADMINS_FILE = "./admins.json";

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ TELEGRAM_TOKEN o SUPER_ADMIN mancante");
  process.exit(1);
}

// =====================
// FILE ADMINS
// =====================
if (!fs.existsSync(ADMINS_FILE)) fs.writeFileSync(ADMINS_FILE, JSON.stringify([SUPER_ADMIN]));

const loadAdmins = () => JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8"));
const saveAdmins = (admins) => fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));

let ADMINS = new Set(loadAdmins());

// =====================
// BOT
// =====================
const bot = new TelegramBot(TOKEN, { polling: true });

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
const reviewState = new Map();    // userId -> { rating, chatId }
const reviewCooldown = new Map(); // userId -> timestamp
const userState = new Map();      // userId -> tipo modulo
const adminReplyMap = {};         // adminId -> userId
const REVIEW_COOLDOWN_MS = 60 * 1000;

// =====================
// HELPERS
// =====================
const escapeMarkdown = (text) => text.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

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
  const chatId = q.message.chat.id;

  // ⭐ Recensione
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    const now = Date.now();
    if (now - (reviewCooldown.get(userId) || 0) < REVIEW_COOLDOWN_MS) {
      bot.answerCallbackQuery(q.id, { text: "⏳ Attendi un po’ prima di votare", show_alert: true });
      return;
    }

    reviewCooldown.set(userId, now);
    reviewState.set(userId, { rating, chatId });

    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });
    bot.sendMessage(chatId,
      `Hai votato ⭐ *${rating}/5*\nVuoi lasciare un commento?`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]] } }
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
      `✅ Recensione inviata correttamente!\n⭐ Voto: ${rating}/5\n📊 Media attuale: ${avg} (${total} voti)`,
      { parse_mode: "Markdown" }
    );

    ADMINS.forEach(id => {
      bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n💬 Nessun commento`);
    });

    reviewState.delete(userId);
    return;
  }

  // Menu
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, `⭐ *Lascia una recensione*\nSeleziona un voto da 1 a 5 stelle:`, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[
          { text: "⭐ 1", callback_data: "RATE_1" },
          { text: "⭐ 2", callback_data: "RATE_2" },
          { text: "⭐ 3", callback_data: "RATE_3" },
          { text: "⭐ 4", callback_data: "RATE_4" },
          { text: "⭐ 5", callback_data: "RATE_5" }
        ]] }
      });
      break;

    case "OPEN_LISTINO":
      bot.sendMessage(chatId, `📄 *Listino CapyBar*\nVisualizza tutti i dettagli qui: https://telegra.ph/Listino-CapyBar-02-07`, { parse_mode: "Markdown" });
      break;

    case "OPEN_ASTA":
      userState.set(userId, "ASTA");
      bot.sendMessage(chatId,
`🏷️ *Modulo Asta*

Scrivi in un unico messaggio:

1️⃣ *Nickname*  
2️⃣ *Oggetto/i*  
3️⃣ *Prezzo base*  
4️⃣ *Rilancio`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ORDINI":
      userState.set(userId, "ORDINE");
      bot.sendMessage(chatId,
`📝 *Modulo Ordinazioni*

Scrivi in un unico messaggio:

1️⃣ *Nickname*  
2️⃣ *@ Telegram*  
3️⃣ *Prodotti desiderati*`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASSISTENZA":
      userState.set(userId, "ASSISTENZA");
      bot.sendMessage(chatId,
`🆘 *Assistenza*

Se hai bisogno di aiuto o supporto contatta un admin direttamente o scrivi qui la tua richiesta`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_SPONSOR":
      userState.set(userId, "SPONSOR");
      bot.sendMessage(chatId,
`📢 *Richiesta Sponsor*

Scrivi in un unico messaggio il tipo, durata e dettagli aggiuntivi`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_CANDIDATURA":
      userState.set(userId, "CANDIDATURA");
      bot.sendMessage(chatId,
`📝 *Modulo Candidatura Dipendente*

Compila il tuo curriculum seguendo questi punti:

1️⃣ *Dati personali*: @ Telegram, Discord, telefono, nome e ore disponibili  
2️⃣ *Parlaci di te*: chi sei, passioni, motivazioni  
3️⃣ *Perché dovremmo sceglierti?*  
4️⃣ *Esperienze lavorative*: se presenti e se attualmente lavori in un’azienda  
5️⃣ *Competenze pratiche*: uso della cassa e capacità di cucinare  
6️⃣ *Pregi e difetti*

📍 *Consegna del curriculum*: Bancarella 8, coordinate -505 64 22, davanti all’ospedale`,
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
  if (!msg.text) return;
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // Recensione
  if (reviewState.has(userId)) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);
    saveReview({ rating, comment: msg.text, userId });

    const avg = getAverage();
    const total = loadReviews().length;

    bot.sendMessage(chatId,
      `✅ Recensione inviata correttamente!\n⭐ Voto: ${rating}/5\n💬 Commento: ${escapeMarkdown(msg.text)}\n📊 Media attuale: ${avg} (${total} voti)`
    );

    ADMINS.forEach(id => {
      bot.sendMessage(id, `⭐ Recensione\n👤 ${msg.from.first_name}\n⭐ ${rating}/5\n💬 ${escapeMarkdown(msg.text)}`);
    });
    return;
  }

  // Moduli / Assistenza
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);

    bot.sendMessage(chatId, type === "ASSISTENZA" ? "✅ Messaggio inviato correttamente!" : "✅ Modulo inviato con successo!");

    ADMINS.forEach(id => {
      bot.sendMessage(id,
        `📩 *${type}*\n👤 ${msg.from.first_name} (@${msg.from.username || "nessuno"})\n🆔 ${userId}\n\n${escapeMarkdown(msg.text)}`,
        { parse_mode: "Markdown" }
      );
      adminReplyMap[id] = chatId;
    });
    return;
  }

  // Admin risponde a utenti
  if (ADMINS.has(userId)) {
    const targetUser = adminReplyMap[userId];
    if (targetUser) {
      bot.sendMessage(targetUser, `💬 *Risposta da ${msg.from.first_name}:*\n\n${escapeMarkdown(msg.text)}`, { parse_mode: "Markdown" });
      bot.sendMessage(chatId, "✅ Risposta inviata all'utente");
      
      // notifico tutti gli altri admin
      ADMINS.forEach(id => {
        if (id !== userId) {
          bot.sendMessage(id, `💬 ${msg.from.first_name} ha risposto a ${targetUser}: ${escapeMarkdown(msg.text)}`, { parse_mode: "Markdown" });
        }
      });
      delete adminReplyMap[userId];
      return;
    }
  }
});

// =====================
// COMANDI ADMIN
// =====================
bot.onText(/\/admin add (\d+)/, (msg, match) => {
  const fromId = msg.from.id;
  if (fromId !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può usare questo comando");
  const newAdmin = Number(match[1]);
  ADMINS.add(newAdmin);
  saveAdmins(Array.from(ADMINS));
  bot.sendMessage(msg.chat.id, `✅ Utente ${newAdmin} aggiunto come admin`);
});

bot.onText(/\/admin remove (\d+)/, (msg, match) => {
  const fromId = msg.from.id;
  if (fromId !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può usare questo comando");
  const removeAdmin = Number(match[1]);
  ADMINS.delete(removeAdmin);
  saveAdmins(Array.from(ADMINS));
  bot.sendMessage(msg.chat.id, `✅ Utente ${removeAdmin} rimosso dagli admin`);
});

// =====================
// COMANDO /id
// =====================
bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`);
});