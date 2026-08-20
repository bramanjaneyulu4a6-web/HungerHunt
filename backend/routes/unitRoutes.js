/* Read-only. The measurement units are a fixed vocabulary defined in
 * scripts/data/catalogue.json and loaded by seedCatalogue.js, because the
 * admin console now offers units filtered by a product's category
 * (frontend-admin/src/constants/units.js) and that map keys off the symbol.
 * A unit invented through this endpoint would exist in the collection while
 * matching no category, so it would never appear in the dropdown that is the
 * only reason to create one.
 *
 * Adding a unit means editing the seed data and the category map, then
 * re-running the seed — the same route category changes take.
 */
import express from "express";
import Unit from "../models/Unit.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get("/", async (req, res) => {
  try {
    const units = await Unit.find();
    res.json(units);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 405 rather than a silent 404: these verbs existed until recently, and a
// stale deployed console still calling them should be told the route is sealed
// rather than left to read it as a bad URL.
const sealed = (req, res) =>
  res.status(405).json({
    message: "Measurement units are defined in the catalogue seed, not through the API.",
  });

router.post("/", sealed);
router.put("/:id", sealed);
router.delete("/:id", sealed);

export default router;
