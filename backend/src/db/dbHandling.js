const { Schema, model } = require('mongoose');

const messageSchema = new Schema({
  room: { type: String, required: true }, // room identifier
  content: [
    {
      username: { type: String, required: true }, // sender's username
      userId: { type: String, required: true }, // sender's user ID
      message: { type: String, required: true }, // message content
      time: { type: Date, default: Date.now } // timestamp of the message
    }
  ]
});

const userSchema = new Schema({
  username: { type: String, required: true }, // user's name
  password: { type: String, required: true }, // user's password (encoded using their public key)
  userId: { type: String, required: false }, // user's unique ID
  publickey: { type: String, required: false }, // user's public key
  online: { type: Boolean, default: false } // whether the user is currently online
});

const roomSchema = new Schema({
  room: { type: String, required: true }, // room identifier
  users: [
    {
      username: { type: String, required: true }, // user's name
      userId: { type: String, required: true }, // user's unique ID
      admin: { type: Boolean, default: false } // whether the user is an admin of the room
    }
  ],
  messages: [
    {
      username: { type: String, required: true }, // sender's username
      userId: { type: String, required: true }, // sender's user ID
      message: { type: String, required: true }, // message content
      time: { type: Date, default: Date.now } // timestamp of the message
    }
  ]
});

const roomModel = model('room', roomSchema);
const userModel = model('user', userSchema);
const messageModel = model('message', messageSchema);

// find a message from db
const getAllMessages = async (username, userID) => {
  try {
    const messages = await messageModel.find({ 'content.userId': userID });
    return messages;

  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }
};

const register = async (req, res) => {
  const { username, password, userId, publickey } = req.body;
  if (!username || !password || !userId || !publickey) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  const newUser = new userModel({
    username,
    password,
    userId,
    publickey
  });

  try {
    const response = await newUser.save();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error registering user', error: error.message });
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  try {
    const user = await userModel.findOne({ username, password });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
    return res.status(200).json({ success: true, message: 'Login successful', user });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error logging in', error: error.message });
  }
};

module.exports = { userModel, messageModel, roomModel };