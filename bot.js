const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Inicializar el cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth()
});

// Servidor webhook puerto 3000 para ngrok
app.listen(3000, () => {
    console.log('✅ Servidor webhook en puerto 3000');
});

// Archivo para guardar los pagos y estado del grupo
const PAGOS_FILE = 'pagos.json';

// Cargar pagos existentes o crear archivo nuevo
let pagosData = {};
if (fs.existsSync(PAGOS_FILE)) {
    pagosData = JSON.parse(fs.readFileSync(PAGOS_FILE, 'utf8'));
}

// Lista de administradores (PON TU NÚMERO COMPLETO)
const ADMIN_NUMEROS = [
    '5213312345678@c.us'  // ← CAMBIA POR TU NÚMERO COMPLETO
];

// Función para verificar si es admin
function esAdmin(msg) {
    const numeroUsuario = msg.author || msg.from;
    return ADMIN_NUMEROS.includes(numeroUsuario);
}

// Función para verificar cierre automático (CORREGIDA)
function verificarCierreAutomatico(chatId) {
    if (!pagosData[chatId] || !pagosData[chatId].horaCierre) return;
    
    const ahora = new Date();
    const [hora, minuto] = pagosData[chatId].horaCierre.split(':');
    const horaCierre = new Date();
    horaCierre.setHours(parseInt(hora), parseInt(minuto), 0, 0);
    
    // Verificar si ya pasó la hora de cierre HOY
    if (ahora >= horaCierre && pagosData[chatId].grupoAbierto) {
        pagosData[chatId].grupoAbierto = false;
        const total = pagosData[chatId].total || 0;
        fs.writeFileSync(PAGOS_FILE, JSON.stringify(pagosData, null, 2));
        
        client.getChatById(chatId).then(chat => {
            const horaActual = ahora.toLocaleTimeString('es-MX');
            chat.sendMessage(`⏰ *Grupo cerrado automáticamente a las ${horaActual}*\n\n🔒 No se pueden recibir más pagos\n💰 *Total:* ${total}`);
        });
        console.log(`Grupo ${chatId} cerrado automáticamente`);
    }
}

// Generar código QR
client.on('qr', (qr) => {
    console.log('📱 Escanea este código QR con tu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Bot de WhatsApp listo!');
    
    // Verificar cierres cada 30 segundos
    setInterval(() => {
        Object.keys(pagosData).forEach(chatId => verificarCierreAutomatico(chatId));
    }, 30000);
});

client.on('message', async (msg) => {
    const mensaje = msg.body.trim().toLowerCase();
    const chatId = msg.from;
    const esAdminUsuario = esAdmin(msg);

    // Comando .reg (TODOS)
    if (mensaje.startsWith('.reg ')) {
        const grupoAbierto = pagosData[chatId] ? pagosData[chatId].grupoAbierto : true;
        
        if (!grupoAbierto) {
            await msg.reply('❌ Grupo cerrado. No se pueden registrar más pagos.');
            return;
        }

        const cantidad = msg.body.substring(5).trim();
        const numero = parseFloat(cantidad);

        if (isNaN(numero)) {
            await msg.reply('❌ Número inválido. Ej: .reg 100');
            return;
        }

        if (!pagosData[chatId]) {
            pagosData[chatId] = { grupoAbierto: true, pagos: [], total: 0 };
        }

        const pago = {
            cantidad: numero,
            fecha: new Date().toISOString(),
            usuario: msg.author || msg.from
        };
        
        pagosData[chatId].pagos.push(pago);
        pagosData[chatId].total += numero;
        fs.writeFileSync(PAGOS_FILE, JSON.stringify(pagosData, null, 2));
        
        await msg.reply('✅ Pago Registrado');
        return;
    }

    // Comando .conteo (TODOS)
    if (mensaje === '.conteo') {
        if (!pagosData[chatId] || pagosData[chatId].total === 0) {
            const horaCierre = pagosData[chatId]?.horaCierre || 'Sin programar';
            await msg.reply(`Conteo Final: 0 🤝🏻🧾\n⏰ Cierre: ${horaCierre}`);
        } else {
            const total = pagosData[chatId].total;
            const estado = pagosData[chatId].grupoAbierto ? '🟢 Abierto' : '🔴 Cerrado';
            const horaCierre = pagosData[chatId]?.horaCierre || 'Sin programar';
            await msg.reply(`Conteo Final: ${total} ${estado} 🤝🏻🧾\n⏰ Cierre: ${horaCierre}`);
        }
        return;
    }

    // COMANDOS SOLO PARA ADMINS
    if (!esAdminUsuario) {
        await msg.reply('❌ Solo administradores pueden usar este comando.');
        return;
    }

    // Comando .grupo (ADMINS)
    if (mensaje === '.grupo') {
        if (!pagosData[chatId]) {
            pagosData[chatId] = { grupoAbierto: true, pagos: [], total: 0 };
        } else {
            pagosData[chatId].grupoAbierto = true;
            delete pagosData[chatId].horaCierre;
        }
        fs.writeFileSync(PAGOS_FILE, JSON.stringify(pagosData, null, 2));
        await msg.reply('✅ Grupo abierto');
        return;
    }

    // Comando .close (ADMINS) - CORREGIDO
    if (mensaje.startsWith('.close ')) {
        const horaCierre = msg.body.substring(7).trim();
        if (!/^\d{1,2}:\d{2}$/.test(horaCierre)) {
            await msg.reply('❌ Formato: .close 23:30');
            return;
        }
        
        if (!pagosData[chatId]) {
            pagosData[chatId] = { grupoAbierto: true, pagos: [], total: 0, horaCierre };
        } else {
            pagosData[chatId].horaCierre = horaCierre;
        }
        
        fs.writeFileSync(PAGOS_FILE, JSON.stringify(pagosData, null, 2));
        await msg.reply(`⏰ Grupo se cerrará a las ${horaCierre}`);
        return;
    }

    // Comando .borrar (ADMINS)
    if (mensaje === '.borrar') {
        if (pagosData[chatId]) {
            delete pagosData[chatId];
            fs.writeFileSync(PAGOS_FILE, JSON.stringify(pagosData, null, 2));
        }
        await msg.reply('💥 Registros Eliminados');
        return;
    }

    // Comando .menu (ADMINS)
    if (mensaje === '.menu') {
        const estado = pagosData[chatId] && pagosData[chatId].grupoAbierto ? '🟢 ABIERTO' : '🔴 CERRADO';
        const horaCierre = pagosData[chatId]?.horaCierre || 'Sin programar';
        const menu = `🤖 *MENÚ DE COMANDOS*

📊 Estado: ${estado}
⏰ Cierre: ${horaCierre}

✅ *TODOS:*
• .reg 100
• .conteo

🔒 *ADMINS:*
• .grupo
• .close 23:30
• .borrar
• .menu`;
        await msg.reply(menu);
        return;
    }
});

// Inicializar
client.initialize();
