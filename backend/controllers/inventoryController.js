// import Inventory from "../models/Inventory.js";

// export const getInventory = async (req, res) => {

//   const inventory = await Inventory
//     .find()
//     .populate("productId");

//   res.json(inventory);
// };



import Inventory from "../models/Inventory.js";

export const getInventory = async (req, res) => {
  try {
    const inventory = await Inventory.find().populate({
  path: "productId",
  populate: {
    path: "stockGroup"
  }
});

    res.json(inventory);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};