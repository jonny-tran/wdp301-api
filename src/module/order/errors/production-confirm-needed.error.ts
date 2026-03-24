export class ProductionConfirmNeededError extends Error {
  constructor() {
    super('PRODUCTION_CONFIRMATION_REQUIRED');
    this.name = 'ProductionConfirmNeededError';
  }
}
