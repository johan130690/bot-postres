require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
    secret: 'postres_finality_2026_pro',
    resave: false,
    saveUninitialized: true
}));

const MENU = {
    '1': { nombre: 'Rebanada de Pay de Limón 🍋', precio: 15, foto: 'https://loremflickr.com/500/500/lemon,pie/all' },
    '2': { nombre: 'Rebanada de Brownie con nuez 🍫', precio: 12, foto: 'https://loremflickr.com/500/500/brownie/all' },
    '3': { nombre: 'Rebanada de Pastel de Zanahoria 🥕', precio: 45, foto: 'https://loremflickr.com/500/500/carrot,cake/all' }
};

app.post('/whatsapp', (req, res) => {
    const msg = (req.body.Body || '').trim().toLowerCase();
    const numMedia = parseInt(req.body.NumMedia) || 0;
    const twiml = new MessagingResponse();
    const reply = twiml.message();

    if (!req.session.cart) req.session.cart = {};
    if (!req.session.paso) req.session.paso = 'inicio';

    // --- 1. CIERRE CON FOTO (COMPROBANTE) ---
    if (numMedia > 0) {
        reply.body('✨ ¡Recibido! ✨\n\nMuchas gracias por tu pago. Tus rebanadas se están empacando ahora mismo con mucho cariño. ¡Te avisamos cuando salgan! 🚚💨');
        req.session.cart = {};
        req.session.paso = 'inicio';
        return res.type('text/xml').send(twiml.toString());
    }

    // --- 2. CIERRE POR TEXTO (PAGO EN EFECTIVO) ---
    const palabrasPago = ['efectivo', 'pagar alla', 'casa', 'contado', 'mano', 'pagaré'];
    if (palabrasPago.some(p => msg.includes(p)) && req.session.paso === 'esperando_direccion') {
        reply.body('✅ ¡Pedido confirmado! 💵\n\nPerfecto, prepararemos tus rebanadas para que las pagues al recibir. ¡Gracias por elegirnos para endulzar tu día! 🧁');
        req.session.cart = {};
        req.session.paso = 'inicio';
        return res.type('text/xml').send(twiml.toString());
    }

    // --- 3. LÓGICA DE PASOS ---
    if (req.session.paso === 'esperando_cantidad') {
        const cant = parseInt(msg);
        if (isNaN(cant) || cant <= 0) {
            reply.body('🔢 ¿Cuántas rebanadas te gustaría pedir? (Por favor, escribe solo el número)');
        } else {
            const id = req.session.prod_temp;
            req.session.cart[id] = (req.session.cart[id] || 0) + cant;
            req.session.paso = 'inicio';
            reply.body('✅ ¡Anotado! He guardado ' + cant + 'x ' + MENU[id].nombre + '.\n\n¿Te apetece probar otra rebanada diferente? Escribe el número o la letra D para ver tu cuenta. 🛒');
        }
    }
    else if (req.session.paso === 'esperando_direccion') {
        let total = 0;
        for (let k in req.session.cart) total += MENU[k].precio * req.session.cart[k];
        
        reply.body('📍 Dirección registrada: ' + msg + '\n\n💰 Total: $' + total + '\n\n' +
                   '¿Cómo prefieres pagar?\n' +
                   '1️⃣ Envíame foto del Bizum/Transferencia 📸\n' +
                   '2️⃣ Escribe "Efectivo" para pagar al repartidor. 💵');
    }
    else {
        // --- 4. NAVEGACIÓN Y RESPUESTAS AMIGABLES ---
        const disparadores = ['hola', 'inicio', '.', 'menu', 'buenas', 'buenos dias', 'rebanada'];
        
        if (disparadores.includes(msg)) {
            reply.body('🧁 ¡Hola! Qué alegría saludarte.\n\nEn Pastelería Finality horneamos cada rebanada hoy mismo para que esté fresca y deliciosa. ✨\n\n¿Cómo podemos ayudarte?:\n*A.* Ver menú de hoy 🍰\n*B.* Horarios de entrega 🚚\n*C.* Hablar con un pastelero 👤\n*D.* Ver mi carrito 🛒');
        } 
        else if (msg === 'a') {
            let m = '🍰 Nuestras especialidades de hoy:\n\n';
            for (let k in MENU) m += '' + k + '. ' + MENU[k].nombre + ' ($' + MENU[k].precio + ')\n';
            reply.body(m + '\n*Escribe el número de la rebanada que más se te antoje.*');
        }
        else if (msg === 'b') {
            reply.body('🚚 Horarios de entrega: Lunes a Sábado de 10:00 a 20:00.\n\n¡Escribe A para ver qué tenemos rico hoy! 🕒');
        }
        else if (MENU[msg]) {
            req.session.prod_temp = msg;
            req.session.paso = 'esperando_cantidad';
            twiml.message().body('🔢 ¡Excelente elección! ¿Cuántas rebanadas de ' + MENU[msg].nombre + ' deseas?');
            twiml.message().media(MENU[msg].foto);
            return res.type('text/xml').send(twiml.toString());
        }
        else if (msg === 'd') {
            const cart = req.session.cart;
            if (Object.keys(cart).length === 0) {
                reply.body('🛒 Tu carrito está vacío. ¡Echa un vistazo al menú con la letra A!');
            } else {
                let resCart = '🛒 Este es tu pedido actual:\n\n';
                let total = 0;
                for (let k in cart) {
                    let sub = MENU[k].precio * cart[k];
                    total += sub;
                    resCart += '• ' + cart[k] + 'x ' + MENU[k].nombre + ' ($' + sub + ')\n';
                }
                resCart += '\n💰 Total: $' + total + '\n\n📍 Dime tu dirección exacta para el envío:';
                req.session.paso = 'esperando_direccion';
                reply.body(resCart);
            }
        }
        // --- 5. RESPUESTA PARA "PREGUNTAS SUELTAS" (ANTI-SILENCIO) ---
        else {
            reply.body('🤔 ¡Ups! No estoy seguro de haberte entendido.\n\nPero no te preocupes, para ver las rebanadas escribe A o si tienes una duda especial escribe C para hablar con una persona. 🍰');
        }
    }

    res.type('text/xml').send(twiml.toString());
});

app.listen(PORT, () => console.log(`✅ Servidor corriendo en el puerto ${PORT}`));
