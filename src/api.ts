import type { Candle } from './types';

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
        const response = await fetch(`${this.baseUrl}/trade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...order, symbol: getMT5Symbol(order.symbol) }),
        });
        if (!response.ok) throw new Error('Erreur exécution');
        return await response.json();
    }
}

// ========== DONNÉES DE MARCHÉ MT5 HAUTE FRÉQUENCE ==========
export class MarketDataService {
    private pollInterval: any = null;
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

    public async getHistory(): Promise<Candle[]> {
        try {
            const response = await fetch(`${this.serverUrl}/history/${this.symbol}?limit=500&timeframe=${this.interval}`);
            if (!response.ok) return [];
            const data = await response.json();
            if (data.candles && data.candles.length > 0) {
                const last = data.candles[data.candles.length - 1];
                this.currentCandle = { ...last };
                return data.candles;
            }
            return [];
        } catch { return []; }
    }

    public connect() {
        // Fréquence augmentée à 300ms pour un mouvement "constant"
        const fetchPrice = async () => {
            try {
                const response = await fetch(`${this.serverUrl}/price/${this.symbol}`);
                if (!response.ok) return;
                const data = await response.json();

                const now = Math.floor(Date.now() / 1000);
                const candleStart = this.getTimestampForTimeframe(now);

                if (!this.currentCandle || candleStart > (this.currentCandle.time as number)) {
                    // Nouvelle bougie : on initialise avec le prix actuel
                    this.currentCandle = {
                        time: candleStart as any,
                        open: data.ask,
                        high: data.ask,
                        low: data.ask,
                        close: data.ask,
                        volume: 0
                    };
                } else {
                    // Mise à jour de la bougie en cours (Tick)
                    this.currentCandle.high = Math.max(this.currentCandle.high, data.ask);
                    this.currentCandle.low = Math.min(this.currentCandle.low, data.ask);
                    this.currentCandle.close = data.ask;
                }

                this.onTick({ ...this.currentCandle });
            } catch (e) { console.error("Erreur Tick:", e); }
        };

        fetchPrice();
        this.pollInterval = setInterval(fetchPrice, 300); // Mise à jour ultra-rapide
    }

    public disconnect() {
        if (this.pollInterval) clearInterval(this.pollInterval);
    }
}