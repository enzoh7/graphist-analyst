import './style.css';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Candle } from './types';
import { MarketDataService } from './api';

// ========== ÉTAT GLOBAL ==========
type ToolType = 'cursor' | 'hline' | 'fib' | 'position';
let activeTool: ToolType = 'cursor';
let firstClickPoint: { time: any; price: number } | null = null;

// ========== CLASSE PRINCIPALE ==========
class TradingPlatform {
    private chart!: IChartApi;
    private candlesSeries!: ISeriesApi<'Candlestick'>;
    private currentSymbol: string = 'BTCUSDT';
    private currentInterval: string = '1m';
    private marketService: MarketDataService | null = null;
    private priceLines: Map<number, any> = new Map(); // Pour Fibonacci
    
    constructor() {
        const container = document.getElementById('chart-container');
        if (!container) {
            console.error('❌ #chart-container not found!');
            return;
        }

        // S'assurer que le conteneur prend la bonne taille
        const rect = container.getBoundingClientRect();
        console.log(`📊 Dimensions du conteneur: ${rect.width}x${rect.height}`);

        // Créer le graphique
        this.chart = createChart(container, {
            layout: {
                background: { color: '#131722' },
                textColor: '#d1d4dc',
                fontSize: 12,
            },
            grid: {
                vertLines: { color: '#2a2e39' },
                horzLines: { color: '#2a2e39' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#2a2e39',
            },
            rightPriceScale: {
                borderColor: '#2a2e39',
            },
        });

        // Ajouter la série de chandelier
        this.candlesSeries = this.chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        console.log('✅ Série de chandelier créée');

        // Initialiser
        this.setupToolbar();
        this.setupChartInteractions();
        this.setupAssetSelector();
        this.setupTimeframeButtons();

        console.log('✅ Interfaces utilisateur initialisées');

        // Charger les données initiales
        this.loadMarketData('BTCUSDT', '1m');

        // Adapter au redimensionnement
        window.addEventListener('resize', () => {
            const chartContainer = document.getElementById('chart-container');
            if (chartContainer) {
                this.chart.applyOptions({ 
                    width: chartContainer.clientWidth, 
                    height: chartContainer.clientHeight 
                });
            }
        });
    }

    // ========== GESTION DE LA BARRE D'OUTILS ==========
    private setupToolbar() {
        document.querySelectorAll('.tool-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                // Désactiver tous les autres
                document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
                
                // Activer celui-ci
                btn.classList.add('active');

                // Mettre à jour l'outil actif
                const toolId = (btn as HTMLElement).id;
                const toolMap: Record<string, ToolType> = {
                    'tool-cursor': 'cursor',
                    'tool-hline': 'hline',
                    'tool-fib': 'fib',
                    'tool-position': 'position',
                };

                activeTool = toolMap[toolId] || 'cursor';
                firstClickPoint = null; // Reset click tracking
                console.log(`✅ Outil actif: ${activeTool}`);
            });
        });
    }

    // ========== INTERACTIONS AVEC LE GRAPHIQUE ==========
    private setupChartInteractions() {
        const container = document.getElementById('chart-container') as HTMLElement;
        if (!container) return;

        container.addEventListener('click', (event: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            // Obtenir les coordonnées temps/prix du graphique
            const logicalPosition = this.chart.timeScale().coordinateToLogical(x);
            const seriesCoordinate = this.candlesSeries.coordinateToPrice(y);

            if (logicalPosition === null || seriesCoordinate === null) {
                return;
            }

            const clickPoint = { time: logicalPosition as any, price: seriesCoordinate };

            if (activeTool === 'cursor') {
                console.log(`📍 Curseur: ${clickPoint.price.toFixed(2)}`);
                return;
            }

            // Pour les autres outils, on a besoin de 2 clics
            if (!firstClickPoint) {
                firstClickPoint = clickPoint;
                console.log(`📌 Point 1 marqué: ${clickPoint.price.toFixed(2)}`);
            } else {
                this.executeTool(activeTool, firstClickPoint, clickPoint);
                firstClickPoint = null;
            }
        });
    }

    // ========== EXÉCUTION DES OUTILS ==========
    private executeTool(
        tool: ToolType,
        p1: { time: any; price: number },
        p2: { time: any; price: number }
    ) {
        console.log(`🎨 Exécution: ${tool}`);

        if (tool === 'hline') {
            this.drawHorizontalLine(p1.price);
        } else if (tool === 'fib') {
            this.drawFibonacci(p1.price, p2.price);
        } else if (tool === 'position') {
            this.drawPosition(p1.price, p2.price);
        }
    }

    // Ligne horizontale
    private drawHorizontalLine(price: number) {
        const line = this.chart.addSeries(LineSeries, {
            color: '#2962ff',
            lineWidth: 2,
            title: `Ligne: ${price.toFixed(2)}`,
        });

        // Le graphique gère automatiquement la ligne horizontale
        const timeScale = this.chart.timeScale();
        const range = timeScale.getVisibleRange();
        if (range) {
            const data = [
                { time: range.from, value: price },
                { time: range.to, value: price },
            ];
            line.setData(data as any);
        }
        console.log(`📏 Ligne horizontale tracée à ${price}`);
    }

    // Fibonacci
    private drawFibonacci(startPrice: number, endPrice: number) {
        const diff = startPrice - endPrice;
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

        levels.forEach((level) => {
            const price = startPrice - diff * level;
            const label = level === 0 ? '0%' : level === 1 ? '100%' : (level * 100).toFixed(1) + '%';

            const priceLine = this.candlesSeries.createPriceLine({
                price: price,
                color: '#9c27b0',
                lineWidth: 1,
                lineStyle: 2, // Tiretée
                axisLabelVisible: true,
                title: `Fib ${label}`,
            });

            this.priceLines.set(price, priceLine);
        });

        console.log(`📊 Fibonacci tracé de ${startPrice} à ${endPrice}`);
    }

    // Position (Entry, TP, SL)
    private drawPosition(entryPrice: number, targetPrice: number) {
        const diff = Math.abs(targetPrice - entryPrice);
        const slPrice = entryPrice < targetPrice ? entryPrice - diff : entryPrice + diff;

        // Entrée
        this.candlesSeries.createPriceLine({
            price: entryPrice,
            color: '#00ff00',
            lineWidth: 2,
            axisLabelVisible: true,
            title: `ENTRY: ${entryPrice.toFixed(2)}`,
        });

        // Target Profit
        this.candlesSeries.createPriceLine({
            price: targetPrice,
            color: '#00ff00',
            lineWidth: 2,
            lineStyle: 1,
            axisLabelVisible: true,
            title: `TP: ${targetPrice.toFixed(2)}`,
        });

        // Stop Loss
        this.candlesSeries.createPriceLine({
            price: slPrice,
            color: '#ff0000',
            lineWidth: 2,
            lineStyle: 1,
            axisLabelVisible: true,
            title: `SL: ${slPrice.toFixed(2)}`,
        });

        const ratio = (diff / entryPrice * 100).toFixed(2);
        console.log(`🎯 Position: ENTRY=${entryPrice.toFixed(2)}, TP=${targetPrice.toFixed(2)}, SL=${slPrice.toFixed(2)} (${ratio}%)`);
    }

    // ========== SÉLECTEUR D'ASSET ==========
    private setupAssetSelector() {
        const select = document.getElementById('asset-select') as HTMLSelectElement;
        if (select) {
            select.addEventListener('change', (e) => {
                this.currentSymbol = (e.target as HTMLSelectElement).value;
                this.loadMarketData(this.currentSymbol, this.currentInterval);
            });
        }
    }

    // ========== SÉLECTEUR DE TIMEFRAME ==========
    private setupTimeframeButtons() {
        document.querySelectorAll('.tf-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tf-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');

                this.currentInterval = (btn as HTMLElement).getAttribute('data-tf') || '1m';
                this.loadMarketData(this.currentSymbol, this.currentInterval);
            });
        });
    }

    // ========== CHARGEMENT DES DONNÉES ==========
    private async loadMarketData(symbol: string, interval: string) {
        console.log(`📡 Chargement: ${symbol} ${interval}`);

        // Arrêter le service précédent
        if (this.marketService) {
            this.marketService.disconnect();
        }

        // Créer un nouveau service
        this.marketService = new MarketDataService(symbol, interval, (candle: Candle) => {
            this.candlesSeries.update(candle);
        });

        try {
            // Charger l'historique
            const history = await this.marketService.getHistory();
            if (history && history.length > 0) {
                this.candlesSeries.setData(history);
                console.log(`✅ ${history.length} bougies chargées`);
            }

            // Connecter au WebSocket pour les mises à jour en temps réel
            this.marketService.connect();
        } catch (error) {
            console.error(`❌ Erreur chargement ${symbol}:`, error);
        }
    }
}

// ========== INITIALISATION ==========
function initPlatform() {
    console.log('🚀 Démarrage de la plateforme de trading...');
    const platform = new TradingPlatform();
    console.log('🎉 Plateforme initialisée');
}

// Vérifie si le document est déjà chargé
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initPlatform);
} else {
    // Le document est déjà chargé (moins courant avec modules)
    initPlatform();
}