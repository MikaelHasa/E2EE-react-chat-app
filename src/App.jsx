import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { io } from 'socket.io-client';
import Popup from './components/Popup/Popup';
import { exportKey, importKey, generateSessionKey, encryptSessionKey, decryptSessionKey, encryptMessageWithSessionKey, decryptMessageWithSessionKey } from './crypto.js';

const socket = io('localhost:3000', {
  withCredentials: true,
  autoConnect: true
});

const App = () => {
  // State
  const [userState, setUserState] = useState({
    username: '',
    password: '',
    socketId: '',
    publickey: '',
  });

  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [roomName, setRoomName] = useState('');
  const [messageInput, setMessageInput] = useState('');

  const [currentRoom, setCurrentRoom] = useState('');

  const messagesEndRef = useRef(null);
  const privateKeyRef = useRef(null);
  const sessionKeyRef = useRef(null);
  const usersRef = useRef(users);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    usersRef.current = users;

    // Check if user is host and need to generate key
    const me = users.find(u => u.id === socket.id);
    if (me && me.host && !sessionKeyRef.current) {
      console.log("I am the host. Generating session key...");
      generateSessionKey().then(key => {
        sessionKeyRef.current = key;
        console.log("Session key generated.");
      });
    }
  }, [users]);

  useEffect(() => {
    // Socket event listeners
    socket.on('message', async (data) => {
      // Add immediately to preserve order
      setMessages((prev) => [...prev, data]);

      if (data.encryptionData && sessionKeyRef.current) {
        try {
          const decryptedText = await decryptMessageWithSessionKey(data.encryptionData, sessionKeyRef.current);
          setMessages(prev => prev.map(m => m === data ? { ...m, text: decryptedText } : m));
        } catch (e) {
          setMessages(prev => prev.map(m => m === data ? { ...m, text: 'Failed to decrypt message' } : m));
        }
      }
    });

    socket.on('userList', ({ users }) => {
      setUsers(users);
    });

    socket.on('roomList', ({ rooms }) => {
      setRooms(rooms);
    });

    socket.on('userJoined', async (newUser) => {
      const me = usersRef.current.find(u => u.id === socket.id);
      if (me && me.host && sessionKeyRef.current) {
        console.log("Sending session key to", newUser.name);
        try {
          const userPubKey = await importKey(newUser.publickey, ["encrypt"]);
          const encryptedKey = await encryptSessionKey(sessionKeyRef.current, userPubKey);
          socket.emit('sendSessionKey', {
            to: newUser.id,
            encryptedKey: Array.from(new Uint8Array(encryptedKey))
          });
        } catch (err) {
          console.error("Error sending session key:", err);
        }
      }
    });

    socket.on('sessionKey', async ({ encryptedKey }) => {
      console.log("Received session key");
      try {
        const encryptedKeyBuffer = new Uint8Array(encryptedKey);
        const key = await decryptSessionKey(encryptedKeyBuffer, privateKeyRef.current);
        sessionKeyRef.current = key;
        console.log("Session key decrypted and stored.");

        // Re-decrypt messages
        const msgsSnapshot = messagesRef.current;
        Promise.all(msgsSnapshot.map(async (msg) => {
          if (msg.encryptionData && (!msg.text || msg.text === 'Failed to decrypt message')) {
            try {
              const text = await decryptMessageWithSessionKey(msg.encryptionData, key);
              return { ...msg, text };
            } catch (e) { return { ...msg, text: 'Failed to decrypt message' }; }
          }
          return msg;
        })).then(newMsgs => {
          setMessages(prev => [...newMsgs, ...prev.slice(msgsSnapshot.length)]);
        });

      } catch (err) {
        console.error("Error decrypting session key:", err);
      }
    });

    return () => {
      socket.off('message');
      socket.off('userList');
      socket.off('roomList');
      socket.off('userJoined');
      socket.off('sessionKey');
    };
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    if (userState.username && roomName) {
      socket.emit('join room', {
        name: userState.username,
        room: roomName,
        publickey: userState.publickey
      });
      setCurrentRoom(roomName);
    }
  };
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (userState.username && messageInput) {

      let messageData = {
        name: userState.username,
        text: messageInput,
      };

      if (sessionKeyRef.current) {
        try {
          // Encrypt
          const encryptionData = await encryptMessageWithSessionKey(messageInput, sessionKeyRef.current);
          messageData.encryptionData = encryptionData;
          messageData.text = ''; // Clear plain text
        } catch (e) {
          console.error("Encryption error", e);
          return; // Don't send if encryption failed and we intended to encrypt
        }
      }

      socket.emit('message', messageData);
      setMessageInput('');
    }
  };

  const handleLoginSubmit = async ({ username, password, publickey, isExisting, privateKey }) => {
    if (isExisting) {
      console.log('Logged in with existing public key:', publickey);
      try {
        const storedKey = localStorage.getItem('private_key');
        if (storedKey) {
          const parsedKey = JSON.parse(storedKey);
          privateKeyRef.current = await importKey(parsedKey, ["decrypt"]);
          console.log("Private key loaded from local storage");
        }
      } catch (e) {
        console.error("Failed to load private key", e);
      }
    } else {
      privateKeyRef.current = privateKey;
      try {
        const exportedKey = await exportKey(privateKey);
        localStorage.setItem('private_key', JSON.stringify(exportedKey));
      } catch (e) {
        console.error("Failed to save private key", e);
      }

      console.log('Registered with new keys');
      socket.emit('public key', publickey);
    }

    setUserState({
      username,
      password,
      publickey,
      socketId: socket.id,
      privateKey: privateKeyRef.current,
    });
  };

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <>
      <div id="livechat">
        <Popup
          trigger={!userState.username}
          socket={socket}
          onSubmit={handleLoginSubmit}
          onClose={() => { }}
        />

        <div className='userSettings'>
          <form id='form-userSettings' onSubmit={handleJoin}>
            <input
              id="roomInput"
              autoComplete="off"
              placeholder="Room name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              disabled={!!currentRoom}
            />
          </form>
        </div>
        <ul id="messages">
          {messages.map((msg, index) => {
            const isSelf = msg.name === userState.username;
            const isAdmin = msg.name === 'admin';

            let liClass = 'post';
            if (isSelf) liClass += ' post--self';
            else if (isAdmin) liClass += ' post--admin';
            else liClass += ' post--other';

            return (
              <li key={index} className={liClass}>
                {isAdmin ? (
                  <div className="post__text">{msg.text}</div>
                ) : (
                  <>
                    <div className={`post__header ${isSelf ? 'post__header--user' : 'post__header--reply'}`}>
                      <span className="post__header--name">{msg.name}</span>
                      <span className="post__header--date">{msg.date}</span>
                    </div>
                    <div className="post__text">{msg.text}</div>
                  </>
                )}
              </li>
            );
          })}
          <div ref={messagesEndRef} />
        </ul>

        <form id="form-message" onSubmit={handleSendMessage}>
          <input
            id="chatInput"
            autoComplete="off"
            placeholder="Type your message here..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
          />
          <button type="submit">Send</button>
        </form>

        <div className='livechat-footer'>
          <ul className='user-list'>
            {currentRoom && <li><em>Users in {currentRoom}:</em></li>}
            {users.map((user, i) => (
              <li key={i} className="user-list__item">{user.name}</li>
            ))}
          </ul>
          <ul className='room-list'>
            <li><em>Active Rooms:</em></li>
            {rooms.map((room, i) => (
              <li key={i} className="room-list__item">{room}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
};

export default App;