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
// DATABASE
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
// STATI
// =====================
const reviewState = new Map(); // userId -> { rating, chatId, waitingComment }
const reviewCooldown = new Map();
const userState = new Map(); // userId -> tipo modulo/assistenza
const activeChats = new Map(); // userId <-> adminId (chat continua)
const sponsorState = new Map(); // userId -> { step: "SHOW_INFO" | "SELECT_DURATION" | "WRITE_TEXT", duration: string }
const ignoreUsers = new Set(); // utenti che non devono inviare messaggi dopo /start
const REVIEW_COOLDOWN_MS = 60 * 1000;

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

// =====================
// FUNZIONI UTILI
// =====================
const escape = (t) => t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");
const getAverage = (callback) => {
  db.get("SELECT AVG(rating) as avg FROM reviews", [], (err, row) => {
    callback(row && row.avg ? row.avg.toFixed(1) : "0.0");
  });
};

// =====================
// COMANDO /start
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // ✅ RESET stato utente, sponsor e recensione
  userState.delete(userId);
  reviewState.delete(userId);
  sponsorState.delete(userId);

  // ❌ FERMA chat continua
  if (activeChats.has(userId)) {
    const adminId = activeChats.get(userId);
    activeChats.delete(userId);
    activeChats.delete(adminId);
  }

  // ❌ Ignora messaggi futuri finché non parte un nuovo modulo
  ignoreUsers.add(userId);

  db.run("INSERT OR IGNORE INTO users (id) VALUES (?)", [userId]);

  bot.sendPhoto(chatId, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei seguenti bottoni:`,
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
  const userId = q.from.id;
  const chatId = q.message.chat.id;

  // Se l'utente era in ignoreUsers, lo rimuoviamo perché sta facendo un'azione valida
  ignoreUsers.delete(userId);

  // ⭐ RECENSIONI
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
        getAverage(avg => {
          db.get("SELECT COUNT(*) as n FROM reviews", [], (err, row) => {
            const total = row ? row.n : 0;
            bot.sendMessage(chatId, `✅ Recensione inviata!\n⭐ ${rating}/5\n📊 Media attuale: ${avg} (${total} voti)`);
            ADMINS.forEach(id => {
              bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n💬 Nessun commento`);
            });
            reviewState.delete(userId);
          });
        });
      }
    );
    bot.answerCallbackQuery(q.id);
    return;
  }

  // =======================
  // FLUSSO SPONSOR
  // =======================
  if (q.data === "SPONSOR_CONTINUA") {
    const state = sponsorState.get(userId);
    if (!state || state.step !== "SHOW_INFO") return;

    state.step = "SELECT_DURATION";
    sponsorState.set(userId, state);

    bot.sendMessage(chatId, "Seleziona il tempo di durata della sponsor:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "12h", callback_data: "SPONSOR_12h" }],
          [{ text: "24h", callback_data: "SPONSOR_24h" }],
          [{ text: "36h", callback_data: "SPONSOR_36h" }],
          [{ text: "48h", callback_data: "SPONSOR_48h" }],
          [{ text: "Permanente", callback_data: "SPONSOR_PERMANENTE" }]
        ]
      }
    });
    bot.answerCallbackQuery(q.id);
    return;
  }

  if (q.data.startsWith("SPONSOR_")) {
    const state = sponsorState.get(userId);
    if (!state || state.step !== "SELECT_DURATION") return;

    const durationMap = {
      "SPONSOR_12h": "12h",
      "SPONSOR_24h": "24h",
      "SPONSOR_36h": "36h",
      "SPONSOR_48h": "48h",
      "SPONSOR_PERMANENTE": "Permanente"
    };

    state.step = "WRITE_TEXT";
    state.duration = durationMap[q.data];
    sponsorState.set(userId, state);

    bot.sendMessage(chatId, "Ora invia il testo del messaggio sponsor:");
    bot.answerCallbackQuery(q.id);
    return;
  }

  // MENU
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, "⭐ *Lascia una recensione*\nSeleziona un voto da 1 a 5:", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[1,2,3,4,5].map(n => ({ text:`⭐ ${n}`, callback_data:`RATE_${n}` }))] }
      });
      break;

    case "OPEN_LISTINO":
      bot.sendMessage(chatId, "📄 *Listino CapyBar*\nConsulta il listino completo qui: https://telegra.ph/Listino-CapyBar-02-07", { parse_mode: "Markdown" });
      break;

    case "OPEN_ASTA":
      userState.set(userId, "ASTA");
      bot.sendMessage(chatId, "🏷️ *Modulo Asta*\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ Oggetto/i\n3️⃣ Prezzo base\n4️⃣ Rilancio", { parse_mode: "Markdown" });
      break;

    case "OPEN_ORDINI":
      userState.set(userId, "ORDINE");
      bot.sendMessage(chatId, "📝 *Modulo Ordinazioni*\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti desiderati", { parse_mode: "Markdown" });
      break;

    case "OPEN_ASSISTENZA":
      userState.set(userId, "ASSISTENZA");
      bot.sendMessage(chatId, "🆘 *Assistenza*\nScrivi qui la tua richiesta o contatta un admin.", { parse_mode: "Markdown" });
      break;

    case "OPEN_SPONSOR":
      sponsorState.set(userId, { step: "SHOW_INFO" });
      bot.sendMessage(chatId,
        "*📢 Prezzi Sponsor:*\n\n" +
        "**12h** » 500\n" +
        "**24h** » 1000\n" +
        "**36h** » 1600\n" +
        "**48h** » 2100\n" +
        "**Permanente** » 3200",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "✅ Continua", callback_data: "SPONSOR_CONTINUA" }]]
          }
        }
      );
      break;

    case "OPEN_CANDIDATURA":
      userState.set(userId, "CANDIDATURA");
      bot.sendMessage(chatId,
`📝 *Modulo Candidatura Dipendente*\n\nCompila il tuo curriculum su un libro seguendo questi punti:\n\n` +
`1️⃣ *Dati personali*: @ Telegram, Discord, telefono, nome, ore settimanali e totali\n` +
`2️⃣ *Parlaci di te*: chi sei, passioni, motivazioni\n` +
`3️⃣ *Perché dovremmo sceglierti?*\n` +
`4️⃣ *Esperienze lavorative*: se presenti e se attualmente lavori in un’azienda\n` +
`5️⃣ *Competenze pratiche*: uso della cassa, capacità di cucinare\n` +
`6️⃣ *Pregi e difetti*\n\n` +
`📍 *Consegna*: Bancarella 8, coordinate -505 64 22, davanti all’ospedale`,
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
  const userId = msg.from.id;

  // Se l'utente è in ignoreUsers, ignora i messaggi
  if (ignoreUsers.has(userId)) return;

  // 🔁 CHAT CONTINUA UTENTE → ADMIN
  if (activeChats.has(userId) && !ADMINS.has(userId)) {
    const adminId = activeChats.get(userId);
    bot.sendMessage(adminId, `💬 *Messaggio da ${msg.from.first_name}:*\n\n${escape(msg.text)}`, { parse_mode: "Markdown" });
    return;
  }

  // 🔁 CHAT CONTINUA ADMIN → UTENTE
  if (ADMINS.has(userId) && activeChats.has(userId)) {
    const targetUser = activeChats.get(userId);
    bot.sendMessage(targetUser, `💬 *Risposta da ${msg.from.first_name}:*\n\n${escape(msg.text)}`, { parse_mode: "Markdown" });
    return;
  }

  // COMMENTO RECENSIONE
  if (reviewState.has(userId)) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);

    db.run(
      "INSERT INTO reviews (user_id, rating, comment, created_at) VALUES (?, ?, ?, ?)",
      [userId, rating, msg.text, new Date().toISOString()],
      (err) => {
        if (err) console.error(err);
        getAverage(avg => {
          db.get("SELECT COUNT(*) as n FROM reviews", [], (err, row) => {
            const total = row ? row.n : 0;
            bot.sendMessage(chatId, `✅ Recensione inviata!\n⭐ Voto: ${rating}/5\n💬 Commento: ${escape(msg.text)}\n📊 Media attuale: ${avg} (${total} voti)`);
            ADMINS.forEach(id => bot.sendMessage(id, `⭐ Recensione\n👤 ${msg.from.first_name}\n⭐ ${rating}/5\n💬 ${escape(msg.text)}`, { parse_mode:"Markdown" }));
          });
        });
      }
    );
    return;
  }

  // GESTIONE SPONSOR
  if (sponsorState.has(userId)) {
    const data = sponsorState.get(userId);
    if (data.step === "WRITE_TEXT") {
      sponsorState.delete(userId);

      const adminArray = Array.from(ADMINS);
      if (adminArray.length === 0) {
        bot.sendMessage(chatId, "❌ Nessun admin disponibile al momento.");
        return;
      }
      const assignedAdmin = adminArray[Math.floor(Math.random() * adminArray.length)];

      activeChats.set(userId, assignedAdmin);
      activeChats.set(assignedAdmin, userId);

      bot.sendMessage(assignedAdmin,
        `📢 *Nuovo Sponsor*\n👤 ${msg.from.first_name} (@${msg.from.username || "nessuno"})\n🕒 Durata: ${data.duration}\n\n${msg.text}`,
        { parse_mode: "Markdown" }
      );

      bot.sendMessage(chatId, "✅ Sponsor inviato! Ora puoi continuare a scrivere qui e ricevere risposta dall'admin.");

      db.run("INSERT OR IGNORE INTO users (id) VALUES (?)", [userId]);
      return;
    }
  }

  // MODULI / ASSISTENZA / CANDIDATURA / SPONSOR
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);

    const adminArray = Array.from(ADMINS);
    if (adminArray.length === 0) {
      bot.sendMessage(chatId, "❌ Nessun admin disponibile al momento.");
      return;
    }
    const assignedAdmin = adminArray[Math.floor(Math.random() * adminArray.length)];

    activeChats.set(userId, assignedAdmin);
    activeChats.set(assignedAdmin, userId);

    bot.sendMessage(assignedAdmin,
      `📩 *${type}*\n👤 ${msg.from.first_name} (@${msg.from.username || "nessuno"})\n🆔 ${userId}\n\n${escape(msg.text)}`,
      { parse_mode:"Markdown" }
    );

    bot.sendMessage(chatId, "✅ Messaggio inviato! Ora puoi continuare a scrivere qui e ricevere risposta dall'admin.");

    db.run("INSERT OR IGNORE INTO users (id) VALUES (?)", [userId]);
    return;
  }

  db.run("INSERT OR IGNORE INTO users (id) VALUES (?)", [userId]);
  return;
});

// =====================
// COMANDI ADMIN
// =====================
bot.onText(/\/admin add (\d+)/, (msg, match) => {
  const fromId = msg.from.id;
  if (fromId !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può usare questo comando.");
  const newAdmin = Number(match[1]);
  if (ADMINS.has(newAdmin)) return bot.sendMessage(msg.chat.id, "⚠️ Admin già presente.");

  db.run("INSERT OR IGNORE INTO admins (id) VALUES (?)", [newAdmin]);
  ADMINS.add(newAdmin);
  bot.sendMessage(msg.chat.id, `✅ Admin aggiunto: ${newAdmin}`);
});

bot.onText(/\/admin remove (\d+)/, (msg, match) => {
  const fromId = msg.from.id;
  if (fromId !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può usare questo comando.");
  const remAdmin = Number(match[1]);
   if (!ADMINS.has(remAdmin)) return bot.sendMessage(msg.chat.id, "⚠️ Admin non trovato.");

  db.run("DELETE FROM admins WHERE id = ?", [remAdmin]);
  ADMINS.delete(remAdmin);
  bot.sendMessage(msg.chat.id, `✅ Admin rimosso: ${remAdmin}`);
});

// =====================
// COMANDO /id
// =====================
bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`);
});

// =====================
// COMANDO /stats
// =====================
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  db.get("SELECT COUNT(*) as n FROM users", [], (err, row) => {
    const totalUsers = row ? row.n : 0;
    db.get("SELECT COUNT(*) as n FROM reviews", [], (err, row2) => {
      const totalReviews = row2 ? row2.n : 0;
      getAverage(avgRating => {
        bot.sendMessage(chatId,
          `📊 *Statistiche Bot*\n\n👥 Utenti totali: ${totalUsers}\n⭐ Recensioni totali: ${totalReviews}\n📊 Voto medio: ${avgRating}`,
          { parse_mode:"Markdown" }
        );
      });
    });
  });
});