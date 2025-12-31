const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ✅ RUTA QR CLARA PARA RENDER (PEGAR PRIMERO)
app.get('/', async (req, res) => {
  if (client.info) {
    res.send(`🤖 Bot CONECTADO!\n👥 ${client.info.pushname}\n📱 Listo para .reg 100`);
  } else if (qr) {
    res.type('html').send(`
      <html>
        <body style="background:#000; color:#fff; font-family:Arial; text-align:center; padding:20px;">
          <h1>🤖 Bot WhatsApp 24/7</h1>
          <div style="display:inline-block; margin:20px;">
            <pre style="font-size:28px; line-height:1.1; letter-spacing:0.5px; background:#111; padding:20px; border-radius:10px;">${qr}</pre>
          </div>
          <p>📱 WhatsApp → ⋮ → Dispositivos vinculados → Escanear QR</p>
          <hr>
          <p><small>Render.com Live: ${req.headers.host}</small></p>
        </body>
      </html>
    `);
  } else {
    res.send('⏳ Iniciando bot... Espera QR (1-2 min)');
  }
});

let client;
let qr = null;

// PAGOS (TODOS PUEDEN USAR - SIN ADMINS)
const pagos = [];

// INICIAR BOT
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  client = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  client.ev.on('creds.update', saveCreds);

  client.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      console.log('🔌 Desconectado:', lastDisconnect.error);
      startBot();
    } else if (connection === 'open') {
      console.log('✅ Cliente conectado!');
    }
  });

  client.ev.on('qr', (qrcodeData) => {
    qr = qrcodeData;
    console.log('📱 Escanea este QR con WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  client.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;
    
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const sender = msg.key.participant || msg.key.remoteJid;
    
    if (!text.startsWith('.')) return;

    const command = text.slice(1).split(' ')[0].toLowerCase();
    const args = text.slice(1).split(' ').slice(1);

    console.log(`📨 ${command} de ${sender}`);

    // .reg MONTO
    if (command === 'reg') {
      const monto = parseFloat(args[0]);
      if (isNaN(monto) || monto <= 0) {
        await client.sendMessage(from, { text: '❌ Usa: .reg 100' });
        return;
      }
      pagos.push({ monto, fecha: new Date(), usuario: sender });
      await client.sendMessage(from, { text: `✅ Pago Registrado: $${monto} MXN` });
    }

    // .conteo
    if (command === 'conteo') {
      const total = pagos.reduce((sum, p) => sum + p.monto, 0);
      const count = pagos.length;
      await client.sendMessage(from, { text: `📊 Total: $${total} MXN (${count} pagos)` });
    }

    // .menu (TODOS)
    if (command === 'menu') {
      await client.sendMessage(from, { 
        text: `📋 *MENÚ BOT PAGOS 24/7*\n\n` +
              `• *.reg 100* → Registrar pago\n` +
              `• *.conteo* → Total recaudado\n` +
              `• *.menu* → Este menú\n\n` +
              `🤖 Bot en Render.com - Siempre activo!`
      });
    }
  });
}

// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor webhook en puerto ${PORT}`);
  startBot();
});

