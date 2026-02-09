import TelegramBot from "node-telegram-bot-api";
import sqlite3 from "sqlite3";
sqlite3.verbose();

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ ENV mancanti");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Bot avviato");

// =====================
// DATABASE
// =====================
const db = new sqlite3.Database("./bot.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY)`);
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY)`);
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
db.all("SELECT id FROM admins", [], (_, rows) => {
  rows?.forEach(r => ADMINS.add(r.id));
  if (!ADMINS.has(SUPER_ADMIN)) {
    db.run("INSERT OR IGNORE INTO admins (id) VALUES (?)", [SUPER_ADMIN]);
    ADMINS.add(SUPER_ADMIN);
  }
});

// =====================
// STATI
// =====================
const reviewState = new Map();
const reviewCooldown = new Map();
const userState = new Map();
const sponsorState = new Map();
const activeChats = new Map();
const REVIEW_COOLDOWN_MS = 60 * 1000;

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

// =====================
// UTILS
// =====================
const escape = t => t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");
const getAverage = cb => {
  db.get("SELECT AVG(rating) avg FROM reviews", [], (_, r) =>
    cb(r?.avg ? r.avg.toFixed(1) : "0.0")
  );
};

// =====================
// /start
// =====================
bot.onText(/\/start/, msg => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  userState.delete(userId);
  reviewState.delete(userId);
  sponsorState.delete(userId);
  activeChats.delete(userId);

  db.run("INSERT OR IGNORE INTO users (id) VALUES (?)", [userId]);

  bot.sendPhoto(chatId, WELCOME_IMAGE, {
    caption: "👋 *Benvenuto nel bot ufficiale di CapyBar!*",
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📣 Canale", url: CHANNEL_URL }],
        [{ text: "⚖️ Aste", callback_data: "OPEN_ASTA" }, { text: "📄 Listino", callback_data: "OPEN_LISTINO" }],
        [{ text: "📝 Ordina", callback_data: "OPEN_ORDINI" }, { text: "🆘 Assistenza", callback_data: "OPEN_ASSISTENZA" }],
        [{ text: "⭐ Lascia una Recensione", callback_data: "OPEN_REVIEW" }],
        [{ text: "📢 Richiedi uno Sponsor", callback_data: "OPEN_SPONSOR" }],
        [{ text: "💼 Candidati dipendente", callback_data: "OPEN_CANDIDATURA" }]
      ]
    }
  });
});

// =====================
// CALLBACK
// =====================
bot.on("callback_query", q => {
  const userId = q.from.id;
  const chatId = q.message.chat.id;

  // SPONSOR FLOW
  if (q.data === "OPEN_SPONSOR") {
    sponsorState.set(userId, { step: "INFO" });
    bot.sendMessage(chatId,
      "*📢 Prezzi Sponsor:*\n\n**12h** » 500\n**24h** » 1000\n**36h** » 1600\n**48h** » 2100\n**Permanente** » 3200",
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "✅ Continua", callback_data: "SPONSOR_CONTINUA" }]] }
      }
    );
  }

  if (q.data === "SPONSOR_CONTINUA") {
    sponsorState.set(userId, { step: "DURATA" });
    bot.sendMessage(chatId, "Seleziona il tempo di durata della sponsor:", {
      reply_markup: {
        inline_keyboard: [
          ["12h","24h","36h","48h","Permanente"].map(x => ({ text: x, callback_data: `SP_${x}` }))
        ]
      }
    });
  }

  if (q.data.startsWith("SP_")) {
    sponsorState.set(userId, { step: "TESTO", durata: q.data.replace("SP_","") });
    bot.sendMessage(chatId, "Ora invia il testo del messaggio sponsor:");
  }

  // MENU
  if (q.data === "OPEN_ASTA") userState.set(userId, "ASTA"), bot.sendMessage(chatId,"🏷️ *Modulo Asta*",{parse_mode:"Markdown"});
  if (q.data === "OPEN_ORDINI") userState.set(userId, "ORDINE"), bot.sendMessage(chatId,"📝 *Modulo Ordini*",{parse_mode:"Markdown"});
  if (q.data === "OPEN_ASSISTENZA") userState.set(userId, "ASSISTENZA"), bot.sendMessage(chatId,"🆘 *Assistenza*",{parse_mode:"Markdown"});
  if (q.data === "OPEN_CANDIDATURA") userState.set(userId, "CANDIDATURA"), bot.sendMessage(chatId,"💼 *Candidatura*",{parse_mode:"Markdown"});

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGE
// =====================
bot.on("message", msg => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // CHAT CONTINUA UTENTE → ADMIN
  if (activeChats.has(userId) && !ADMINS.has(userId)) {
    bot.sendMessage(activeChats.get(userId),
      `💬 *Messaggio da ${msg.from.first_name}*\n\n${escape(msg.text)}`,
      { parse_mode:"Markdown" }
    );
    return;
  }

  // SPONSOR TESTO
  if (sponsorState.get(userId)?.step === "TESTO") {
    const d = sponsorState.get(userId).durata;
    sponsorState.delete(userId);
    ADMINS.forEach(a =>
      bot.sendMessage(a,
        `📢 *Nuovo Sponsor*\n👤 ${msg.from.first_name}\n🕒 ${d}\n\n${escape(msg.text)}`,
        { parse_mode:"Markdown" }
      )
    );
    bot.sendMessage(chatId,"✅ Sponsor inviato!");
    return;
  }

  // MODULI
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);

    ADMINS.forEach(a => {
      activeChats.set(userId,a);
      activeChats.set(a,userId);
      bot.sendMessage(a,
        `📩 *${type}*\n👤 ${msg.from.first_name}\n🆔 ${userId}\n\n${escape(msg.text)}`,
        { parse_mode:"Markdown" }
      );
    });

    bot.sendMessage(chatId,"✅ Messaggio inviato!");
    return;
  }

  // CHAT CONTINUA ADMIN → UTENTE
  if (ADMINS.has(userId) && activeChats.has(userId)) {
    bot.sendMessage(activeChats.get(userId),
      `💬 *Risposta admin:*\n\n${escape(msg.text)}`,
      { parse_mode:"Markdown" }
    );
  }
});

// =====================
// ADMIN COMMANDS
// =====================
bot.onText(/\/admin add (\d+)/, (m,[,id])=>{
  if(m.from.id!==SUPER_ADMIN)return;
  db.run("INSERT OR IGNORE INTO admins VALUES (?)",[id]);
  ADMINS.add(Number(id));
  bot.sendMessage(m.chat.id,"✅ Admin aggiunto");
});

bot.onText(/\/id/, m=>bot.sendMessage(m.chat.id,`🆔 ${m.from.id}`));