const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModels");

const ENCRYPTION_KEY = crypto.scryptSync("your_secret_key_here", "salt", 32); // Must be 256 bits (32 characters)
const IV_LENGTH = 16; // For AES, this is always 16

function encrypt(text) {
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text) {
  let textParts = text.split(":");
  let iv = Buffer.from(textParts.shift(), "hex");
  let encryptedText = textParts.join(":");
  let decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

const sendMessage = asyncHandler(async (req, res) => {
  const { content, chatId } = req.body;
  console.log("Received content:", content);
  if (!content || !chatId) {
    console.log("Invalid Data Passed into Request");
    res.sendStatus(400);
    return;
  }
  var newMessage = {
    sender: req.user._id,
    content: encrypt(content),
    chat: chatId,
  };
  try {
    var message = await Message.create(newMessage);
    message = await message.populate("sender", "name pic");
    message = await message.populate("chat");
    message = await User.populate(message, {
      path: "chat.users",
      select: "name pic email",
    });
    await Chat.findByIdAndUpdate(req.body.chatId, {
      latestMessage: message,
    });
    // Decrypt content before sending response
    message.content = decrypt(message.content);
    res.json(message);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

const allMessages = asyncHandler(async (req, res) => {
  try {
    const messages = await Message.find({ chat: req.params.chatId })
      .populate("sender", "name pic email")
      .populate("chat");
    // Decrypt all messages content
    const decryptedMessages = messages.map((msg) => {
      return {
        ...msg._doc,
        content: decrypt(msg.content),
      };
    });
    res.json(decryptedMessages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

module.exports = { sendMessage, allMessages };
