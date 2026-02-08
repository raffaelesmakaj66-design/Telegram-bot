import TelegramBot from "node-telegram-bot-api";
import sqlite3 from "sqlite3";
sqlite3.verbose();

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN) {
  console.error("❌ TELEGRAM_TOKEN mancante!");
  process.exit(1);
}

if (!SUPER_ADMIN) {
  console.error("❌ SUPER_ADMIN mancante!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Bot avviato correttamente");

// =====================
// DATABASE (SQLite locale, attenzione: non persistente su Railway)
// =====================
const db = new sqlite3.Database("./bot.db", (err) => {
  if (err) console.error("❌ Errore DB:", err.message);
  else console.log("✅ DB SQLite aperto");
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      rating INTEGER,
      comment TEXT,
      created_at TEXT
    )
  `);
});

// =====================
// ADMIN
// =====================
const ADMINS = new Set();
db.all("SELECT id FROM admins", [], (err, rows) => {
  if (err) console.error(err);
  else if (rows) rows.forEach(r => ADMINS.add(r.id));

  if (!ADMINS.has(SUPER_ADMIN)) {
    db.run("INSERT OR IGNORE INTO admins (id) VALUES (?)", [SUPER_ADMIN]);
    ADMINS.add(SUPER_ADMIN);
    console.log(`✅ SUPER_ADMIN aggiunto: ${SUPER_ADMIN}`);
  }
});

// =====================
// STATO
// =====================
const reviewState = new Map();
const reviewCooldown = new Map();
const userState = new Map();
const adminReplyMap = {};
const REVIEW_COOLDOWN_MS = 60 * 1000;

// =====================
// HELPERS
// =====================
const escape = (t) => t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");
const getAverage = (callback) => {
  db.get("SELECT AVG(rating) as avg FROM reviews", [], (err, row) => {
    callback(row && row.avg ? row.avg.toFixed(1) : "0.0");
  });
};

// =====================
// START
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  db.run("INSERT OR IGNORE INTO users (id) VALUES (?)", [userId]);

  bot.sendMessage(chatId, `👋 Benvenuto! Usa i bottoni per interagire:`);
});

// =====================
// CALLBACK QUERY (Recensioni semplificate)
// =====================
bot.on("callback_query", (q) => {
  const userId = q.from.id;
  const chatId = q.message.chat.id;

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
    bot.sendMessage(chatId, `Hai votato ⭐ ${rating}/5\nVuoi lasciare un commento?`, {
      reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]] }
    });
    return;
  }

  if (q.data.startsWith("SKIP_")) {
    const rating = Number(q.data.split("_")[1]);
    db.run(
      "INSERT INTO reviews (user_id, rating, comment, created_at) VALUES (?, ?, ?, ?)",
      [userId, rating, null, new Date().toISOString()],
      (err) => {
        if (err) console.error(err);
        getAverage(avg => bot.sendMessage(chatId, `✅ Recensione inviata! ⭐ ${rating}/5\nMedia attuale: ${avg}`));
      }
    );
    reviewState.delete(userId);
    bot.answerCallbackQuery(q.id);
    return;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI UTENTE
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (reviewState.has(userId)) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);

    db.run(
      "INSERT INTO reviews (user_id, rating, comment, created_at) VALUES (?, ?, ?, ?)",
      [userId, rating, msg.text, new Date().toISOString()],
      (err) => {
        if (err) console.error(err);
        getAverage(avg => bot.sendMessage(chatId, `✅ Recensione inviata!\n⭐ ${rating}/5\n💬 Commento: ${escape(msg.text)}\nMedia: ${avg}`));
      }
    );
    return;
  }
});