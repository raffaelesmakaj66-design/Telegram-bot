sendMessage(chatId, "✅ Messaggio inviato! Ora puoi continuare a scrivere qui e ricevere risposta dall'admin.");
    db.run("INSERT OR IGNORE INTO users (id) VALUES (?)", [userId]);
    return;
  }

  db.run("INSERT OR IGNORE INTO users (id) VALUES (?)", [userId]);
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
          📊 *Statistiche Bot*\n\n👥 Utenti totali: ${totalUsers}\n⭐ Recensioni totali: ${totalReviews}\n📊 Voto medio: ${avgRating},
          { parse_mode:"Markdown" }
        );
      });
    });
  });
});