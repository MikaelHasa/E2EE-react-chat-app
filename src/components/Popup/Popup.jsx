import React, { useState } from 'react'
import { generateKeyPair, exportKey } from '../../crypto.js';
import './Popup.css';

const Popup = ({ trigger, onSubmit, onClose, socket }) => {
  const [formValues, setFormValues] = useState({
    username: '',
    password: '',
  });
  const [errorMessage, setErrorMessage] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
    setErrorMessage('');
  };

  const registerUser = async (loginData) => {
    console.log('User not found, generating keys and registering...');
    
    const keyPair = await generateKeyPair();
    const publicKey = await exportKey(keyPair.publicKey);

    const registerData = { ...loginData, publickey: publicKey };
    
    // Login endpoint can handle registration
    const response = await fetch('http://localhost:3000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerData),
    });

    if (!response.ok) throw new Error('Registration failed');

    const data = await response.json();
    
    onSubmit({
      ...formValues,
      publickey: publicKey,
      isExisting: false,
      privateKey: keyPair.privateKey
    });
  };

  const loginUser = async (response) => {
    const data = await response.json();
    console.log('Login successful:', data);

    onSubmit({
      ...formValues,
      publickey: data.user.publickey,
      isExisting: true
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    
    const loginData = {
      username: formValues.username,
      password: formValues.password,
      socketId: socket?.id
    };

    try {
      const response = await fetch('http://localhost:3000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData),
      });

      if (response.status === 404) {
        await registerUser(loginData);
      } else if (response.ok) {
        await loginUser(response);
      } else {
        setErrorMessage('Invalid credentials');
      }
    } catch (error) {
      console.error('Auth error:', error);
      setErrorMessage(error.message || 'Error logging in');
    }
  };

  if (!trigger) return null;

  return (
    <div className='popup-overlay'>
      <div className='popup-content'>
        <button className="close-btn" onClick={onClose} aria-label="Close">&times;</button>
        <h2>Welcome</h2>
        <p className="subtitle">Please log in to continue</p>

        {errorMessage && <p className="error-message">{errorMessage}</p>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              placeholder="Enter your username"
              value={formValues.username}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Enter your password"
              value={formValues.password}
              onChange={handleInputChange}
              required
            />
          </div>

          <button className="login-btn" type="submit">Log In</button>
        </form>
      </div>
    </div>
  );
}

export default Popup