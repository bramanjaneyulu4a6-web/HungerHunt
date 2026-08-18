import { GenerateInventoryAnalytics } from '../../../application/analytics/generateInventoryAnalytics.js';
import { MongooseAnalyticsRepository } from '../../../infrastructure/persistence/mongoose/mongooseAnalyticsRepository.js';
import { ValidationError } from '../../../shared/errors/applicationError.js';

const useCase = new GenerateInventoryAnalytics({
  analyticsRepository: new MongooseAnalyticsRepository(),
  config: {
    highVelocityUnitsPerDay: Number(process.env.ANALYTICS_HIGH_VELOCITY_PER_DAY) || 1,
    defaultLeadTimeDays: Number(process.env.ANALYTICS_DEFAULT_LEAD_TIME_DAYS) || 7,
    orderingCost: Number(process.env.ANALYTICS_ORDERING_COST) || 250,
    annualHoldingRate: Number(process.env.ANALYTICS_ANNUAL_HOLDING_RATE) || 0.2,
  },
});

export const inventory = async (req, res) => {
  let asOf;
  if (req.query.asOf) {
    asOf = new Date(req.query.asOf);
    if (Number.isNaN(asOf.getTime())) {
      throw new ValidationError([{ field: 'asOf', message: 'Must be an ISO-8601 date.' }]);
    }
  }

  const analytics = await useCase.execute({ asOf });
  res.json({
    data: analytics,
    meta: {
      requestId: req.context.requestId,
      deterministic: true,
      llmReady: true,
    },
  });
};

