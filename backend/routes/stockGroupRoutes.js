// import express from "express";
// import StockGroup from "../models/StockGroup.js";

// const router = express.Router();

// router.get("/", async (req, res) => {
//   const groups = await StockGroup.find();
//   res.json(groups);
// });

// router.post("/", async (req, res) => {
//   const group = await StockGroup.create({
//     name: req.body.name
//   });

//   res.status(201).json(group);
// });

// export default router;





import express from "express";
import StockGroup from "../models/StockGroup.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const groups = await StockGroup.find();
    res.json(groups);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

router.post("/", async (req, res) => {
  try {

    const group = await StockGroup.create({
      name: req.body.name
    });

    res.status(201).json(group);

  } catch (error) {

    res.status(400).json({
      error: error.message
    });

  }
});

export default router;