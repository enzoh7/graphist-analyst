import './style.css';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Candle } from './types';
import { MarketDataService, TradingApiClient, type TradeOrder } from './api';
import './authUI'; // Initialiser l'authentification
import './newsManager'; // Initialiser le gestionnaire de news
import DrawingApiClient from './drawingApiClient'; // Charger/sauvegarder les dessins
import AuthClient from './authClient'; // Vérifier l'état d'authentification

// ========== TYPES ==========
type ToolType = 'cursor' | 'hline' | 'fib' | 'rect' | 'position';

interface DrawingObject {
    id: string;
    type: 'hline' | 'rect' | 'position' | 'fib';
    p1: { time: any; price: number };
    p2?: { time: any; price: number };
    color: string;
    textColor: string;
    text: string;
    textPos: 'top' | 'middle' | 'bottom';
    textSize: number;
    series: ISeriesApi<any>[];
}

interface ActivePosition {
    id: string;
    symbol: string;
    type: 'buy' | 'sell';
    entry: number;
    tp: number;
    sl: number;
    volume: number;
    priceLinesIds: string[]; // Pour tracker les price lines
}

// ========== ÉTAT GLOBAL ==========
let activeTool: ToolType = 'cursor';
let firstClickPoint: { time: any; price: number } | null = null;

// ========== CLASSE TRADING PANEL ==========
class TradingPanel {
    private tradingClient: TradingApiClient;
    private form: HTMLFormElement;
    private serverStatus: HTMLElement | null;
    private orderStatusEl: HTMLElement | null;
    private marketStatusEl: HTMLElement | null; // 🔴 Détecteur marché
    private tradingPlatform: TradingPlatform | null = null;
    public activePositions: ActivePosition[] = [];
    private currentPrice: number = 0;
    private priceLastUpdateTime: number = 0;
    private inactivityTimeout: any = null; // 🔴 Chrono d'inactivité

    constructor(tradingPlatform?: TradingPlatform) {
        this.tradingClient = new TradingApiClient();
        this.form = document.getElementById('trade-form') as HTMLFormElement;
        this.serverStatus = document.getElementById('server-status');
        this.orderStatusEl = document.getElementById('order-status');
        this.marketStatusEl = document.getElementById('market-status');
        this.tradingPlatform = tradingPlatform || null;

        if (!this.form) {
            console.warn('⚠️ Formulaire de trading non trouvé');
            return;
        }

        this.setupEventListeners();
        this.checkServerHealth();
        setInterval(() => this.checkServerHealth(), 5000);
    }

    private setupEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        const tpInput = document.getElementById('trade-tp') as HTMLInputElement;
        const slInput = document.getElementById('trade-sl') as HTMLInputElement;
        const entryInput = document.getElementById('entry-price') as HTMLInputElement;
        const volumeInput = document.getElementById('trade-volume') as HTMLInputElement;

        // Initialiser trade-volume avec 0.01 par défaut
        if (volumeInput && !volumeInput.value) {
            volumeInput.value = '0.01';
        }

        if (tpInput && slInput && entryInput) {
            tpInput.addEventListener('input', () => this.calculateRiskReward());
            slInput.addEventListener('input', () => this.calculateRiskReward());
            entryInput.addEventListener('input', () => this.calculateRiskReward());
        }

        // Synchroniser le symbole du graphique avec le trading panel
        const assetSelect = document.getElementById('asset-select') as HTMLSelectElement;
        const symbolSelect = document.getElementById('trade-symbol') as HTMLSelectElement;
        
        if (assetSelect && symbolSelect) {
            assetSelect.addEventListener('change', () => {
                const selectedSymbol = assetSelect.value;
                symbolSelect.value = selectedSymbol;
                console.log(`📊 Symbole synchronisé: ${selectedSymbol}`);
                this.updateCurrentPrice();
            });
        }

        if (symbolSelect) {
            symbolSelect.addEventListener('change', () => {
                this.updateCurrentPrice();
            });
        }
        
        setTimeout(() => this.updateCurrentPrice(), 100);
    }

    private async checkServerHealth() {
        try {
            const healthData = await this.tradingClient.checkHealth();
            
            if (this.serverStatus && healthData) {
                if (healthData.bridgeConnected) {
                    this.serverStatus.textContent = '● Serveur (3000) + Bridge (5000) ✓';
                    this.serverStatus.classList.remove('offline');
                    this.serverStatus.classList.add('online');
                    (this.form.querySelector('#trade-submit') as HTMLButtonElement).disabled = false;
                } else {
                    this.serverStatus.textContent = '⚠️ Serveur (3000) OK, Bridge (5000) ✗';
                    this.serverStatus.classList.add('offline');
                    this.serverStatus.classList.remove('online');
                    (this.form.querySelector('#trade-submit') as HTMLButtonElement).disabled = true;
                }
            }
        } catch (error) {
            console.error('Erreur vérification serveur:', error);
            if (this.serverStatus) {
                this.serverStatus.textContent = '● Serveur indisponible';
                this.serverStatus.classList.add('offline');
            }
        }
    }

    private calculateRiskReward() {
        const entryInput = document.getElementById('entry-price') as HTMLInputElement;
        const tpInput = document.getElementById('trade-tp') as HTMLInputElement;
        const slInput = document.getElementById('trade-sl') as HTMLInputElement;
        const rrInput = document.getElementById('risk-reward') as HTMLInputElement;

        const entry = parseFloat(entryInput.value);
        const tp = parseFloat(tpInput.value);
        const sl = parseFloat(slInput.value);

        if (entry > 0 && tp > 0 && sl > 0) {
            const riskPips = Math.abs(entry - sl);
            const rewardPips = Math.abs(tp - entry);
            const ratio = (rewardPips / riskPips).toFixed(2);
            if (rrInput) {
                rrInput.value = `1:${ratio}`;
            }
        }
    }

    // 🔴 MODIFIÉ : On ne met plus N/A si ça plante (pour garder le prix du weekend)
    public updateCurrentPrice() {
        const symbol = (document.getElementById('trade-symbol') as HTMLSelectElement).value || 'XAUUSD';
        
        fetch(`http://localhost:3000/price/${symbol}`)
            .then(r => r.json())
            .then(data => {
                if (data.error || data.ask === undefined) {
                    console.warn(`⚠️ Prix direct indisponible pour ${symbol} (Probablement fermé)`);
                    this.setMarketInactive();
                    return; 
                }
                
                console.log(`📊 Prix reçu pour ${symbol}: bid=${data.bid}, ask=${data.ask}`);
                this.updateLivePrice(data.ask);
            })
            .catch(err => {
                console.warn(`⚠️ Erreur réseau prix ${symbol}:`, err);
                this.setMarketInactive();
            });
    }

    // 🔴 MODIFIÉ : Réinitialisation du chronomètre d'inactivité
    public updateLivePrice(ask: number) {
        if (ask <= 0) return;
        
        this.currentPrice = ask;
        this.priceLastUpdateTime = Date.now();
        
        const entryInput = document.getElementById('entry-price') as HTMLInputElement;
        if (entryInput) {
            entryInput.value = ask.toFixed(5);
            
            entryInput.style.background = 'rgba(38, 166, 154, 0.3)';
            setTimeout(() => {
                entryInput.style.background = '';
            }, 500);
        }
        
        this.calculateRiskReward();

        // Si on reçoit un prix, on cache l'étiquette "Marché inactif"
        if (this.marketStatusEl) {
            this.marketStatusEl.style.display = 'none';
        }

        if (this.inactivityTimeout) {
            clearTimeout(this.inactivityTimeout);
        }

        // Si aucun tick n'arrive dans les 5 secondes (ex: Weekend), on affiche l'étiquette
        this.inactivityTimeout = setTimeout(() => {
            this.setMarketInactive();
        }, 5000);
    }

    // 🔴 NOUVEAU : Fonction pour afficher que le marché dort
    public setMarketInactive() {
        if (this.marketStatusEl) {
            this.marketStatusEl.style.display = 'inline';
        }
    }

    private async handleSubmit(e: Event) {
        e.preventDefault();

        if (!AuthClient.isAuthenticated()) {
            this.showStatus('❌ Vous devez être connecté pour trader!', 'error');
            console.warn('⚠️ Tentative de trade sans authentification');
            return;
        }

        const symbol = (document.getElementById('trade-symbol') as HTMLSelectElement).value;
        const orderType = (document.querySelector('input[name="order-type"]:checked') as HTMLInputElement).value;
        const volume = parseFloat((document.getElementById('trade-volume') as HTMLInputElement).value);
        const tpInput = (document.getElementById('trade-tp') as HTMLInputElement).value;
        const slInput = (document.getElementById('trade-sl') as HTMLInputElement).value;
        
        const tp = tpInput ? parseFloat(tpInput) : null;
        const sl = slInput ? parseFloat(slInput) : null;

        if (!symbol || !volume) {
            this.showStatus('❌ Symbole et volume sont requis', 'error');
            return;
        }

        const order: TradeOrder = {
            symbol,
            type: orderType as 'buy' | 'sell',
            volume,
            tp: tp || 0,
            sl: sl || 0
        };

        await this.executeOrder(order);
    }

    private async executeOrder(order: TradeOrder) {
        try {
            this.showStatus('⏳ Envoi de l\'ordre...', 'loading');
            (this.form.querySelector('#trade-submit') as HTMLButtonElement).disabled = true;

            const response = await this.tradingClient.executeOrder(order);

            this.showStatus(
                `✅ Ordre exécutée!\nID: ${response.orderId}`,
                'success'
            );

            if (this.tradingPlatform) {
                const symbol = (document.getElementById('trade-symbol') as HTMLSelectElement).value;
                const entry = parseFloat((document.getElementById('entry-price') as HTMLInputElement).value);
                
                const position: ActivePosition = {
                    id: response.orderId,
                    symbol: symbol,
                    type: order.type,
                    entry: entry,
                    tp: order.tp,
                    sl: order.sl,
                    volume: order.volume,
                    priceLinesIds: []
                };

                this.activePositions.push(position);
                this.tradingPlatform.renderPositionOnChart(position);
                console.log('📊 Position tracée sur le graphique');
            }

            setTimeout(() => {
                this.form.reset();
                this.clearStatus();
            }, 3000);

            console.log('📤 Ordre exécutée:', response);

        } catch (error: any) {
            this.showStatus(
                `❌ Erreur: ${error.message}`,
                'error'
            );
            console.error('Erreur exécution:', error);

        } finally {
            (this.form.querySelector('#trade-submit') as HTMLButtonElement).disabled = false;
        }
    }

    public showStatus(message: string, type: 'success' | 'error' | 'loading') {
        if (!this.orderStatusEl) return;
        this.orderStatusEl.textContent = message;
        this.orderStatusEl.className = `order-status ${type}`;
    }

    private clearStatus() {
        if (!this.orderStatusEl) return;
        this.orderStatusEl.className = 'order-status';
        this.orderStatusEl.textContent = '';
    }
}

// ========== CLASSE PRINCIPALE ==========
class TradingPlatform {
    private chart!: IChartApi;
    private candlesSeries!: ISeriesApi<'Candlestick'>;
    private currentSymbol: string = 'XAUUSD';
    private currentInterval: string = '1m';
    private marketService: MarketDataService | null = null;
    private drawingObjects: DrawingObject[] = [];
    private selectedObject: DrawingObject | null = null;
    private tradingPanel: TradingPanel | null = null;
    private selectedPosition: ActivePosition | null = null;

    private getThemeColors() {
        const style = getComputedStyle(document.body);
        return {
            chartBg: style.getPropertyValue('--chart-bg').trim() || '#131722',
            chartText: style.getPropertyValue('--chart-text').trim() || '#d1d4dc',
            chartGrid: style.getPropertyValue('--chart-grid').trim() || '#2a2e39',
            chartUp: style.getPropertyValue('--chart-up').trim() || '#26a69a',
            chartDown: style.getPropertyValue('--chart-down').trim() || '#ef5350',
        };
    }

    private applyThemeToChart() {
        const colors = this.getThemeColors();
        
        this.chart.applyOptions({
            layout: {
                background: { color: colors.chartBg },
                textColor: colors.chartText,
                fontSize: 12,
            },
            grid: {
                vertLines: { color: colors.chartGrid },
                horzLines: { color: colors.chartGrid },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: colors.chartGrid,
            },
            rightPriceScale: {
                borderColor: colors.chartGrid,
            },
        });

        this.candlesSeries.applyOptions({
            upColor: colors.chartUp,
            downColor: colors.chartDown,
            wickUpColor: colors.chartUp,
            wickDownColor: colors.chartDown,
        });
    }

    constructor() {
        const container = document.getElementById('chart-container');
        if (!container) return;

        const colors = this.getThemeColors();

        this.chart = createChart(container, {
            layout: {
                background: { color: colors.chartBg },
                textColor: colors.chartText,
                fontSize: 12,
            },
            grid: {
                vertLines: { color: colors.chartGrid },
                horzLines: { color: colors.chartGrid },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: colors.chartGrid,
            },
            rightPriceScale: {
                borderColor: colors.chartGrid,
            },
        });

        this.candlesSeries = this.chart.addSeries(CandlestickSeries, {
            upColor: colors.chartUp,
            downColor: colors.chartDown,
            borderVisible: false,
            wickUpColor: colors.chartUp,
            wickDownColor: colors.chartDown,
        });

        this.tradingPanel = new TradingPanel(this);

        this.setupToolbar();
        this.setupChartInteractions();
        this.setupAssetSelector();
        this.setupTimeframeButtons();
        this.setupOverlay();

        this.loadMarketData('XAUUSD', '1m');

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                    this.applyThemeToChart();
                }
            });
        });

        observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

        window.addEventListener('resize', () => {
            const chartContainer = document.getElementById('chart-container');
            if (chartContainer) {
                this.chart.applyOptions({
                    width: chartContainer.clientWidth,
                    height: chartContainer.clientHeight,
                });
            }
        });
    }

    private setupToolbar() {
        document.querySelectorAll('.tool-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');

                const toolId = (btn as HTMLElement).id;
                const toolMap: Record<string, ToolType> = {
                    'tool-cursor': 'cursor',
                    'tool-hline': 'hline',
                    'tool-fib': 'fib',
                    'tool-rect': 'rect',
                    'tool-position': 'position',
                };

                activeTool = toolMap[toolId] || 'cursor';
                firstClickPoint = null;
            });
        });
    }

    private setupChartInteractions() {
        const container = document.getElementById('chart-container') as HTMLElement;
        if (!container) return;

        container.addEventListener('click', (event: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const logicalPosition = this.chart.timeScale().coordinateToLogical(x);
            const seriesCoordinate = this.candlesSeries.coordinateToPrice(y);

            if (logicalPosition === null || seriesCoordinate === null) {
                return;
            }

            const clickPoint = { time: logicalPosition as any, price: seriesCoordinate };

            if (activeTool === 'cursor') {
                const positionClicked = this.checkPositionSelection(clickPoint.price);
                if (positionClicked) {
                    this.selectPosition(positionClicked);
                    return;
                }

                this.checkForSelection(clickPoint);
                return;
            }

            if (!firstClickPoint) {
                firstClickPoint = clickPoint;
            } else {
                this.executeTool(activeTool, firstClickPoint, clickPoint);
                firstClickPoint = null;
            }
        });
    }

    private checkPositionSelection(price: number): ActivePosition | null {
        if (!this.tradingPanel) return null;

        return this.tradingPanel.activePositions.find((pos) => {
            const minPrice = Math.min(pos.sl, pos.tp);
            const maxPrice = Math.max(pos.sl, pos.tp);
            return price >= minPrice && price <= maxPrice;
        }) || null;
    }

    private checkForSelection(clickPoint: { time: any; price: number }) {
        const found = this.drawingObjects.find((obj) => {
            if (obj.type !== 'rect') return false;
            if (!obj.p2) return false;

            const minPrice = Math.min(obj.p1.price, obj.p2.price);
            const maxPrice = Math.max(obj.p1.price, obj.p2.price);

            return clickPoint.price >= minPrice && clickPoint.price <= maxPrice;
        });

        if (found) {
            this.selectObject(found);
        } else {
            this.closeOverlay();
        }
    }

    private executeTool(
        tool: ToolType,
        p1: { time: any; price: number },
        p2: { time: any; price: number }
    ) {
        if (tool === 'hline') {
            this.createHorizontalLine(p1.price);
        } else if (tool === 'rect') {
            this.createRectangle(p1, p2);
        } else if (tool === 'fib') {
            this.createFibonacci(p1.price, p2.price);
        } else if (tool === 'position') {
            this.createPosition(p1.price, p2.price);
        }
    }

    private createHorizontalLine(price: number) {
        const obj: DrawingObject = {
            id: 'hline_' + Date.now(),
            type: 'hline',
            p1: { time: 0, price: price },
            color: '#2962ff',
            textColor: '#ffffff',
            text: price.toFixed(2),
            textPos: 'middle',
            textSize: 12,
            series: [],
        };

        this.drawingObjects.push(obj);
        this.renderHorizontalLine(obj);
        this.saveDrawingToDatabase(obj);
    }

    private createRectangle(p1: { time: any; price: number }, p2: { time: any; price: number }) {
        const obj: DrawingObject = {
            id: 'rect_' + Date.now(),
            type: 'rect',
            p1,
            p2,
            color: 'rgba(41, 98, 255, 0.3)',
            textColor: '#ffffff',
            text: '',
            textPos: 'middle',
            textSize: 12,
            series: [],
        };

        this.drawingObjects.push(obj);
        this.renderRectangle(obj);
        this.selectObject(obj);
        this.saveDrawingToDatabase(obj);
    }

    private createFibonacci(startPrice: number, endPrice: number) {
        const diff = startPrice - endPrice;
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

        levels.forEach((level) => {
            const price = startPrice - diff * level;
            const label =
                level === 0 ? '0%' : level === 1 ? '100%' : (level * 100).toFixed(1) + '%';

            this.candlesSeries.createPriceLine({
                price: price,
                color: '#9c27b0',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: `Fib ${label}`,
            });
        });
    }

    private createPosition(entryPrice: number, targetPrice: number) {
        const diff = Math.abs(targetPrice - entryPrice);
        const slPrice = entryPrice < targetPrice ? entryPrice - diff : entryPrice + diff;

        this.candlesSeries.createPriceLine({
            price: entryPrice,
            color: '#00ff00',
            lineWidth: 2,
            axisLabelVisible: true,
            title: `ENTRY: ${entryPrice.toFixed(2)}`,
        });

        this.candlesSeries.createPriceLine({
            price: targetPrice,
            color: '#00ff00',
            lineWidth: 2,
            lineStyle: 1,
            axisLabelVisible: true,
            title: `TP: ${targetPrice.toFixed(2)}`,
        });

        this.candlesSeries.createPriceLine({
            price: slPrice,
            color: '#ff0000',
            lineWidth: 2,
            lineStyle: 1,
            axisLabelVisible: true,
            title: `SL: ${slPrice.toFixed(2)}`,
        });
    }

    private renderHorizontalLine(obj: DrawingObject) {
        obj.series.forEach((s) => this.chart.removeSeries(s));
        obj.series = [];

        const timeScale = this.chart.timeScale();
        const range = timeScale.getVisibleRange();
        if (range) {
            const line = this.chart.addSeries(LineSeries, {
                color: obj.color,
                lineWidth: 2,
                title: obj.text,
            });

            line.setData([
                { time: range.from as any, value: obj.p1.price },
                { time: range.to as any, value: obj.p1.price },
            ]);

            obj.series.push(line);
        }
    }

    private renderRectangle(obj: DrawingObject) {
        if (!obj.p2) return;

        obj.series.forEach((s) => this.chart.removeSeries(s));
        obj.series = [];

        const lineStyle = obj === this.selectedObject ? 0 : 2;
        const lineWidth = obj === this.selectedObject ? 2 : 1;

        const top = this.chart.addSeries(LineSeries, { color: obj.color, lineWidth: lineWidth, lineStyle: lineStyle });
        top.setData([{ time: obj.p1.time, value: obj.p1.price }, { time: obj.p2.time, value: obj.p1.price }]);

        const bottom = this.chart.addSeries(LineSeries, { color: obj.color, lineWidth: lineWidth, lineStyle: lineStyle });
        bottom.setData([{ time: obj.p1.time, value: obj.p2.price }, { time: obj.p2.time, value: obj.p2.price }]);

        const left = this.chart.addSeries(LineSeries, { color: obj.color, lineWidth: lineWidth, lineStyle: lineStyle });
        left.setData([{ time: obj.p1.time, value: obj.p1.price }, { time: obj.p1.time, value: obj.p2.price }]);

        const right = this.chart.addSeries(LineSeries, { color: obj.color, lineWidth: lineWidth, lineStyle: lineStyle });
        right.setData([{ time: obj.p2.time, value: obj.p1.price }, { time: obj.p2.time, value: obj.p2.price }]);

        obj.series.push(top, bottom, left, right);
    }

    private selectObject(obj: DrawingObject) {
        this.selectedObject = obj;
        this.renderRectangle(obj); 
        this.openOverlay(obj);
    }

    private setupOverlay() {
        const closeBtn = document.getElementById('overlay-close');
        const saveBtn = document.getElementById('overlay-save');
        const deleteBtn = document.getElementById('overlay-delete');

        closeBtn?.addEventListener('click', () => this.closeOverlay());
        saveBtn?.addEventListener('click', () => this.saveObjectProperties());
        deleteBtn?.addEventListener('click', () => this.deleteObject());

        document.querySelectorAll('.overlay-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-tab');
                if (!tabName) return;

                document.querySelectorAll('.overlay-tab-btn').forEach((b) => b.classList.remove('active'));
                document.querySelectorAll('.overlay-tab-pane').forEach((p) => p.classList.remove('active'));

                btn.classList.add('active');
                const pane = document.getElementById(`tab-${tabName}`);
                if (pane) pane.classList.add('active');
            });
        });
    }

    private openOverlay(obj: DrawingObject) {
        const overlay = document.getElementById('drawing-settings-overlay');
        if (!overlay) return;

        overlay.classList.add('active');

        document.querySelectorAll('.overlay-tab-btn').forEach((b, i) => {
            if (i === 0) b.classList.add('active');
            else b.classList.remove('active');
        });
        document.querySelectorAll('.overlay-tab-pane').forEach((p, i) => {
            if (i === 0) p.classList.add('active');
            else p.classList.remove('active');
        });

        const textField = document.getElementById('rect-text-content') as HTMLInputElement;
        const textColorField = document.getElementById('text-color-input') as HTMLInputElement;
        const objColorField = document.getElementById('obj-color-input') as HTMLInputElement;
        const textSizeField = document.getElementById('text-size-input') as HTMLInputElement;
        const textPosField = document.getElementById('text-pos-select') as HTMLSelectElement;
        const p1Field = document.getElementById('coord-p1') as HTMLInputElement;
        const p2Field = document.getElementById('coord-p2') as HTMLInputElement;

        if (textField) textField.value = obj.text;
        if (textColorField) textColorField.value = this.rgbaToHex(obj.textColor);
        if (objColorField) objColorField.value = this.rgbaToHex(obj.color);
        if (textSizeField) textSizeField.value = obj.textSize.toString();
        if (textPosField) textPosField.value = obj.textPos;
        if (p1Field && obj.p1) p1Field.value = obj.p1.price.toFixed(2);
        if (p2Field && obj.p2) p2Field.value = obj.p2.price.toFixed(2);
    }

    private closeOverlay() {
        const overlay = document.getElementById('drawing-settings-overlay');
        if (overlay) overlay.classList.remove('active');
        this.selectedObject = null;
        this.selectedPosition = null;
        this.redrawAll();
    }

    private selectPosition(position: ActivePosition) {
        this.selectedPosition = position;
        this.openPositionOverlay(position);
    }

    private openPositionOverlay(position: ActivePosition) {
        const overlay = document.getElementById('drawing-settings-overlay');
        if (!overlay) return;

        overlay.classList.add('active');

        document.querySelectorAll('.overlay-tab-btn').forEach((b, i) => {
            if (i === 0) b.classList.add('active');
            else b.classList.remove('active');
        });
        document.querySelectorAll('.overlay-tab-pane').forEach((p, i) => {
            if (i === 0) p.classList.add('active');
            else p.classList.remove('active');
        });

        const titleEl = overlay.querySelector('h3');
        if (titleEl) {
            titleEl.textContent = `Position: ${position.type.toUpperCase()} ${position.symbol}`;
        }

        const entryField = document.getElementById('coord-p1') as HTMLInputElement;
        const slField = document.getElementById('coord-p2') as HTMLInputElement;
        const textField = document.getElementById('rect-text-content') as HTMLInputElement;

        if (entryField) entryField.value = position.entry.toFixed(5);
        if (slField) {
            slField.value = position.sl.toFixed(5);
            slField.placeholder = 'Stop Loss';
        }
        
        let tpField = document.getElementById('position-tp-field') as HTMLInputElement;
        if (!tpField) {
            tpField = document.createElement('input');
            tpField.id = 'position-tp-field';
            tpField.type = 'number';
            tpField.step = '0.1';
            tpField.placeholder = 'Take Profit';
            tpField.style.display = 'block';
            tpField.style.marginTop = '10px';
            slField?.parentElement?.appendChild(tpField);
        }
        tpField.value = position.tp.toFixed(5);

        let applyBtn = overlay.querySelector('#position-apply-btn') as HTMLButtonElement;
        if (!applyBtn) {
            applyBtn = document.createElement('button');
            applyBtn.id = 'position-apply-btn';
            applyBtn.textContent = '💾 Appliquer les modifications';
            applyBtn.style.cssText = 'background: #1e90ff; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; width: 100%;';
            applyBtn.addEventListener('click', () => this.updatePositionLevels(position));
            overlay.querySelector('.overlay-tab-pane')?.appendChild(applyBtn);
        }

        let closeBtn = overlay.querySelector('#position-close-btn') as HTMLButtonElement;
        if (!closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.id = 'position-close-btn';
            closeBtn.textContent = '🔴 Fermer la position';
            closeBtn.style.cssText = 'background: #ff4444; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; width: 100%;';
            closeBtn.addEventListener('click', () => this.closePosition(position));
            overlay.querySelector('.overlay-tab-pane')?.appendChild(closeBtn);
        }

        if (textField) {
            textField.value = `${position.type.toUpperCase()} ${position.volume} lots @ ${position.entry.toFixed(5)}`;
        }
    }

    private updatePositionLevels(position: ActivePosition) {
        const slField = document.getElementById('coord-p2') as HTMLInputElement;
        const tpField = document.getElementById('position-tp-field') as HTMLInputElement;

        const newSL = parseFloat(slField?.value || '0');
        const newTP = parseFloat(tpField?.value || '0');

        if (!newSL || !newTP || newSL === position.sl && newTP === position.tp) {
            this.showPositionMessage('⚠️ Veuillez modifier au moins SL ou TP', 'warning');
            return;
        }

        position.sl = newSL;
        position.tp = newTP;

        this.showPositionMessage(`✅ Position mise à jour! Ferme et rouvre pour voir les changements`);

        setTimeout(() => {
            this.closeOverlay();
        }, 2000);
    }

    private closePosition(position: ActivePosition) {
        if (!this.tradingPanel) return;

        this.tradingPanel.activePositions = this.tradingPanel.activePositions.filter(
            p => p.id !== position.id
        );

        position.priceLinesIds = []; 

        this.selectedPosition = null;
        this.closeOverlay();
        this.showPositionMessage(`✅ Position fermée!`);
    }

    private showPositionMessage(message: string, type: 'success' | 'warning' | 'error' = 'success') {
        const orderStatusEl = document.getElementById('order-status');
        if (orderStatusEl) {
            orderStatusEl.textContent = message;
            orderStatusEl.className = `order-status ${type}`;
            setTimeout(() => {
                orderStatusEl.textContent = '';
                orderStatusEl.className = 'order-status';
            }, 3000);
        }
    }

    public renderPositionOnChart(position: ActivePosition) {
        const entryColor = position.type === 'buy' ? '#00ff00' : '#ff6666';
        const tpColor = '#00ff00';
        const slColor = '#ff0000';

        this.candlesSeries.createPriceLine({
            price: position.entry, color: entryColor, lineWidth: 2, axisLabelVisible: true, title: `ENTRY: ${position.entry.toFixed(5)} (${position.type.toUpperCase()})`,
        });

        this.candlesSeries.createPriceLine({
            price: position.tp, color: tpColor, lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `TP: ${position.tp.toFixed(5)}`,
        });

        this.candlesSeries.createPriceLine({
            price: position.sl, color: slColor, lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `SL: ${position.sl.toFixed(5)}`,
        });
    }

    private saveObjectProperties() {
        if (!this.selectedObject) return;

        const textField = document.getElementById('rect-text-content') as HTMLInputElement;
        const textColorField = document.getElementById('text-color-input') as HTMLInputElement;
        const objColorField = document.getElementById('obj-color-input') as HTMLInputElement;
        const textSizeField = document.getElementById('text-size-input') as HTMLInputElement;
        const textPosField = document.getElementById('text-pos-select') as HTMLSelectElement;
        const p1Field = document.getElementById('coord-p1') as HTMLInputElement;
        const p2Field = document.getElementById('coord-p2') as HTMLInputElement;

        if (textField) this.selectedObject.text = textField.value;
        if (textColorField) this.selectedObject.textColor = textColorField.value;
        if (objColorField) this.selectedObject.color = objColorField.value;
        if (textSizeField) this.selectedObject.textSize = parseInt(textSizeField.value);
        if (textPosField) this.selectedObject.textPos = textPosField.value as any;

        if (p1Field && this.selectedObject.p1) this.selectedObject.p1.price = parseFloat(p1Field.value);
        if (p2Field && this.selectedObject.p2) this.selectedObject.p2.price = parseFloat(p2Field.value);

        this.redrawAll();
        this.updateDrawingInDatabase(this.selectedObject);
    }

    private deleteObject() {
        if (!this.selectedObject) return;

        const deletedObject = this.selectedObject;
        this.drawingObjects = this.drawingObjects.filter((o) => o.id !== this.selectedObject!.id);
        this.selectedObject.series.forEach((s) => this.chart.removeSeries(s));
        this.selectedObject = null;

        this.deleteDrawingFromDatabase(deletedObject);
        this.closeOverlay();
    }

    private redrawAll() {
        this.drawingObjects.forEach((obj) => {
            if (obj.type === 'hline') {
                this.renderHorizontalLine(obj);
            } else if (obj.type === 'rect') {
                this.renderRectangle(obj);
            }
        });
    }

    private redrawDrawing(drawingObj: DrawingObject) {
        if (drawingObj.type === 'hline') {
            this.renderHorizontalLine(drawingObj);
        } else if (drawingObj.type === 'rect') {
            this.renderRectangle(drawingObj);
        }
    }

    private rgbaToHex(rgba: string): string {
        const match = rgba.match(/\d+/g);
        if (!match || match.length < 3) return '#2962ff';
        const r = parseInt(match[0]).toString(16).padStart(2, '0');
        const g = parseInt(match[1]).toString(16).padStart(2, '0');
        const b = parseInt(match[2]).toString(16).padStart(2, '0');
        return '#' + r + g + b;
    }

    private setupAssetSelector() {
        const headerSelect = document.getElementById('asset-select') as HTMLSelectElement;
        const panelSelect = document.getElementById('trade-symbol') as HTMLSelectElement;

        const changeSymbol = (newSymbol: string) => {
            if (this.currentSymbol === newSymbol) return; 
            
            this.currentSymbol = newSymbol;

            if (headerSelect) headerSelect.value = newSymbol;
            if (panelSelect) panelSelect.value = newSymbol;

            this.loadMarketData(this.currentSymbol, this.currentInterval);
        };

        if (headerSelect) {
            headerSelect.addEventListener('change', (e) => changeSymbol((e.target as HTMLSelectElement).value));
        }

        if (panelSelect) {
            panelSelect.addEventListener('change', (e) => changeSymbol((e.target as HTMLSelectElement).value));
        }
    }

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

    // 🔴 MODIFIÉ : Le système qui sauve le graphique pendant le weekend !
    private async loadMarketData(symbol: string, interval: string) {
        console.log(`📡 Chargement: ${symbol} ${interval}`);

        this.candlesSeries.setData([]); 

        if (this.marketService) {
            this.marketService.disconnect();
        }

        this.marketService = new MarketDataService(symbol, interval, (candle: Candle) => {
            this.candlesSeries.update(candle as any);
            if (this.tradingPanel) {
                this.tradingPanel.updateLivePrice(candle.close);
            }
        });

        try {
            const history = await this.marketService.getHistory();
            if (history && history.length > 0) {
                this.candlesSeries.setData(history as any);
                console.log(`✅ ${history.length} bougies chargées`);

                // 🔴 SOLUTION DU WEEKEND : On force le prix à s'afficher avec la toute dernière bougie connue (vendredi soir)
                if (this.tradingPanel) {
                    const lastCandle = history[history.length - 1];
                    this.tradingPanel.updateLivePrice(lastCandle.close);
                }
            }

            this.marketService.connect();

            if (AuthClient.isAuthenticated()) {
                await this.loadUserDrawings(symbol, interval);
            } else {
                this.drawingObjects.forEach(obj => {
                    obj.series.forEach(s => this.chart.removeSeries(s));
                });
                this.drawingObjects = [];
            }
        } catch (error) {
            console.error(`❌ Erreur chargement ${symbol}:`, error);
        }
    }

    private async loadUserDrawings(symbol: string, interval: string) {
        this.drawingObjects.forEach(obj => {
            obj.series.forEach(s => this.chart.removeSeries(s));
        });
        this.drawingObjects = [];

        const response = await DrawingApiClient.getDrawings(symbol, interval);

        if (!response.success || !response.drawings) {
            console.warn('⚠️ Impossible de charger les dessins');
            return;
        }

        for (const drawingData of response.drawings) {
            try {
                const drawingObj: DrawingObject = {
                    id: drawingData.id || `drawing-${Date.now()}`,
                    type: drawingData.type,
                    p1: {
                        time: drawingData.p1.time,
                        price: drawingData.p1.price,
                    },
                    p2: drawingData.p2 ? {
                        time: drawingData.p2.time,
                        price: drawingData.p2.price,
                    } : undefined,
                    color: drawingData.color || '#2962ff',
                    textColor: drawingData.textColor || '#ffffff',
                    text: drawingData.text || '',
                    textPos: (drawingData.textPos || 'middle') as 'top' | 'middle' | 'bottom',
                    textSize: drawingData.textSize || 12,
                    series: [] 
                };

                this.redrawDrawing(drawingObj);
                this.drawingObjects.push(drawingObj);
            } catch (error) {
                console.error('❌ Erreur lors du chargement d\'un dessin:', error);
            }
        }

        this.chart.timeScale().fitContent();
    }

    private async saveDrawingToDatabase(drawingObj: DrawingObject) {
        if (!AuthClient.isAuthenticated()) return;

        const drawingData = {
            type: drawingObj.type,
            symbol: this.currentSymbol,
            timeframe: this.currentInterval,
            p1: drawingObj.p1,
            p2: drawingObj.p2,
            color: drawingObj.color,
            textColor: drawingObj.textColor,
            text: drawingObj.text,
            textPos: drawingObj.textPos,
            textSize: drawingObj.textSize,
        };

        const response = await DrawingApiClient.createDrawing(drawingData);
        if (response.success) {
            drawingObj.id = response.drawing?.id || drawingObj.id;
        }
    }

    private async updateDrawingInDatabase(drawingObj: DrawingObject) {
        if (!AuthClient.isAuthenticated()) return;
        await DrawingApiClient.updateDrawing(drawingObj.id, {
            p1: drawingObj.p1,
            p2: drawingObj.p2,
            color: drawingObj.color,
            textColor: drawingObj.textColor,
            text: drawingObj.text,
            textPos: drawingObj.textPos,
            textSize: drawingObj.textSize,
        });
    }

    private async deleteDrawingFromDatabase(drawingObj: DrawingObject) {
        if (!AuthClient.isAuthenticated()) return;
        await DrawingApiClient.deleteDrawing(drawingObj.id);
    }
}

// ========== GESTION DES BOUTONS BUY/SELL/CONFIG ==========

function updateTradingButtonsVisibility() {
    const quickButtonsContainer = document.querySelector('.trading-quick-buttons') as HTMLElement;
    if (!quickButtonsContainer) return;

    if (AuthClient.isAuthenticated()) {
        quickButtonsContainer.style.display = 'flex';
    } else {
        quickButtonsContainer.style.display = 'none';
    }
}

function setupTradingButtons() {
    const btnBuy = document.getElementById('quick-buy-btn') as HTMLButtonElement;
    const btnSell = document.getElementById('quick-sell-btn') as HTMLButtonElement;
    const btnConfig = document.getElementById('quick-config-btn') as HTMLButtonElement;
    const tradeForm = document.getElementById('trade-form') as HTMLFormElement;
    const tradingPanel = document.getElementById('trading-panel') as HTMLElement;

    if (!btnBuy || !btnSell || !btnConfig || !tradeForm || !tradingPanel) return;

    updateTradingButtonsVisibility();

    btnBuy.addEventListener('click', () => {
        const orderTypeInput = document.querySelector('input[name="order-type"][value="buy"]') as HTMLInputElement;
        if (orderTypeInput) orderTypeInput.checked = true;
        
        tradeForm.style.display = 'block';
        tradingPanel.style.display = 'block';
        tradingPanel.style.height = 'auto';
        tradingPanel.style.maxHeight = '80vh';
        tradingPanel.style.overflow = 'auto';
        
        const serverStatus = document.getElementById('server-status');
        if (serverStatus) serverStatus.style.display = 'block';
    });

    btnSell.addEventListener('click', () => {
        const orderTypeInput = document.querySelector('input[name="order-type"][value="sell"]') as HTMLInputElement;
        if (orderTypeInput) orderTypeInput.checked = true;
        
        tradeForm.style.display = 'block';
        tradingPanel.style.display = 'block';
        tradingPanel.style.height = 'auto';
        tradingPanel.style.maxHeight = '80vh';
        tradingPanel.style.overflow = 'auto';
        
        const serverStatus = document.getElementById('server-status');
        if (serverStatus) serverStatus.style.display = 'block';
    });

    btnConfig.addEventListener('click', () => {
        const isHidden = tradeForm.style.display === 'none' || tradeForm.style.display === '';
        const serverStatus = document.getElementById('server-status');
        
        if (isHidden) {
            tradeForm.style.display = 'block';
            tradingPanel.style.display = 'block';
            tradingPanel.style.height = 'auto';
            tradingPanel.style.maxHeight = '80vh';
            tradingPanel.style.overflow = 'auto';
            if (serverStatus) serverStatus.style.display = 'block';
        } else {
            tradeForm.style.display = 'none';
            tradingPanel.style.display = 'none';
            if (serverStatus) serverStatus.style.display = 'none';
        }
    });

    tradeForm.style.display = 'none';
    tradingPanel.style.display = 'none';
    const serverStatus = document.getElementById('server-status');
    if (serverStatus) serverStatus.style.display = 'none';

    window.addEventListener('storage', (e) => {
        if (e.key === 'auth_token' || e.key === 'current_user') {
            updateTradingButtonsVisibility();
        }
    });

    (window as any).updateTradingButtonsVisibility = updateTradingButtonsVisibility;
}

// ========== INITIALISATION ==========
function initPlatform() {
    console.log('🚀 Démarrage de la plateforme de trading...');
    setupTradingButtons();
    new TradingPlatform();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initPlatform);
} else {
    initPlatform();
}