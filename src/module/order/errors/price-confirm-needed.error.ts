export class PriceConfirmNeededError extends Error {
  constructor() {
    super('PRICE_CONFIRMATION_REQUIRED');
    this.name = 'PriceConfirmNeededError';
  }
}
