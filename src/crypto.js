export async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: "SHA-256",
    },
    true, 
    ["encrypt", "decrypt"]
  );

  return keyPair;
}

// Exports public key to JWK format for sending to server
export async function exportKey(key) {
  return await window.crypto.subtle.exportKey(
    "jwk",
    key
  );
}

// Imports a JWK format key back into a CryptoKey object (use same hash as in gen)
export async function importKey(jwkData, keyUsage = ["encrypt"]) {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwkData,
    {
      name: "RSA-OAEP",
      hash: "SHA-256", 
    },
    true,
    keyUsage
  );
}

// Generate a random symmetric key (AES-GCM) for a message
export async function generateSessionKey() {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSessionKey(sessionKey, recipientPublicKey) {
  const exported = await window.crypto.subtle.exportKey("raw", sessionKey);
  return await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    exported
  );
}

export async function decryptSessionKey(encryptedKey, privateKey) {
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encryptedKey
  );
  return await window.crypto.subtle.importKey(
    "raw",
    decrypted,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}


export async function encryptMessageWithSessionKey(msgText, sessionKey) {
  const enc = new TextEncoder();
  const encodedText = enc.encode(msgText);
  
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    sessionKey,
    encodedText
  );

  return {
    iv: Array.from(iv),
    encryptedContent: Array.from(new Uint8Array(encryptedContent))
  };
}

export async function decryptMessageWithSessionKey(encryptionData, sessionKey) {
  const decryptedContent = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(encryptionData.iv) },
    sessionKey,
    new Uint8Array(encryptionData.encryptedContent)
  );
  return new TextDecoder().decode(decryptedContent);
}
