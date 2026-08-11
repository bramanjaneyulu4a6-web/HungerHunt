import Inventory from "../models/Inventory.js";

export const getInventory = async (req, res) => {
  try {
    const inventory = await Inventory.find().populate({
      path: "productId",
      populate: {
        path: "stockGroup"
      }
    });

    // Sorted here, by product name, so every screen that reads the shelf
    // agrees on the order — the query itself cannot sort a populated field.
    inventory.sort((a, b) =>
      (a.productId?.name || "").localeCompare(b.productId?.name || "", "en", {
        sensitivity: "base"
      })
    );

    res.json(inventory);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};