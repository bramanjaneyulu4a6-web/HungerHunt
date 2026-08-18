import mongoose from 'mongoose';

// Use for workflows that update multiple aggregates (for example receipt +
// inventory + purchase order). MongoDB transactions require a replica set.
export class MongoUnitOfWork {
  async execute(work) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(() => work({ session }));
    } finally {
      await session.endSession();
    }
  }
}

