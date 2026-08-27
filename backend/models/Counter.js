import mongoose from 'mongoose';

/* One document per named sequence. Report numbers come from here rather than
   from counting documents: a count changes when things are deleted, and a
   number that two reports can share is not a number anyone can quote to the
   office. */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

counterSchema.statics.nextSequence = async function nextSequence(name) {
  const counter = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();
  return counter.seq;
};

export default mongoose.model('Counter', counterSchema);
