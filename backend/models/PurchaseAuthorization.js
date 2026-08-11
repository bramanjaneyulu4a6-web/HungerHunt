import mongoose from 'mongoose';

// One row per accepted purchase password, consumed by the bill it authorises.
//
// This is short-lived state, and an in-memory Map would have held it with no
// model and no round trip. It lives in Mongo because the Map is only correct
// while exactly one process serves the till: a second instance behind a load
// balancer, or a restart between the two requests, would lose the token and
// fail the sale with an error nobody at the terminal can act on. The assumption this
// version depends on is much weaker — that every instance shares one database,
// which they already must, since the wallet is in it.
const purchaseAuthorizationSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  cartHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

// Mongo's TTL monitor sweeps about once a minute, so a row can outlive
// expiresAt by that long. Nothing rests on the sweep being prompt: whether a
// token is still live is decided in code from the stored date, and this index
// only keeps the collection from growing without bound.
purchaseAuthorizationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PurchaseAuthorization', purchaseAuthorizationSchema);
