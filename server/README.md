# 📊 Pro Analyst Terminal - Backend Setup Guide

## 🚀 Installation du Serveur Backend

### Prérequis
- **Node.js** ^18.0.0 (Download: https://nodejs.org/)
- MetaApi.cloud Account (https://app.metaapi.cloud/)
- Compte de trading MT4/MT5 connecté via MultiBank

---

## 📦 Étape 1 : Installer les dépendances

```bash
cd server
npm install
```

### Dépendances instalées:
- **express** - Serveur HTTP minimaliste
- **cors** - Gestion des requêtes cross-origin (Frontend → Backend)
- **dotenv** - Variables d'environnement sécurisées
- **metaapi-sdk-nodejs** - SDK MetaApi official

---

## 🔐 Étape 2 : Configurer les variables d'environnement

### 1. Créer un fichier `.env` dans le dossier `/server`

```bash
cp .env.example .env
```

### 2. Remplir les credentials MetaApi

```env
# 1. Obtenir votre META_API_TOKEN:
#    - Allez sur https://app.metaapi.cloud
#    - Menu: "Settings" → "API Tokens" 
#    - Copier votre token

META_API_TOKEN=YOUR_TOKEN_HERE

# 2. Obtenir votre ACCOUNT_ID:
#    - Menu: "Accounts"
#    - Cliquer sur votre compte MT4/MT5
#    - Copier l'ID (format: xxx-xxxxx-xx)

ACCOUNT_ID=YOUR_ACCOUNT_ID_HERE

# 3. URL du Frontend (si Vite est sur un autre port)
FRONTEND_URL=http://localhost:5173
```

---

## ▶️ Étape 3 : Démarrer le serveur

### Mode production:
```bash
npm start
```

### Mode développement (avec auto-reload):
```bash
npm run dev
```

**Output attendu:**
```
🔄 Initialisation de MetaApi...
✅ Compte trouvé: MT4-Account-Name
✅ Connecté au compte MetaApi
✅ Compte synchronisé et prêt

🚀 Serveur démarré sur http://localhost:3000
🔗 Frontend URL: http://localhost:5173
📡 Compte connecté: MT4-Account-Name

✅ Serveur prêt à recevoir des ordres
```

---

## 🔗 Modifier votre Frontend (main.ts)

Votre frontend utilise maintenant le client API pour communiquer avec le backend:

```typescript
// Cet import est déjà fait dans src/api.ts:
import { TradingApiClient } from './api';

// Usage dans le formulaire de trading:
const client = new TradingApiClient('http://localhost:3000');

// Exécuter une ordem BUY
await client.buy('EURUSD', 1.0, 1.1050, 1.0950);

// Exécuter une ordem SELL  
await client.sell('EURUSD', 1.0, 1.0950, 1.0850);
```

---

## 📡 Endpoints disponibles

### 1. GET /health
Vérifier la santé du serveur

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "connected": true,
  "account": {
    "id": "xxx-xxxxx-xx",
    "name": "MT4-Account-Name",
    "type": "real",
    "state": "DEPLOYED"
  }
}
```

### 2. POST /trade
Exécuter une ordem de marché (BUY/SELL)

```bash
curl -X POST http://localhost:3000/trade \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD",
    "type": "buy",
    "volume": 1.0,
    "takeProfit": 1.1050,
    "stopLoss": 1.0950
  }'
```

### 3. GET /positions
Récupérer toutes les positions ouvertes

```bash
curl http://localhost:3000/positions
```

---

## 🐛 Troubleshooting

### ❌ "Cannot find module 'metaapi-sdk-nodejs'"
```bash
npm install metaapi-sdk-nodejs
```

### ❌ "ACCOUNT_ID not found"
- Vérifier que .env contient l'ACCOUNT_ID
- Redémarrer le serveur avec: `npm start`

### ❌ "Serveur n'est pas connecté à MetaApi"
- Vérifier que META_API_TOKEN est valide
- Vérifier que le compte est DEPLOYED sur MetaApi.cloud
- Vérifier la connexion internet

### ❌ CORS Error au Frontend
Assurez-vous que `FRONTEND_URL` dans `.env` correspond à votre port Vite:
```env
# Si Vite est sur port 5174:
FRONTEND_URL=http://localhost:5174
```

---

## 🔄 Architecture

```
Frontend (Vite/TypeScript)
        ↓
TradingApiClient (src/api.ts)
        ↓
Fetch POST /trade
        ↓
Express Backend (server/server.js)
        ↓
MetaApi SDK
        ↓
MetaApi Cloud API
        ↓
MT4/MT5 Broker (MultiBank)
```

---

## 📝 Notes importantes

✅ **Sécurité:** Never commit `.env` to git!  
✅ **CORS:** Le backend accepte uniquement les requêtes du frontend  
✅ **Logs:** Toutes les ordres sont loggées dans la console du serveur  
✅ **Auto-reconnect:** MetaApi reconnecte automatiquement si la connexion est perdue

---

## 🎓 Exemple complet : Envoyer une ordre depuis le Frontend

```typescript
// Dans src/main.ts
class TradingPanel {
    private tradingClient: TradingApiClient;

    constructor() {
        this.tradingClient = new TradingApiClient('http://localhost:3000');
    }

    async executeOrder() {
        const order = {
            symbol: 'EURUSD',
            type: 'buy',
            volume: 1.0,
            takeProfit: 1.1050,
            stopLoss: 1.0950
        };

        try {
            const response = await this.tradingClient.executeOrder(order);
            console.log('✅ Ordre exécutée:', response.orderId);
        } catch (error) {
            console.error('❌ Erreur:', error);
        }
    }
}
```

---

## 📞 Support

Configuration MetaApi.cloud: https://metaapi.cloud/docs  
Discord MetaApi: https://slack.metaapi.cloud/

---

**Dernière mise à jour:** février 2026
