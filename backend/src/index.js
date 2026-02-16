const path = require('path');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
require('dotenv/config');

const { messageModel, userModel } = require('./db/dbHandling.js');

const ADMIN = 'admin';

const app = express();
const server = http.createServer(app);

// state
const UsersState = {
  users: [],
  publickeys: [],
  setUsers: function(newUsersArray) {
    this.users = newUsersArray;
  }
};

const io = new Server(server, { 
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000',
    credentials: true
  }});

app.use(cors({credentials: true, origin: 'http://localhost:3000'}));
app.use(express.json());

app.use('/static', express.static(path.join(__dirname, 'build/static')));
app.use('/', express.static(path.join(__dirname, 'build')));

app.post('/login', async (req, res) => {
  console.log('Login request received:', req.body);
  const { username, password, publickey, socketId } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  try {
    let user = await userModel.findOne({ username });
    
    if (user) {
      // User exists - Login
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        // Update socketId (userId in schema)
        if (socketId) {
          user.userId = socketId;
          await user.save();
        }
        return res.status(200).json({ success: true, message: 'Login successful', user });
      } else {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
    } else {
      // User does not exist - Register flow
      if (!publickey) {
        // Client needs to generate keys and retry
        return res.status(404).json({ success: false, message: 'User not found, registration required' });
      }

      // Registration
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      user = new userModel({
        username: username,
        password: hashedPassword,
        publickey: publickey.n,
        userId: socketId // Storing socket ID as userId
      });
      
      await user.save();
      return res.status(201).json({ success: true, message: 'User created', user });
    }
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

io.on('connection', (socket) => {
  console.log('a user connected ' + socket.id);
  
  // update rooms list
  io.emit('roomList', {
    rooms: getAllActiveRooms()
  });
  
  // On connection - only to user
  socket.emit('message', buildMsg(ADMIN, 'Welcome to the chat!'));
  
  socket.on('join room', ({ name, room, publickey }) => {
    // leave previous room if exists
    const prevRoom = getUser(socket.id)?.room; 
    if (prevRoom) {
      socket.leave(prevRoom);
      io.to(prevRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`));
    };

    // check host status
    let host = false;
    const usersInRoom = getUsersInRoom(room);
    if (usersInRoom.length === 0) {
      host = true;
    }

    // activate user
    const user = activateUser(socket.id, name, room, publickey, host);
    socket.join(user.room);

    // welcome user & notify others
    socket.emit('message', buildMsg(ADMIN, `Welcome to the ${user.room} room!`));
    socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has joined the room`));

    socket.broadcast.to(user.room).emit('userJoined', {
      id: socket.id,
      name: user.name,
      publickey: user.publickey
    });

    // Update user list for room
    io.to(user.room).emit('userList', {
      users: getUsersInRoom(user.room)
    });

    // update rooms list
    io.emit('roomList', {
      rooms: getAllActiveRooms()
    });
  });

  socket.on('sendSessionKey', ({ to, encryptedKey }) => {
    io.to(to).emit('sessionKey', {
      from: socket.id,
      encryptedKey
    });
  });

  socket.on('disconnect', () => {
    const user = getUser(socket.id);
    userDisconnects(socket.id);

    if (user) {
      io.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has left the room`));

      io.to(user.room).emit('userList', {
        users: getUsersInRoom(user.room)
      }); 

      io.emit('roomList', {
        rooms: getAllActiveRooms()
      }); 

    }

    console.log('user disconnected');
  });

  socket.on('message', ({name, text, encryptionData}) => {
    const room = getUser(socket.id)?.room;
    if (room) {
      io.to(room).emit('message', buildMsg(name, text, encryptionData));
    }

    const newMessage = {
      username: name,
      userId: socket.id,
      message: encryptionData, 
    }

    messageModel.findOneAndUpdate(
      { room: room },
      { $push: { content: newMessage } },
      { upsert: true, new: true }
    ).then(() => {
      console.log('message saved to db');
    }).catch(err => {
      console.error('Error saving message to db:', err);
    });

    console.log('message: ' + name + ': ' + text);
    console.log(Array.from(new Set(UsersState.users.map(user => user.room))));
  });
});

function buildMsg(name, text, encryptionData = null) {
  return {
    name: name,
    text: text,
    encryptionData,
    date: new Date().toISOString()
  };
}

// User functions
function activateUser(id, name, room, publickey, host) {
  const user = { id, name, room, publickey, host };
  UsersState.setUsers([
    ...UsersState.users.filter(user => user.id !== id ), 
    user
  ]);
  return user;
}

function userDisconnects(id) {
  UsersState.setUsers(
    UsersState.users.filter(user => user.id !== id)
  );

  console.log('user disconnected: ' + id);
}

function getUser(id) {
  return UsersState.users.find(user => user.id === id);
}

function getUsersInRoom(room) {
  return UsersState.users.filter(user => user.room === room);
}

function getAllActiveRooms() {
  return Array.from(new Set(UsersState.users.map(user => user.room)));
}

mongoose.connect(process.env.DB_URI).then(() => {
  console.log('connected to database :D');
});

server.listen(process.env.PORT, () => {
  console.log('listening on *:3000');
});