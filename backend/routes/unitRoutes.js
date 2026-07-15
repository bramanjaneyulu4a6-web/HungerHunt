// import express from "express";
// import Unit from "../models/Unit.js";

// const router = express.Router();

// router.get("/", async (req, res) => {
//   const units = await Unit.find();
//   res.json(units);
// });

// router.post("/", async (req, res) => {
//   const unit = await Unit.create({
//     name: req.body.name,
//     symbol: req.body.symbol
//   });

//   res.status(201).json(unit);
// });

// export default router;




import express from "express";
import Unit from "../models/Unit.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {

    const units = await Unit.find();

    res.json(units);

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
});

router.post("/", async (req, res) => {
  try {

    const unit = await Unit.create({
      name: req.body.name,
      symbol: req.body.symbol
    });

    res.status(201).json(unit);

  } catch (error) {

    res.status(400).json({
      error: error.message
    });

  }
});

export default router;