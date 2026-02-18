import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './authRoutes-NoMongo.js'; // Version simplifiée sans MongoDB
import drawingRoutes from './drawingRoutes-NoMongo.js';

// ========== CONFIGURATION ==========
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphist-analyst';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ========== ROUTES D'AUTHENTIFICATION ET DESSINS ==========
app.use('/auth', authRoutes);
app.use('/api', drawingRoutes);

// ========== VARIABLES GLOBALES ==========
let bridgeConnected = false;
const BRIDGE_URL = 'http://localhost:5000';

// ========== VÉRIFICATION DU BRIDGE PYTHON ==========
async function checkBridgeHealth() {
  try {
    const response = await fetch(`${BRIDGE_URL}/health`, { 
      method: 'GET',
      timeout: 3000 
    });
    bridgeConnected = response.ok;
    if (bridgeConnected) {
      console.log('✅ Bridge Python détecté sur http://localhost:5000');
    } else {
      console.warn('⚠️  Bridge Python non disponible');
    }
  } catch (error) {
    bridgeConnected = false;
    console.warn('⚠️  Bridge Python (http://localhost:5000) non accessible');
  }
}

// ========== ROUTES ==========

/**
 * GET /health - Vérifier l'état du serveur et du bridge
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    serverPort: PORT,
    bridgeUrl: BRIDGE_URL,
    bridgeConnected: bridgeConnected,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /trade - Exécuter une ordre (BUY ou SELL)
 * body: { symbol, type: 'buy'|'sell', volume, sl, tp }
 */
app.post('/trade', async (req, res) => {
    try {
        if (!bridgeConnected) {
            return res.status(503).json({ 
                status: 'error', 
                message: 'Le Bridge Python n\'est pas connecté sur http://localhost:5000' 
            });
        }

        const { symbol, type, volume, sl, tp } = req.body;

        // ========== VALIDATION ==========
        if (!symbol || !type || !volume) {
            return res.status(400).json({
                error: 'Paramètres manquants. Requis: symbol, type, volume'
            });
        }

        if (!['buy', 'sell'].includes(type)) {
            return res.status(400).json({
                error: 'Type doit être "buy" ou "sell"'
            });
        }

        if (volume <= 0) {
            return res.status(400).json({
                error: 'Le volume doit être supérieur à 0'
            });
        }

        console.log(`📊 Ordre ${type.toUpperCase()} reçue: ${volume} lots de ${symbol}`);

        // ========== ENVOYER AU BRIDGE PYTHON ==========
        const response = await fetch(`${BRIDGE_URL}/trade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol,
                type,
                volume: parseFloat(volume),
                sl: sl ? parseFloat(sl) : 0,
                tp: tp ? parseFloat(tp) : 0
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('❌ Erreur Bridge:', error);
            return res.status(400).json({ 
                status: 'error', 
                message: error.message || 'Le bridge a rejeté l\'ordre' 
            });
        }

        const result = await response.json();

        console.log(`✅ Ordre exécutée via Bridge. ID: ${result.order_id}`);

        res.json({
            success: true,
            orderId: result.order_id,
            symbol,
            type,
            volume,
            sl: sl ? parseFloat(sl) : 0,
            tp: tp ? parseFloat(tp) : 0,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erreur lors de l\'exécution:', error);
        res.status(500).json({
            status: 'error',
            message: error.message,
            details: 'Assurez-vous que le Bridge Python (port 5000) est lancé'
        });
    }
});

/**
 * GET /symbols - Lister les symboles disponibles sur MT5
 */
app.get('/symbols', async (req, res) => {
  try {
    if (!bridgeConnected) {
      return res.status(503).json({
        status: 'error',
        message: 'Bridge MT5 non disponible'
      });
    }

    const response = await fetch(`${BRIDGE_URL}/symbols`, {
      method: 'GET',
      timeout: 5000
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('❌ Erreur listing symboles:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des symboles'
    });
  }
});

/**
 * GET /price/:symbol - Récupérer le prix actuel de MT5
 */
app.get('/price/:symbol', async (req, res) => {
  try {
    if (!bridgeConnected) {
      return res.status(503).json({
        status: 'error',
        message: 'Bridge MT5 non disponible'
      });
    }

    const { symbol } = req.params;

    const response = await fetch(`${BRIDGE_URL}/price/${symbol}`, {
      method: 'GET',
      timeout: 5000
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error(`❌ Erreur récupération prix ${req.params.symbol}:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération du prix'
    });
  }
});

/**
 * GET /history/:symbol - Récupérer l'historique des prix de MT5
 */
app.get('/history/:symbol', async (req, res) => {
  try {
    if (!bridgeConnected) {
      return res.status(503).json({
        status: 'error',
        message: 'Bridge MT5 non disponible'
      });
    }

    const { symbol } = req.params;
    const { limit = 500, timeframe = '1h' } = req.query;

    const url = new URL(`${BRIDGE_URL}/history/${symbol}`);
    url.searchParams.set('limit', limit);
    url.searchParams.set('timeframe', timeframe);

    const response = await fetch(url.toString(), {
      method: 'GET',
      timeout: 5000
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error(`❌ Erreur récupération historique ${req.params.symbol}:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération de l\'historique'
    });
  }
});

/**
 * GET /positions - Récupérer les positions ouvertes
 */
app.get('/positions', async (req, res) => {
  try {
    if (!bridgeConnected) {
      return res.status(503).json({
        error: 'Bridge Python non disponible',
        positions: []
      });
    }

    // Optionnel: récupérer les positions du bridge Python si disponible
    const response = await fetch(`${BRIDGE_URL}/positions`, {
      method: 'GET',
      timeout: 3000
    }).catch(() => null);

    if (response && response.ok) {
      const positions = await response.json();
      res.json({
        status: 'ok',
        bridgeConnected: true,
        positions: positions.positions || []
      });
    } else {
      res.json({
        status: 'ok',
        bridgeConnected: true,
        positions: [],
        message: 'Pas de positions ouvertes'
      });
    }

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des positions:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des positions',
      positions: []
    });
  }
});

// ========== DÉMARRAGE DU SERVEUR ==========
async function initializeDatabase() {
  try {
    console.log('🔄 Mode base de données: MÉMOIRE (NoMongo)');
    console.log('⚠️  Données réinitialisées à chaque redémarrage du serveur');
    console.log('💡 Pour activer MongoDB, voir la documentation en mode "production"');
  } catch (error) {
    console.error('❌ Erreur initialisation:', error.message);
  }
}

async function startServer() {
  try {
    // Initialiser la base de données
    await initializeDatabase();

    // Vérifier la connexion au Bridge Python
    await checkBridgeHealth();

    app.listen(PORT, () => {
      console.log(`\n🚀 Serveur démarré sur http://localhost:${PORT}`);
      console.log(`🔗 Frontend URL: ${FRONTEND_URL}`);
      console.log(`🐍 Bridge Python: ${BRIDGE_URL} ${bridgeConnected ? '✅' : '⚠️'}`);
      
      if (!bridgeConnected) {
        console.log('\n⚠️  BRIDGE PYTHON NON DÉTECTÉ');
        console.log('   Lancez le serveur Flask sur http://localhost:5000');
        console.log('   Les ordres ne pourront pas être exécutées sans le bridge');
      } else {
        console.log('\n✅ BRIDGE PYTHON ACTIF');
        console.log('   Les ordres seront exécutées via le serveur Python');
      }
      
      console.log('\n📱 Port du serveur Node.js: 3000');
      console.log('🐍 Port du bridge Python: 5000');
      console.log('✅ Serveur prêt à recevoir des ordres\n');
      
      // ========== VÉRIFIER LE BRIDGE PÉRIODIQUEMENT ==========
      // Vérifier toutes les 5 secondes pour détecter le bridge s'il démarre après le serveur
      setInterval(async () => {
        await checkBridgeHealth();
      }, 5000);
    });
  } catch (error) {
    console.error('❌ Impossible de démarrer le serveur:', error);
    process.exit(1);
  }
}

startServer();
