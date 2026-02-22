import type { Candle } from './types';
import { io, Socket } from 'socket.io-client';
import AuthClient from './authClient';

// ========== MAPPING DES SYMBOLES MT5 ==========
const SYMBOL_MAPPING: Record<string, string> = {
    'XAUUSD': 'XAUUSD',
    'BTCUSDT': 'BTCUSD',
    'EURUSD': 'EURUSD',
    'GBPUSD': 'GBPUSD',
    'USDJPY': 'USDJPY',
};

export function getMT5Symbol(displayedSymbol: string): string {
    return SYMBOL_MAPPING[displayedSymbol] || displayedSymbol;
}

// ========== BACKEND API CLIENT ==========
export interface TradeOrder {
    symbol: string;
    type: 'buy' | 'sell';
    volume: number;
    tp: number;
    sl: number;
}

export interface TradeResponse {
    success: boolean;
    orderId: string;
    symbol: string;
    type: string;
    volume: number;
    tp: number;
    sl: number;
    timestamp: string;
}

export class TradingApiClient {
    private baseUrl: string;
    constructor(baseUrl: string = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
    }

    async checkHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/health`);
            return response.ok ? await response.json() : null;
        } catch { return null; }
    }

    async executeOrder(order: TradeOrder): Promise<TradeResponse> {
        const token = AuthClient.getToken();
        if (!token) {
            throw new Error('Authentification requise pour lancer un trade');
        }

        const response = await fetch(`${this.baseUrl}/trade`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ ...order, symbol: getMT5Symbol(order.symbol) }),
        });
        if (!response.ok) throw new Error('Erreur exécution');
        return await response.json();
    }
}

// ========== DONNÉES DE MARCHÉ MT5 HAUTE FRÉQUENCE ==========
export class MarketDataService {
    private socket: Socket | null = null;
    private isConnected: boolean = false;
    private onTick: (candle: Candle) => void;
    private symbol: string;
    private interval: string;
    private serverUrl: string;
    
    // État de la bougie en cours pour le calcul OHLC
    private currentCandle: Candle | null = null;

    constructor(symbol: string, interval: string, callback: (candle: Candle) => void, serverUrl: string = 'http://localhost:3000') {
        this.symbol = getMT5Symbol(symbol);
        this.interval = this.convertInterval(interval);
        this.onTick = callback;
        this.serverUrl = serverUrl;
    }

    /**
     * Convertit les labels HTML en durées utilisables (en secondes)
     */
    private convertInterval(tf: string): string {
        const map: Record<string, string> = {
            '1m': '1m', '5m': '5m', '30m': '30m', 
            '1h': '1h', '4h': '4h', '4H': '4h', 
            '1d': '1d', 'D1': '1d', 'Weekly': '1w'
        };
        return map[tf] || '1m';
    }

    /**
     * Calcule le début exact de la bougie pour regrouper les ticks
     */
    private getTimestampForTimeframe(unixSeconds: number): number {
        const unit = this.interval.slice(-1);
        const val = parseInt(this.interval) || 1;
        let seconds = 60;

        if (unit === 'm') seconds = val * 60;
        else if (unit === 'h') seconds = val * 3600;
        else if (unit === 'd') seconds = 86400;
        else if (unit === 'w') seconds = 604800;

        return Math.floor(unixSeconds / seconds) * seconds;
    }

    private normalizeTime(rawTime: any): number {
        let timestamp: number;

        if(typeof rawTime === 'string') {
            timestamp = new Date(rawTime).getTime();
        } else if (typeof rawTime === 'number') {
            timestamp = rawTime;
        } else {
            return Math.floor(Date.now() / 1000);// Sécurité : retourner l'heure actuelle si le format est inconnu
        }
        
        if (timestamp > 10000000000 ) {
                timestamp = Math.floor(timestamp / 1000);
        }
         return timestamp;
    }
    public async getHistory(): Promise<Candle[]> {
        try {
            const response = await fetch(`${this.serverUrl}/history/${this.symbol}?limit=500&timeframe=${this.interval}`);// Récupère 500 bougies pour une analyse plus complète
            if (!response.ok) return [];

            const data = await response.json();

            if (data.candles && data.candles.length > 0) {
            
                const cleanCandles = data.candles.map((c: any) => ({
                    time: this.normalizeTime(c.time)as any,
                    open: parseFloat(c.open),
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close),
                    volume: parseFloat(c.volume || 0)
                }));

                cleanCandles.sort((a: any, b: any) => a.time - b.time);

                const uniqueCandles =  cleanCandles.filter((candle: any, index: number, self: any[]) =>
                    index === 0 || candle.time !== self[index - 1].time
                );
                const last = uniqueCandles[uniqueCandles.length - 1];
                this.currentCandle = { ... last};
                return uniqueCandles        ;
            }
            return [];
        } catch (e) {
            console.error("Erreur récupération historique:", e);
            return [];  
        }
    }

public connect() {
        this.isConnected = true;
        
        // 🔴 NOUVEAU : Connexion instantanée via WebSocket
        this.socket = io(this.serverUrl);

        this.socket.on('connect', () => {
            // On dit au serveur : "Je veux les prix de cette devise"
            this.socket?.emit('subscribe_price', this.symbol);
        });

        // ⚡ Le serveur "pousse" les prix ici automatiquement à la milliseconde près
        this.socket.on('price_update', (data: any) => {
            // Coupe-circuit : on ignore si on a changé de devise entre temps
            if (!this.isConnected || data.symbol !== this.symbol) return;

            const now = Math.floor(Date.now() / 1000);
            const candleStart = this.getTimestampForTimeframe(now);

            // 🛡️ Logique de construction de la bougie en temps réel
            if (!this.currentCandle) {
                this.currentCandle = { 
                    time: candleStart as any, 
                    open: data.ask, 
                    high: data.ask, 
                    low: data.ask, 
                    close: data.ask, 
                    volume: 0 
                };
            } else {
                const lastTime = this.currentCandle.time as number;
                if (candleStart > lastTime) {
                    // Nouvelle bougie (Le temps est bien supérieur à l'ancienne)
                    this.currentCandle = { 
                        time: candleStart as any, 
                        open: data.ask, 
                        high: data.ask, 
                        low: data.ask, 
                        close: data.ask, 
                        volume: 0 
                    };
                } else {
                    // Mise à jour de la bougie en cours
                    this.currentCandle.high = Math.max(this.currentCandle.high, data.ask);
                    this.currentCandle.low = Math.min(this.currentCandle.low, data.ask);
                    this.currentCandle.close = data.ask;
                }
            }
            // Envoi de la bougie mise à jour au graphique
            this.onTick({ ...this.currentCandle });
        });
    }

    public disconnect() {
        this.isConnected = false;
        // 🔴 NOUVEAU : On coupe le tuyau proprement quand on change de devise
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}