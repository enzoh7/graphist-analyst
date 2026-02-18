/**
 * Service de Trading - Gère la logique métier des ordres
 */

export class TradeService {
  constructor(metaApiAccount) {
    this.account = metaApiAccount;
  }

  /**
   * Valider les paramètres d'une ordre
   */
  validateOrderParams(params) {
    const { symbol, volume, takeProfit, stopLoss } = params;

    if (!symbol) throw new Error('Symbol est requis');
    if (!volume || volume <= 0) throw new Error('Volume invalide');
    if (!takeProfit) throw new Error('Take Profit requis');
    if (!stopLoss) throw new Error('Stop Loss requis');

    return true;
  }

  /**
   * Calculer le risque/récompense
   */
  calculateRiskReward(entryPrice, stopLoss, takeProfit) {
    const riskPips = Math.abs(entryPrice - stopLoss);
    const rewardPips = Math.abs(takeProfit - entryPrice);
    const riskRewardRatio = rewardPips / riskPips;
    
    return {
      riskPips,
      rewardPips,
      ratio: riskRewardRatio.toFixed(2)
    };
  }

  /**
   * Effectuer un achat (BUY)
   */
  async executeBuyOrder(params) {
    this.validateOrderParams(params);
    const { symbol, volume, takeProfit, stopLoss } = params;

    const result = await this.account.createMarketBuyOrder({
      symbol: symbol,
      volume: parseFloat(volume),
      takeProfit: parseFloat(takeProfit),
      stopLoss: parseFloat(stopLoss),
      comment: 'Order from Pro Analyst Terminal'
    });

    return result;
  }

  /**
   * Effectuer une vente (SELL)
   */
  async executeSellOrder(params) {
    this.validateOrderParams(params);
    const { symbol, volume, takeProfit, stopLoss } = params;

    const result = await this.account.createMarketSellOrder({
      symbol: symbol,
      volume: parseFloat(volume),
      takeProfit: parseFloat(takeProfit),
      stopLoss: parseFloat(stopLoss),
      comment: 'Order from Pro Analyst Terminal'
    });

    return result;
  }

  /**
   * Fermer une position
   */
  async closePosition(positionId) {
    const result = await this.account.closePositionBySymbol(positionId);
    return result;
  }

  /**
   * Récupérer les positions ouvertes
   */
  async getOpenPositions() {
    const positions = await this.account.getPositions();
    return positions.filter(p => p.profit !== undefined);
  }

  /**
   * Récupérer l'équilibre du compte
   */
  async getAccountBalance() {
    const accountInfo = await this.account.getAccountInformation();
    return {
      balance: accountInfo.balance,
      equity: accountInfo.equity,
      margin: accountInfo.margin,
      freeMargin: accountInfo.freeMargin,
      marginLevel: accountInfo.marginLevel
    };
  }
}
