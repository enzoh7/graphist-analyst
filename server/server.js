import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes, { authenticateToken } from './authRoutes-NoMongo.js';
import drawingRoutes from './drawingRoutes-NoMongo.js';
import { createClient } from 'redis';
import zmq from 'zeromq';

// ========== CONFIGURATION ==========
dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ========== WEBSOCKETS (HFT PUSH) ==========
const io = new Server(server, {
    cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] }
});

const activeSubscriptions = new Map(); // Mémorise qui regarde quoi

io.on('connection', (socket) => {
    console.log(`🔌 Client UI connecté: ${socket.id}`);

    // Quand le frontend dit "Je regarde XAUUSD"
    socket.on('subscribe_price', (symbol) => {
        activeSubscriptions.set(socket.id, symbol);
    });

    socket.on('disconnect', () => {
        activeSubscriptions.delete(socket.id); // On le raye de la liste s'il ferme la page
        console.log(`🔌 Client UI déconnecté: ${socket.id}`);
    });
});

// ========== REDIS  ==========
const redisClient = createClient({ url: 'redis://127.0.0.1:6379' });
redisClient.on('error', (err) => console.error('🚨 Erreur Client Redis :', err));

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use('/auth', authRoutes);
app.use('/api', drawingRoutes);

// ========== MOTEUR ZEROMQ ==========
const zmqSocket = new zmq.Request();
let bridgeConnected = false;

async function connectZeroMQ() {
    try {
        zmqSocket.connect('tcp://127.0.0.1:5555');
        zmqSocket.receiveTimeout = 3000;
        bridgeConnected = true;
        console.log('⚡ Connecté au Bridge ZeroMQ sur le port 5555');
    } catch (error) {
        console.error('❌ Erreur de connexion ZeroMQ:', error);
        bridgeConnected = false;
    }
}

async function askPython(action, payload = {}) {
    if (!bridgeConnected) throw new Error("Bridge ZeroMQ déconnecté");
    
    try {
        await zmqSocket.send(JSON.stringify({ action, ...payload }));
        const [result] = await zmqSocket.receive();
        const data = JSON.parse(result.toString());
        
        if (data.status === 'error') throw new Error(data.message);
        return data;
    } catch (error) {
        if (error.code === 'EAGAIN') {
            console.error(`🚨 TIMEOUT ZMQ sur l'action: ${action}`);
            throw new Error("Python n'a pas répondu (Timeout 3s)");
        }
        throw error;
    }
}

// ========== LA BOUCLE HAUTE FRÉQUENCE (ZMQ -> WEBSOCKET) ==========
let lastPrices = {};
let marketStatus = {}; // 🔴 Tracker l'état du marché par symbole

setInterval(async () => {
    if (!bridgeConnected || activeSubscriptions.size === 0) return;

    // Regarde la liste des actifs actuellement ouverts par les utilisateurs
    const symbolsToFetch = [...new Set(activeSubscriptions.values())];

    for (const symbol of symbolsToFetch) {
        try {
            const cleanSymbol = symbol.toUpperCase().replace('/', '').replace('USDT', 'USD');// Normalisation du symbole pour le Python
            const data = await askPython('price', { symbol: cleanSymbol });// Demande le prix actuel au Python
            
            if (data.status === 'success') {
                marketStatus[symbol] = 'open'; // Marché ouvert
                const priceKey = `${data.bid}_${data.ask}`;
                // Le prix a-t-il bougé depuis la dernière milliseconde ?
                if (lastPrices[symbol] !== priceKey) {
                    lastPrices[symbol] = priceKey;
                    // OUI ! On le pousse vers le frontend (plus besoin de fetch !)
                    io.emit('price_update', { symbol, ...data }); 
                }
            } else if (data.status === 'market_closed') {
                marketStatus[symbol] = 'closed'; // Marché fermé
                // 🔴 Signaler au frontend que le marché est fermé
                io.emit('market_status', { symbol, status: 'closed', message: data.message }); 
                console.log(`📊 ${symbol}: Marché fermé`);
            } else {
                marketStatus[symbol] = 'error';
                console.warn(`⚠️ Erreur prix pour ${symbol}: ${data.message}`);
            }
        } catch (e) { /* Silence pour ne pas polluer */ }
    }
}, 100); // 10 fois par seconde !

// ========== ROUTES ==========

app.get('/health', async (req, res) => {
    try {
        await askPython('health');
        res.json({ status: 'ok', serverPort: PORT, bridgeMode: 'ZeroMQ', bridgeConnected: true });
    } catch (e) {
        res.json({ status: 'ok', serverPort: PORT, bridgeMode: 'ZeroMQ', bridgeConnected: false });
    }
});

app.post('/trade', authenticateToken, async (req, res) => {
    try {
        if (!bridgeConnected) return res.status(503).json({ error: 'Bridge Python non connecté' });

        const { symbol, type, volume, sl, tp } = req.body;
        if (!symbol || !type || !volume) return res.status(400).json({ error: 'Paramètres manquants' });

        console.log(`📊 Ordre ${type.toUpperCase()} reçu: ${volume} lots de ${symbol}`);

        // 🛡️ Envoi au Bridge via TCP
        const result = await askPython('trade', {
            symbol, 
            type, 
            volume: parseFloat(volume), 
            sl: parseFloat(sl||0), 
            tp: parseFloat(tp||0)
        });

        console.log(`✅ Ordre exécuté. ID: ${result.order_id}`);

        // 🔴 ENVOI DU LOG DANS REDIS
        const logData = {
            event: 'TRADE_EXECUTED',
            userId: req.user ? req.user.userId : 'unknown',
            orderId: result.order_id,
            symbol: symbol,
            type: type,
            timestamp: new Date().toISOString()
        };
        await redisClient.lPush('audit_queue', JSON.stringify(logData));

        res.json({ success: true, orderId: result.order_id, symbol, type, volume, timestamp: new Date().toISOString() });

    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/account/switch', authenticateToken, async (req, res) => {
    try {
        if (!bridgeConnected) return res.status(503).json({ error: 'Bridge Python non connecté' });

        const { login, password, server, accountType } = req.body;

        if (!login || !password || !server || !accountType) {
            return res.status(400).json({ error: 'Paramètres manquants pour le switch' });
        }

        // 1. Ordre direct au Python via le câble TCP
        const result = await askPython('switch_account', { 
            login: parseInt(login), 
            password: password, 
            server: server 
        });

        // 2. Mémorisation ultra-rapide dans Redis
        const userId = req.user.userId;
        await redisClient.set(`active_account:${userId}`, accountType);

        console.log(`🔄 [UTILISATEUR ${userId}] Switch vers le compte ${accountType.toUpperCase()} réussi.`);

        res.json({ 
            success: true, 
            message: result.message, 
            accountType: accountType, 
            company: result.company 
        });

    } catch (error) {
        console.error('❌ Erreur lors du switch:', error.message);
        res.status(400).json({ error: error.message });
    }
});

app.get('/symbols', async (req, res) => {
    try { res.json(await askPython('symbols')); } 
    catch (e) { res.status(503).json({ error: e.message }); }
});

app.get('/price/:symbol', async (req, res) => {
    try {
        const cleanSymbol = req.params.symbol.toUpperCase().replace('/', '').replace('USDT', 'USD');
        const data = await askPython('price', { symbol: cleanSymbol });
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/history/:symbol', async (req, res) => {
    if (!bridgeConnected) return res.status(503).json({ error: 'Bridge indisponible' });
  
    try {
        const cleanSymbol = req.params.symbol.toUpperCase().replace('/', '').replace('USDT', 'USD');
        const timeframe = req.query.timeframe || '1m';
        const limit = parseInt(req.query.limit) || 500;
        
        // 🛡️ Envoi au Bridge via TCP
        const result = await askPython('history', { symbol: cleanSymbol, timeframe, limit });
        
        // 🔴 Gérer les cas de marché fermé
        if (result.status === 'success') {
            res.json({ candles: result.candles || [], market_status: 'open' });
        } else if (result.status === 'no_data') {
            // Marché fermé mais symbole existe - retourner les données vides avec le statut
            res.json({ 
                candles: result.candles || [], 
                market_status: 'closed',
                message: result.message 
            });
        } else {
            // Erreur réelle (symbole intro vable)
            res.status(400).json({ 
                error: result.message,
                market_status: 'error',
                candles: []
            });
        }
    } catch (e) {
        console.error('❌ Erreur historique:', e.message);
        res.status(500).json({ error: 'Erreur serveur', candles: [] });
    }
});

app.get('/positions', async (req, res) => {
    if (!bridgeConnected) return res.status(503).json({ positions: [] });
    try {
        const result = await askPython('positions');
        res.json({ positions: result.positions || [] });
    } catch (e) { res.status(500).json({ positions: [] }); }
});

// ========== DÉMARRAGE ==========
async function startServer() {
  try {
    console.log('🔄 Mode base de données: MÉMOIRE (NoMongo)');
    
    await redisClient.connect();
    console.log('📦 Base de données Redis connectée avec succès !');

    await connectZeroMQ();
    server.listen(PORT, () => {
        console.log(`\n🚀 Serveur démarré sur http://localhost:${PORT}`);
        // Vérification silencieuse toutes les 10s
        setInterval(() => askPython('health').catch(() => bridgeConnected = false), 10000);
    });
  } catch (error) {
    console.error('❌ Impossible de démarrer le serveur:', error);
    process.exit(1);
  }
}

startServer();