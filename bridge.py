import MetaTrader5 as mt5
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging

# ========== LOGGER ==========
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app) 

# ========== INITIALISATION MT5 RÉSILIENTE ==========
mt5_connected = False

try:
    # Tenter l'initialisation
    if mt5.initialize():
        mt5_connected = True
        account_info = mt5.account_info()
        logger.info(f"✅ MT5 CONNECTÉ")
        logger.info(f"   Compte: {account_info.login}")
        logger.info(f"   Broker: {account_info.company}")
        logger.info(f"   Devise: {account_info.currency}")
    else:
        logger.warning("⚠️  MT5 n'a pas pu s'initialiser")
        logger.warning("   Vérifiez que MetaTrader 5 est ouvert")
        logger.warning("   Le serveur continuera en mode démo...")
except Exception as e:
    logger.error(f"❌ Erreur MT5: {e}")
    logger.warning("   Le serveur continuera en mode démo...")

# --- ROUTE RACINE : Test que Flask fonctionne ---
@app.route('/', methods=['GET'])
def index():
    """Endpoint racine pour tester que Flask répond"""
    return jsonify({"status": "Bridge Flask operational"}), 200

# --- ROUTE SANTÉ : Permet au voyant de passer au VERT ---
@app.route('/health', methods=['GET'])
def health():
    """Vérifier l'état du bridge et de MT5"""
    return jsonify({
        "status": "ok", 
        "connected": mt5_connected,
        "service": "Python Bridge MT5",
        "port": 5000
    }), 200

@app.route('/trade', methods=['POST'])
def trade():
    """Exécuter une ordre de trading via MT5"""
    try:
        data = request.json
        
        if not data:
            return jsonify({"status": "error", "message": "Body JSON requis"}), 400
        
        symbol = data.get('symbol', '').upper()
        order_type = data.get('type', '').lower()
        volume = float(data.get('volume', 0))
        sl = float(data.get('sl', 0))
        tp = float(data.get('tp', 0))
        
        # ========== VALIDATION ==========
        if not all([symbol, order_type, volume]):
            return jsonify({
                "status": "error", 
                "message": "Paramètres manquants: symbol, type, volume, sl, tp"
            }), 400
        
        if order_type not in ['buy', 'sell']:
            return jsonify({
                "status": "error", 
                "message": "Type doit être 'buy' ou 'sell'"
            }), 400
        
        if volume <= 0:
            return jsonify({
                "status": "error", 
                "message": "Volume doit être > 0"
            }), 400
        
        # ========== EXÉCUTION ==========
        if not mt5_connected:
            logger.warning(f"⚠️  MT5 non connecté - Ordre DEMO: {symbol}")
            return jsonify({
                "status": "error", 
                "message": "MT5 non connecté. Vérifiez que MetaTrader 5 est ouvert."
            }), 503
        
        try:
            # Récupérer le prix actuel
            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                return jsonify({
                    "status": "error", 
                    "message": f"Symbole '{symbol}' non trouvé sur MT5"
                }), 400
            
            # Déterminer le type d'ordre MT5
            order_type_mt5 = mt5.ORDER_TYPE_BUY if order_type == 'buy' else mt5.ORDER_TYPE_SELL
            price = tick.ask if order_type == 'buy' else tick.bid
            
            # Préparer la requête
            request_data = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": volume,
                "type": order_type_mt5,
                "price": price,
                "sl": sl,
                "tp": tp,
                "magic": 2026,
                "comment": "Trade via Pro Analyst Terminal",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            
            # Envoyer l'ordre
            result = mt5.order_send(request_data)
            
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                logger.error(f"❌ MT5 Error: {result.comment}")
                return jsonify({
                    "status": "error", 
                    "message": f"MT5: {result.comment}"
                }), 400
            
            # Succès
            logger.info(f"✅ Ordre exécutée: {order_type.upper()} {volume}L {symbol} @ {price}")
            logger.info(f"   Order ID: {result.order} | SL: {sl} | TP: {tp}")
            
            return jsonify({
                "status": "success", 
                "order_id": str(result.order),
                "symbol": symbol,
                "type": order_type,
                "volume": volume,
                "price": price,
                "sl": sl,
                "tp": tp
            }), 200
            
        except Exception as e:
            logger.error(f"❌ Erreur exécution MT5: {e}")
            return jsonify({
                "status": "error", 
                "message": f"Erreur MT5: {str(e)}"
            }), 500
            
    except Exception as e:
        logger.error(f"❌ Erreur: {e}")
        return jsonify({
            "status": "error", 
            "message": str(e)
        }), 500

if __name__ == "__main__":
    status = "✅ MT5 CONNECTÉ" if mt5_connected else "⚠️  MODE DÉMO (MT5 non disponible)"
    print(f'''
╔════════════════════════════════════════════════╗
║         🐍 BRIDGE PYTHON - MT5                  ║
║         {status:<37}║
╚════════════════════════════════════════════════╝

🌐 URL: http://localhost:5000
📡 Routes disponibles:
   GET  /health       - Vérifier l'état MT5
   POST /trade        - Exécuter une ordre

✅ Bridge démarré - En attente de connexions...
''')
    app.run(host='localhost', port=5000, debug=False)