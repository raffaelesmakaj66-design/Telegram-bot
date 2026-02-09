import TelegramBot from "node-telegram-bot-api";
import sqlite3 from "sqlite3";
sqlite3.verbose();

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ TOKEN o SUPER_ADMIN mancante");
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
    db.run("INSERT INTO admins (id) VALUES (?)", [SUPER_ADMIN]);
    ADMINS.add(SUPER_ADMIN);
  }
});

// =====================
// STATI
// =====================
const userState = new Map();        // ASTA / ORDINE / ASSISTENZA / CANDIDATURA
const reviewState = new Map();
const reviewCooldown = new Map();
const sponsorState = new Map();     // sponsor step
const activeChats = new Map();      // chat continua
const REVIEW_COOLDOWN_MS = 60000;

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

const escape = t => t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  const id = msg.from.id;

  userState.delete(id);
  reviewState.delete(id);
  sponsorState.delete(id);
  activeChats.delete(id);

  db.run("INSERT OR IGNORE INTO users (id) VALUES (?)", [id]);

  bot.sendPhoto(msg.chat.id, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei seguenti bottoni:`,
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
// CALLBACK QUERY
// =====================
bot.on("callback_query", (q) => {
  const uid = q.from.id;
  const chatId = q.message.chat.id;

  // ===== SPONSOR =====
  if (q.data === "OPEN_SPONSOR") {
    sponsorState.set(uid, { step: "INFO" });
    bot.sendMessage(chatId,
      "*📢 Prezzi Sponsor*\n\n" +
      "**12h** » 500\n" +
      "**24h** » 1000\n" +
      "**36h** » 1600\n" +
      "**48h** » 2100\n" +
      "**Permanente** » 3200",
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "✅ Continua", callback_data: "SP_CONT" }]] }
      }
    );
    return bot.answerCallbackQuery(q.id);
  }

  if (q.data === "SP_CONT") {
    sponsorState.set(uid, { step: "DURATA" });
    bot.sendMessage(chatId, "Seleziona il tempo di durata della sponsor:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "12h", callback_data: "SP_12h" }],
          [{ text: "24h", callback_data: "SP_24h" }],
          [{ text: "36h", callback_data: "SP_36h" }],
          [{ text: "48h", callback_data: "SP_48h" }],
          [{ text: "Permanente", callback_data: "SP_PERM" }]
        ]
      }
    });
    return bot.answerCallbackQuery(q.id);
  }

  if (q.data.startsWith("SP_")) {
    const map = {
      SP_12h: "12h",
      SP_24h: "24h",
      SP_36h: "36h",
      SP_48h: "48h",
      SP_PERM: "Permanente"
    };
    sponsorState.set(uid, { step: "TESTO", durata: map[q.data] });
    bot.sendMessage(chatId, "Ora invia il testo del messaggio sponsor:");
    return bot.answerCallbackQuery(q.id);
  }

  // ===== MENU =====
  const menus = {
    OPEN_ASTA: ["ASTA", "🏷️ *Modulo Asta*\nScrivi:\n1️⃣ Nickname\n2️⃣ Oggetto/i\n3️⃣ Prezzo base\n4️⃣ Rilancio"],
    OPEN_ORDINI: ["ORDINE", "📝 *Modulo Ordini*\n1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti"],
    OPEN_ASSISTENZA: ["ASSISTENZA", "🆘 *Assistenza*\nScrivi la tua richiesta"],
    OPEN_CANDIDATURA: ["CANDIDATURA",
`📝 *Modulo Candidatura Dipendente*

1️⃣ Dati personali: @ Telegram, telefono, nome, ore settimanali e totali
2️⃣ Parlaci di te: chi sei, passioni, motivazioni
3️⃣ Perché dovremmo sceglierti
4️⃣ Esperienze lavorative: se presenti e se attualmente lavori in un'azienda
5️⃣ Competenze pratiche: uso della cassa, capacità di cucinare
6️⃣ Pregi e difetti

📍 Bancarella 8, -505 64 22`]
  };

  if (menus[q.data]) {
    userState.set(uid, menus[q.data][0]);
    bot.sendMessage(chatId, menus[q.data][1], { parse_mode: "Markdown" });
  }

  if (q.data === "OPEN_LISTINO") {
    bot.sendMessage(chatId, "📄 *Listino CapyBar*\nhttps://telegra.ph/Listino-CapyBar-02-07", { parse_mode: "Markdown" });
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  const uid = msg.from.id;

  // CHAT CONTINUA
  if (activeChats.has(uid)) {
    bot.sendMessage(activeChats.get(uid), `💬 ${escape(msg.text)}`, { parse_mode: "Markdown" });
    return;
  }

  // SPONSOR TESTO
  if (sponsorState.get(uid)?.step === "TESTO") {
    const data = sponsorState.get(uid);
    sponsorState.delete(uid);

    ADMINS.forEach(a => {
      bot.sendMessage(a,
        `📢 *Nuovo Sponsor*\n👤 ${msg.from.first_name}\n🕒 ${data.durata}\n\n${msg.text}`,
        { parse_mode: "Markdown" }
      );
      activeChats.set(uid, a);
      activeChats.set(a, uid);
    });

    bot.sendMessage(msg.chat.id, "✅ Sponsor inviato!");
    return;
  }

  // MODULI
  if (userState.has(uid)) {
    const type = userState.get(uid);
    userState.delete(uid);

    ADMINS.forEach(a => {
      bot.sendMessage(a,
        `📩 *${type}*\n👤 ${msg.from.first_name}\n🆔 ${uid}\n\n${escape(msg.text)}`,
        { parse_mode: "Markdown" }
      );
      activeChats.set(uid, a);
      activeChats.set(a, uid);
    });

    bot.sendMessage(msg.chat.id, "✅ Messaggio inviato!");
  }
});