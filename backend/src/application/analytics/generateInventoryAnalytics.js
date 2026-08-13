import { analyzeInventory } from '../../domain/analytics/inventoryAnalytics.js';

const DAY_MS = 86_400_000;

export class GenerateInventoryAnalytics {
  constructor({ analyticsRepository, clock = () => new Date(), config = {} }) {
    this.analyticsRepository = analyticsRepository;
    this.clock = clock;
    this.config = config;
  }

  async execute({ asOf } = {}) {
    const effectiveDate = asOf ?? this.clock();
    const snapshot = await this.analyticsRepository.loadSnapshot({
      from: new Date(effectiveDate.getTime() - 90 * DAY_MS),
    });
    return analyzeInventory({ ...snapshot, asOf: effectiveDate, config: this.config });
  }
}

