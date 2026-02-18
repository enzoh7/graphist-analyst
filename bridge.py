import MetaTrader5 as mt5
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging

# ========== LOGGER ==========
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app) 

# ========== INITIALISATION MT5 ==========
mt5_connected = False
try:
    if mt5.initialize():
        mt5_connected = True
        logger.info(f"✅ MT5 CONNECTÉ : {mt5.account_info().company}")
    else:
        logger.error("❌ MT5 n'est pas ouvert sur votre PC")
except Exception as e:
    logger.error(f"❌ Erreur MT5: {e}")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "connected": mt5_connected}), 200

@app.route('/price/<symbol>', methods=['GET'])
def get_price(symbol):
    try:
        if not mt5_connected: return jsonify({"status": "error"}), 503
        symbol_input = symbol.upper().replace('USDT', 'USD')
        
        # Chercher le symbole exact
        symbols = mt5.symbols_get()
        matching = [s for s in symbols if s.name.startswith(symbol_input)]
        if not matching:
            matching = [s for s in symbols if symbol_input in s.name]
        if not matching:
            return jsonify({"status": "error", "message": f"Symbol {symbol_input} not found"}), 404
        
        symbol = matching[0].name
        mt5.symbol_select(symbol)
        tick = mt5.symbol_info_tick(symbol)
        if not tick: return jsonify({"status": "error", "message": "Tick data unavailable"}), 404
        return jsonify({"status": "success", "symbol": symbol, "ask": float(tick.ask), "bid": float(tick.bid), "time": int(tick.time), "volume": float(tick.volume)})
    except Exception as e:
        logger.error(f"❌ get_price error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/history/<symbol>', methods=['GET'])
def get_history(symbol):
    try:
        symbol_input = symbol.upper().replace('USDT', 'USD')
        limit = int(request.args.get('limit', 500))
        timeframe_str = request.args.get('timeframe', '1m').lower()
        
        # Map timeframes
        tf_map = {
            '1m': mt5.TIMEFRAME_M1, 
            '5m': mt5.TIMEFRAME_M5, 
            '15m': mt5.TIMEFRAME_M15, 
            '30m': mt5.TIMEFRAME_M30,
            '1h': mt5.TIMEFRAME_H1, 
            '4h': mt5.TIMEFRAME_H4,
            '1d': mt5.TIMEFRAME_D1,
            '1w': mt5.TIMEFRAME_W1
        }
        
        # Chercher le symbole exact (IMPORTANT!)
        symbols = mt5.symbols_get()
        matching = [s for s in symbols if s.name.startswith(symbol_input)]
        if not matching:
            matching = [s for s in symbols if symbol_input in s.name]
        if not matching:
            logger.warning(f"⚠️  Symbol {symbol_input} not found. Available: {[s.name for s in symbols[:10]]}")
            return jsonify({"status": "error", "message": f"Symbol {symbol_input} not found"}), 404
        
        symbol = matching[0].name
        logger.info(f"✅ Found symbol: {symbol}")
        
        # Activer et récupérer
        mt5.symbol_select(symbol)
        rates = mt5.copy_rates_from_pos(symbol, tf_map.get(timeframe_str, mt5.TIMEFRAME_M1), 0, limit)
        
        if rates is None or len(rates) == 0:
            logger.error(f"❌ No rates for {symbol}")
            return jsonify({"status": "error", "message": f"No data for {symbol}"}), 404
        
        candles = []
        for r in rates:
            try:
                candles.append({
                    "time": int(r['time']), 
                    "open": float(r['open']), 
                    "high": float(r['high']), 
                    "low": float(r['low']), 
                    "close": float(r['close']),
                    "volume": float(r['tick_volume'])
                })
            except Exception as e:
                logger.error(f"❌ Error converting rate: {e}")
                continue
        
        logger.info(f"✅ Returned {len(candles)} candles for {symbol} {timeframe_str}")
        return jsonify({"status": "success", "candles": candles})
    except Exception as e:
        logger.error(f"❌ get_history error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/trade', methods=['POST'])
def trade():
    try:
        data = request.json
        # CORRECTION : Traduction automatique BTCUSDT -> BTCUSD pour MultiBank
        symbol_input = data.get('symbol', '').upper().replace('USDT', 'USD')
        order_type = data.get('type', '').lower()
        volume = float(data.get('volume', 0.01))
        sl = float(data.get('sl', 0))
        tp = float(data.get('tp', 0))

        if not mt5_connected: return jsonify({"status": "error", "message": "MT5 non connecté"}), 503

        # 1. Trouver le nom exact (chercher avec plusieurs variantes)
        symbols = mt5.symbols_get()
        matching = [s for s in symbols if s.name.startswith(symbol_input)]
        
        # Si pas trouvé, essayer de chercher partiellement
        if not matching:
            logger.warning(f"⚠️  Symbole {symbol_input} non trouvé par startswith, recherche partielle...")
            matching = [s for s in symbols if symbol_input in s.name]
        
        if not matching:
            # Essayer de lister les symboles proches
            logger.error(f"❌ Symbole {symbol_input} non trouvé sur MT5")
            close_matches = [s.name for s in symbols if any(p in s.name for p in [symbol_input[:3], symbol_input[-3:]])][: 5]
            logger.error(f"   Symboles proches: {close_matches}")
            return jsonify({
                "status": "error",
                "message": f"Symbole {symbol_input} non trouvé sur MT5",
                "suggestions": close_matches
            }), 400
        
        symbol = matching[0].name
        logger.info(f"✅ Symbole trouvé: {symbol}")
        
        mt5.symbol_select(symbol)
        s_info = mt5.symbol_info(symbol)
        
        if not s_info:
            logger.error(f"❌ Impossible de récupérer les infos du symbole {symbol}")
            return jsonify({"status": "error", "message": f"Erreur symbole {symbol}"}), 400

        # 2. Mode de remplissage - utiliser ce qui est disponible
        # FOK = 1, RETURN = 2, IOC n'existe pas toujours
        try:
            filling = mt5.ORDER_FILLING_FOK
        except AttributeError:
            try:
                filling = mt5.ORDER_FILLING_RETURN
            except AttributeError:
                # Fallback: pas de spécification du type de remplissage
                filling = 1  # FOK par défaut

        # 3. Prix et Arrondi (Crucial pour MultiBank Réel)
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            logger.error(f"❌ Impossible de récupérer le prix pour {symbol}")
            return jsonify({"status": "error", "message": f"Prix non disponible pour {symbol}"}), 400
            
        price = round(tick.ask if order_type == 'buy' else tick.bid, s_info.digits)

        req_data = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": mt5.ORDER_TYPE_BUY if order_type == 'buy' else mt5.ORDER_TYPE_SELL,
            "price": price,
            "magic": 2026,
            "comment": "Pro Analyst Trade",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling,
        }

        if sl > 0: req_data["sl"] = round(sl, s_info.digits)
        if tp > 0: req_data["tp"] = round(tp, s_info.digits)

        logger.info(f"📤 Envoi ordre: {order_type.upper()} {volume} {symbol} @ {price}")
        result = mt5.order_send(req_data)
        
        if result is None:
            logger.error(f"❌ order_send retourné None")
            logger.error(f"   MT5 error: {mt5.last_error()}")
            return jsonify({"status": "error", "message": "Erreur ordre (None returned)"}), 400
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logger.error(f"❌ Ordre rejeté: {result.comment}")
            return jsonify({"status": "error", "message": f"MT5: {result.comment}"}), 400
        
        logger.info(f"✅ Ordre exécutée: ID {result.order}")
        return jsonify({"status": "success", "order_id": str(result.order)}), 200
    except Exception as e:
        logger.error(f"❌ Erreur trade: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    app.run(host='127.0.0.1', port=5000)