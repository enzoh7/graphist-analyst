import zmq
import json
import logging
import traceback
import pandas as pd
import MetaTrader5 as mt5

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("BridgeZMQ")

# ========== INITIALISATION MT5 ==========
if not mt5.initialize():
    logger.critical(f"❌ MT5 initialization failed. Code: {mt5.last_error()}")
    quit()

account_info = mt5.account_info()
if account_info:
    logger.info(f"✅ MT5 CONNECTÉ : {account_info.company} (Compte: {account_info.login})")
else:
    logger.warning("⚠️  MT5 connecté mais aucun compte connecté")

def get_filling_mode():
    """Détermine le mode de remplissage accepté par le broker (Crucial pour MultiBank)"""
    try:
        return mt5.ORDER_FILLING_FOK
    except AttributeError:
        try:
            return mt5.ORDER_FILLING_RETURN
        except AttributeError:
            logger.warning("⚠️  Aucun mode de remplissage spécifique trouvé, utilisation du mode par défaut")
            return 1  # FOK par défaut

# ========== CACHE LOCAL DES BOUGIES ==========
import json
import os
from datetime import datetime

_cache_dir = ".cache_bougies"
if not os.path.exists(_cache_dir):
    os.makedirs(_cache_dir)

def _get_cache_file(symbol, timeframe):
    """Chemin du fichier cache pour un symbole + timeframe"""
    return os.path.join(_cache_dir, f"{symbol}_{timeframe}.json")

def _load_cached_history(symbol, timeframe):
    """Charger les bougies du cache local"""
    cache_file = _get_cache_file(symbol, timeframe)
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r') as f:
                data = json.load(f)
                logger.info(f"📦 Cache trouvé pour {symbol} {timeframe}: {len(data)} bougies")
                return data
        except Exception as e:
            logger.warning(f"⚠️ Erreur lecture cache {symbol}: {e}")
    return None

def _save_cached_history(symbol, timeframe, candles):
    """Enregistrer les bougies dans le cache local"""
    cache_file = _get_cache_file(symbol, timeframe)
    try:
        with open(cache_file, 'w') as f:
            json.dump(candles, f)
            logger.info(f"💾 Cache sauvegardé pour {symbol} {timeframe}: {len(candles)} bougies")
    except Exception as e:
        logger.warning(f"⚠️ Erreur sauvegarde cache {symbol}: {e}")

# ========== CACHE DES SYMBOLES (Ultra-Rapide) ==========
_symbol_cache = {}

def get_real_symbol(requested_symbol):
    """Trouve le vrai nom du symbole chez le broker (ex: XAUUSD -> XAUUSDc) et le mémorise"""
    if requested_symbol in _symbol_cache:
        return _symbol_cache[requested_symbol] # Renvoi instantané si déjà connu

    symbols = mt5.symbols_get()
    if symbols:
        # 1. Cherche la correspondance exacte
        for s in symbols:
            if s.name == requested_symbol:
                _symbol_cache[requested_symbol] = s.name
                return s.name
        # 2. Cherche si le symbole commence par le nom (ex: XAUUSDc)
        for s in symbols:
            if s.name.startswith(requested_symbol):
                _symbol_cache[requested_symbol] = s.name
                return s.name
                
    return requested_symbol # Par défaut

# ========== DÉMARRAGE ZEROMQ ==========
context = zmq.Context()
socket = context.socket(zmq.REP)
socket.bind("tcp://127.0.0.1:5555")
logger.info("🚀 Bridge ZMQ démarré sur tcp://127.0.0.1:5555")

while True:
    message = socket.recv_string()
    response = {"status": "error", "message": "Unknown error"}
    action = None # Initialisé à None pour éviter les erreurs dans les logs si JSON plante

    try: 
        req = json.loads(message)
        action = req.get("action")

        if action == "health":
            response = {"status": "ok", "mt5_connected": True}

        elif action == "price":
            symbol = get_real_symbol(req.get("symbol"))
            mt5.symbol_select(symbol, True)
            tick = mt5.symbol_info_tick(symbol)

            if tick:
                response = {"status": "success", "bid": tick.bid, "ask": tick.ask}
            else:
                # 🔴 Marché fermé, pas une erreur - retourner statut explicite
                sym_info = mt5.symbol_info(symbol)
                if sym_info:
                    response = {"status": "market_closed", "message": f"Marché fermé pour {symbol}", "symbol_exists": True}
                else:
                    response = {"status": "error", "message": f"Symbole introuvable: {symbol}", "symbol_exists": False}

        elif action == "history":
            symbol = get_real_symbol(req.get("symbol"))
            limit = req.get("limit", 500)
            tf_str = req.get("timeframe", "1m").lower()

            tf_map = {
                "1m": mt5.TIMEFRAME_M1,
                "5m": mt5.TIMEFRAME_M5,
                "15m": mt5.TIMEFRAME_M15,
                "30m": mt5.TIMEFRAME_M30,
                "1h": mt5.TIMEFRAME_H1,
                "4h": mt5.TIMEFRAME_H4,
                "1d": mt5.TIMEFRAME_D1,
                "1w": mt5.TIMEFRAME_W1
            }
            tf = tf_map.get(tf_str, mt5.TIMEFRAME_M1)

            mt5.symbol_select(symbol, True)
            rates = mt5.copy_rates_from_pos(symbol, tf, 0, limit)

            # 🔴 SI MT5 retourne None ou vide, essayer le cache
            if rates is not None and len(rates) > 0:
                df = pd.DataFrame(rates)
                df['time'] = df['time'].astype(int)
                candles = df.to_dict(orient="records")
                # Enregistrer dans le cache pour la prochaine fois
                _save_cached_history(symbol, tf_str, candles)
                response = {"status": "success", "candles": candles, "from_cache": False}
            else:
                # Historique vide en direct, essayer le cache
                cached = _load_cached_history(symbol, tf_str)
                if cached:
                    response = {"status": "success", "candles": cached, "from_cache": True, "message": "Données du cache (marché fermé)"}
                else:
                    # Pas de cache - vrai erreur
                    response = {"status": "no_data", "message": f"Marché fermé pour {symbol} - pas de cache disponible", "candles": []}

        elif action == "trade":
            symbol = get_real_symbol(req.get("symbol"))
            order_type = req.get("type", "").lower()
            volume = float(req.get("volume", 0.01))
            sl_raw = float(req.get("sl", 0))
            tp_raw = float(req.get("tp", 0))

            mt5.symbol_select(symbol, True)
            s_info = mt5.symbol_info(symbol)
            
            if not s_info:
                response = {"status": "error", "message": f"Symbole invalide: {symbol}"}
            else:
                tick = mt5.symbol_info_tick(symbol)
                price_raw = tick.ask if order_type == 'buy' else tick.bid
                price = round(price_raw, s_info.digits)
                sl = round(sl_raw, s_info.digits) if sl_raw > 0 else 0.0
                tp = round(tp_raw, s_info.digits) if tp_raw > 0 else 0.0
                
                type_mt5 = mt5.ORDER_TYPE_BUY if order_type == "buy" else mt5.ORDER_TYPE_SELL
                filling_mode = get_filling_mode()

                request_trade = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "symbol": symbol,
                    "volume": volume,
                    "type": type_mt5,
                    "price": price,
                    "sl": sl,
                    "tp": tp,
                    "deviation": 20,
                    "magic": 2026,
                    "comment": "Graphist Analyst ZMQ",
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": filling_mode,
                }

                logger.info(f"📤 Envoi ordre: {order_type.upper()} {volume} {symbol} @ {price}")
                result = mt5.order_send(request_trade)

                if result is None:
                    response = {"status": "error", "message": f"Erreur MT5 (None). Code: {mt5.last_error()}"}
                elif result.retcode != mt5.TRADE_RETCODE_DONE:
                    logger.error(f"❌ Ordre rejeté: {result.comment}")
                    response = {"status": "error", "message": result.comment}
                else:
                    logger.info(f"✅ Ordre exécuté: ID {result.order}")
                    response = {"status": "success", "order_id": str(result.order)}

        elif action == "positions":
            positions = mt5.positions_get()
            if positions:
                df = pd.DataFrame(list(positions), columns=positions[0]._asdict().keys())
                response = {"status": "success", "positions": df.to_dict(orient="records")}
            else:
                response = {"status": "success", "positions": []}

        elif action == "symbols":
            symbols = mt5.symbols_get()
            if symbols:
                response = {"status": "success", "symbols": [s.name for s in symbols if s.visible]}
            else:
                response = {"status": "success", "symbols": []}

        elif action == "switch_account":
            login = int(req.get("login", 0))
            password = req.get("password", "")
            server = req.get("server", "")

            if not login or not password or not server:
                response = {"status": "error", "message": "Identifiants manquants (login, password, server)"}
            else:
                authorized = mt5.login(login, password=password, server=server)
                
                if authorized:
                    account_info = mt5.account_info()
                    logger.info(f"🔄 SWITCH RÉUSSI : Connecté au compte {login} ({server})")
                    response = {
                        "status": "success", 
                        "message": "Connecté avec succès", 
                        "company": account_info.company, 
                        "login": account_info.login
                    }
                else:
                    logger.error(f"❌ SWITCH ÉCHOUÉ : Erreur {mt5.last_error()}")
                    response = {"status": "error", "message": f"Échec de connexion MT5. Vérifiez vos identifiants. Code: {mt5.last_error()}"}

    except Exception as e:
        # SÉCURITÉ MAXIMALE : On log l'erreur mais le script Python ne crash jamais.
        logger.error(f"❌ Erreur inattendue: {e}")
        logger.error(traceback.format_exc())
        response = {"status": "error", "message": "Erreur interne du Bridge"}

    # === SYSTÈME DE LOG HAUTE-VITESSE ===
    if action and action != "health": # On ignore le "ping" de 10s pour ne pas polluer
        if action == "history":
            nb_candles = len(response.get("candles", []))
            from_cache = response.get("from_cache", False)
            cache_str = "📦 CACHE" if from_cache else "✓ DIRECT"
            status_str = f"{nb_candles} bougies ({cache_str})"
            logger.info(f"⚡ ZMQ | Action: {action.upper():<7} | Symbole: {symbol:<8} | Résultat: {status_str}")
        elif action == "price":
            status = response.get("status", "error")
            if status == "success":
                logger.info(f"⚡ ZMQ | Action: {action.upper():<7} | Symbole: {symbol:<8} | bid={response.get('bid'):.2f}, ask={response.get('ask'):.2f}")
            elif status == "market_closed":
                logger.info(f"⚡ ZMQ | Action: {action.upper():<7} | Symbole: {symbol:<8} | 🔴 MARCHÉ FERMÉ")
            else:
                logger.error(f"⚡ ZMQ | Action: {action.upper():<7} | Symbole: {symbol:<8} | ❌ {status}")
        else:
            status = response.get("status", "error")
            requested_symbol = req.get('symbol', 'N/A') if 'req' in locals() else 'N/A'
            logger.info(f"⚡ ZMQ | Action: {action.upper():<7} | Symbole: {requested_symbol:<8} | Statut: {status}")

    socket.send_string(json.dumps(response))