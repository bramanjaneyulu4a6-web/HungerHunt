import Purchase from "../models/Purchase.js";
import Inventory from "../models/Inventory.js";

export const createPurchase = async (req, res) => {
  try {

    const purchase = new Purchase({
      status: "NEW",
      items: req.body.items
    });

    await purchase.save();

    res.status(201).json(purchase);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: err.message
    });
  }
};

export const getNewPurchases = async (req, res) => {
  try {

    const purchases = await Purchase.find({
      status: "NEW"
    })
      .populate("items.productId")
      .sort({ createdAt: -1 });

    console.log("NEW PURCHASES:", purchases.length);

    res.json(purchases);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: err.message
    });
  }
};
export const getCompletedPurchases = async (req, res) => {
  try {

    const purchases = await Purchase.find({
      status: "COMPLETED"
    }).populate("items.productId");

    res.json(purchases);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const completePurchase = async (req, res) => {
  try {

    const purchase = await Purchase.findById(req.params.id);

    if (!purchase) {
      return res.status(404).json({
        message: "Purchase not found"
      });
    }

    purchase.items = req.body.items;
    purchase.status = "COMPLETED";
    purchase.completedAt = new Date();

    await purchase.save();

    for (const item of purchase.items) {

      let inventory = await Inventory.findOne({
        productId: item.productId
      });

      if (!inventory) {

        inventory = await Inventory.create({
          productId: item.productId,
          stock: item.quantity
        });

      } else {

        inventory.stock += item.quantity;
        await inventory.save();
      }
    }

    res.json(purchase);

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};