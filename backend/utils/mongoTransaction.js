import mongoose from 'mongoose';

/* Tests in this repository stub model methods without opening MongoDB. In the
   running service every multi-document money/stock workflow goes through a
   real session. Keeping the disconnected path makes the domain orchestration
   unit-testable; it is never selected after server.js has accepted traffic. */
export const withMongoTransaction = async (work) => {
  if (mongoose.connection.readyState !== 1) return work(null);

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

export const sessionOptions = (session) => (session ? { session } : {});

