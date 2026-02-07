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
// COSTANTI
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";
const DATA_FILE = path.join(process.cwd(), "chatlog.json");

// =====================
// MEMO
// =====================
const reviewState = new Map();        // userId -> { rating, chatId }
const reviewCooldown = new Map();
const userState = new Map();          // userId -> tipo modulo
const pendingUsers = new Map();       // userId -> boolean
const adminReplyMap = {};             // adminId -> userId
const ADMINS = new Set([SUPER_ADMIN]);
const REVIEW_COOLDOWN_MS = 60 * 1000;

// =====================
// FUNZIONI
// =====================
const escape = (t) => t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

const saveLog = (entry) => {
  let logs = [];
  if (fs.existsSync(DATA_FILE)) logs = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  logs.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(logs, null, 2));
};

const getAllAdmins = () => ADMINS;

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
// CALLBACK QUERY
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
    saveLog({ type: "review", rating, comment: null, userId, timestamp: new Date().toISOString() });
    bot.sendMessage(chatId, `✅ Recensione inviata!\n⭐ ${rating}/5`);

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
    saveLog({ type:"review", rating, comment: msg.text, userId, timestamp: new Date().toISOString() });

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
      adminReplyMap[id] = chatId; // collega admin → utente
      ADMINS.add(id);
    });
  }
});

// =====================
// RISPOSTA ADMIN CLICCANDO "RISPOSTA"
// =====================
bot.on("message", (msg) => {
  const adminId = msg.from.id;
  if (!ADMINS.has(adminId)) return;
  const targetUser = adminReplyMap[adminId];
  if (!targetUser || msg.text.startsWith("/")) return;

  bot.sendMessage(targetUser,
    `💬 *Risposta da ${msg.from.first_name}:*\n\n${escape(msg.text)}`,
    { parse_mode:"Markdown" }
  );

  bot.sendMessage(adminId, "✅ Risposta inviata all’utente");
  delete adminReplyMap[adminId];
  saveLog({ type:"admin_reply", adminId, userId: targetUser, text: msg.text, timestamp: new Date().toISOString() });
});

// =====================
// COMANDO /id
// =====================
bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`);
});