const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");

// Using correct path
const { isLoggedIn : isAuth } = require("../utils/middleware");

router.get("/", isAuth, messageController.getMessages);
router.delete("/clear-all", isAuth, messageController.clearAllMessages);
router.delete("/:id", isAuth, messageController.deleteMessage);

module.exports = router;