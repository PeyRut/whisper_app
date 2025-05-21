/**
 * Crypto utilities for message decryption
 * 
 * This module handles the client-side decryption of messages
 * using the Web Crypto API with AES-GCM encryption.
 */

/**
 * Decrypts an encrypted message using the provided key
 * @param {string} encryptedBase64 - Base64-encoded encrypted message (IV + Ciphertext + Auth Tag)
 * @param {string} keyString - Hex encoded decryption key from URL fragment
 * @returns {Promise<string>} - The decrypted message as plaintext
 */
async function decryptMessage(encryptedBase64, keyString) {
  try {
    console.log('Attempting to decrypt message...');
    
    if (!keyString || typeof keyString !== 'string' || !/^[0-9a-fA-F]{64}$/.test(keyString)) {
        throw new Error('Invalid decryption key format or length. Key must be a 64-character hex string.');
    }

    const encryptedDataWithIv = base64ToArrayBuffer(encryptedBase64);
    const ivLength = 12; 
    if (encryptedDataWithIv.byteLength < ivLength + 1) { 
        throw new Error('Encrypted data is too short or corrupted (missing IV or ciphertext).');
    }
    
    const iv = encryptedDataWithIv.slice(0, ivLength);
    const ciphertextWithTag = encryptedDataWithIv.slice(ivLength);
    
    const cryptoKey = await importKey(keyString, ["decrypt"]);
    
    const decryptedArrayBuffer = await decryptWithAESGCM(cryptoKey, iv, ciphertextWithTag);
    
    const decryptedContent = new TextDecoder('utf-8').decode(decryptedArrayBuffer);

    console.log('Message decrypted successfully.');

    return decryptedContent;
    
  } catch (error) {
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt message. The link may be incorrect, the message corrupted, or the key invalid.');
  }
}

/**
 * Generates a new random encryption key (AES-256) as a hex string.
 * @returns {Promise<string>} - A 32-byte (256-bit) key encoded as a 64-character hex string.
 */
async function generateEncryptionKey() {
  try {
    const key = await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true, 
      ["encrypt", "decrypt"]
    );

    const keyData = await window.crypto.subtle.exportKey("raw", key);
    return arrayBufferToHexString(keyData);
  } catch (error) {
    console.error("Error generating encryption key:", error);
    throw new Error("Could not generate a secure encryption key.");
  }
}

/**
 * Encrypts a plaintext message using AES-GCM with a provided hex key string.
 * Prepends a 12-byte IV to the ciphertext.
 * @param {string} plaintext - The message to encrypt.
 * @param {string} keyString - The 64-character hex string representation of the AES-256 key.
 * @returns {Promise<string>} - Base64 encoded string (IV + Ciphertext + Auth Tag).
 */
async function encryptMessage(plaintext, keyString) {
  try {
    if (!keyString || typeof keyString !== 'string' || !/^[0-9a-fA-F]{64}$/.test(keyString)) {
        throw new Error('Invalid encryption key format or length. Key must be a 64-character hex string.');
    }

    const cryptoKey = await importKey(keyString, ["encrypt"]);
    
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); 
    const encodedPlaintext = new TextEncoder().encode(plaintext);
    
    const ciphertextWithTag = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      cryptoKey,
      encodedPlaintext
    );
    
    const ivAndCiphertext = new Uint8Array(iv.length + ciphertextWithTag.byteLength);
    ivAndCiphertext.set(iv, 0);
    ivAndCiphertext.set(new Uint8Array(ciphertextWithTag), iv.length);
    
    return arrayBufferToBase64(ivAndCiphertext.buffer);
    
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt message.");
  }
}

/**
 * Imports a hex-encoded key string as a CryptoKey object for AES-GCM.
 * @param {string} keyString - Hex encoded key string (must be 64 characters for AES-256).
 * @param {string[]} keyUsages - Array of key usages (e.g., ["encrypt"], ["decrypt"], ["encrypt", "decrypt"]).
 * @returns {Promise<CryptoKey>} - The imported CryptoKey.
 */
async function importKey(keyString, keyUsages) {
  try {
    const keyData = hexStringToArrayBuffer(keyString); 
    if (keyData.byteLength !== 32) {
         throw new Error(`Invalid key length: Expected 32 bytes, got ${keyData.byteLength}.`);
     }

    return await window.crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "AES-GCM", length: 256 },
      true, // `extractable` is true to allow exporting the key for the link, or if needed by other operations.
            // For purely internal keys used only for one operation (e.g. decrypt only from URL), `false` is safer if export isn't needed.
            // Here, since generateEncryptionKey exports, keeping it true for consistency with key generation and potential dual use.
      keyUsages
    );
  } catch (error) {
      console.error('Error importing key:', error.message);
      throw new Error('Failed to prepare cryptographic key. The key material may be invalid.');
  }
}

/**
 * Decrypts data using AES-GCM with the Web Crypto API.
 * @param {CryptoKey} key - The AES-GCM CryptoKey object.
 * @param {ArrayBuffer} iv - The Initialization Vector (typically 12 bytes for AES-GCM).
 * @param {ArrayBuffer} ciphertextWithTag - The encrypted data including the authentication tag.
 * @returns {Promise<ArrayBuffer>} - The decrypted data as an ArrayBuffer.
 */
async function decryptWithAESGCM(key, iv, ciphertextWithTag) {
  try {
    return await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      ciphertextWithTag
    );
  } catch (error) {
      console.error('Web Crypto API decryption failed:', error.message);
      throw new Error('Decryption operation failed. The data may be corrupted or the key/IV incorrect.');
  }
}

/**
 * Converts a Base64 string to an ArrayBuffer.
 * @param {string} base64 - The Base64 encoded string.
 * @returns {ArrayBuffer} - The resulting ArrayBuffer.
 * @throws {Error} if Base64 string is invalid.
 */
function base64ToArrayBuffer(base64) {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
      console.error('Base64 decoding failed:', e.message);
      throw new Error('Failed to decode Base64 encrypted content. The content may be corrupted.');
  }
}

/**
 * Converts a hexadecimal string to an ArrayBuffer.
 * @param {string} hexString - The hexadecimal string (e.g., "1a2b3c..."). Must have an even number of characters.
 * @returns {ArrayBuffer} - The resulting ArrayBuffer.
 * @throws {Error} if hex string is invalid (odd length, non-hex characters).
 */
function hexStringToArrayBuffer(hexString) {
  if (typeof hexString !== 'string' || hexString.length % 2 !== 0) {
    throw new Error('Invalid hex string: Must have an even number of characters.');
  }
  
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    const hexByte = hexString.substring(i, i + 2);
    const byteValue = parseInt(hexByte, 16);
    if (isNaN(byteValue)) {
       throw new Error(`Invalid hex character '${hexByte}' found in string.`);
    }
    bytes[i / 2] = byteValue;
  }
  return bytes.buffer;
}

/**
 * Converts an ArrayBuffer to a Base64 string.
 * @param {ArrayBuffer} buffer - The ArrayBuffer to convert.
 * @returns {string} - The Base64 encoded string.
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts an ArrayBuffer to a hexadecimal string.
 * @param {ArrayBuffer} buffer - The ArrayBuffer to convert.
 * @returns {string} - The hexadecimal string.
 */
function arrayBufferToHexString(buffer) {
  const byteArray = new Uint8Array(buffer);
  let hexString = '';
  for (let i = 0; i < byteArray.length; i++) {
    const hex = byteArray[i].toString(16);
    hexString += (hex.length === 1 ? '0' : '') + hex;
  }
  return hexString;
}

