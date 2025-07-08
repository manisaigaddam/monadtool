/**
 * Web Crypto API utilities for encrypting/decrypting local storage data
 * Since XMTP browser SDK doesn't provide built-in encryption for local storage,
 * we implement our own using Web Crypto API for enhanced security.
 */

// Configuration
const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

// Storage keys
const ENCRYPTION_KEY_STORAGE = 'xmtp_encryption_key';
const ENCRYPTED_DATA_PREFIX = 'encrypted_';

/**
 * Generate a cryptographic key for encryption/decryption
 */
async function generateEncryptionKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: ENCRYPTION_ALGORITHM,
      length: KEY_LENGTH,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Export a CryptoKey to a JSON Web Key format for storage
 */
async function exportKey(key: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey('jwk', key);
}

/**
 * Import a JSON Web Key back to a CryptoKey
 */
async function importKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: ENCRYPTION_ALGORITHM,
      length: KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Get or create an encryption key for the current user
 */
async function getOrCreateEncryptionKey(userAddress: string): Promise<CryptoKey> {
  const keyStorageId = `${ENCRYPTION_KEY_STORAGE}_${userAddress.toLowerCase()}`;
  
  try {
    // Try to load existing key
    const storedKey = localStorage.getItem(keyStorageId);
    if (storedKey) {
      const jwk = JSON.parse(storedKey);
      return await importKey(jwk);
    }
  } catch (error) {
    console.warn('Failed to load existing encryption key, generating new one:', error);
  }
  
  // Generate new key
  const key = await generateEncryptionKey();
  const jwk = await exportKey(key);
  localStorage.setItem(keyStorageId, JSON.stringify(jwk));
  
  return key;
}

/**
 * Encrypt data using AES-GCM
 */
async function encryptData(data: string, key: CryptoKey): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Encrypt data
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: ENCRYPTION_ALGORITHM,
      iv: iv,
    },
    key,
    dataBuffer
  );
  
  // Convert to base64 for storage
  const encrypted = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  const ivBase64 = btoa(String.fromCharCode(...iv));
  
  return { encrypted, iv: ivBase64 };
}

/**
 * Decrypt data using AES-GCM
 */
async function decryptData(encrypted: string, iv: string, key: CryptoKey): Promise<string> {
  // Convert from base64
  const encryptedBuffer = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const ivBuffer = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  
  // Decrypt data
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: ENCRYPTION_ALGORITHM,
      iv: ivBuffer,
    },
    key,
    encryptedBuffer
  );
  
  // Convert back to string
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Securely store encrypted data in localStorage
 */
export async function setEncryptedItem(key: string, value: string, userAddress: string): Promise<void> {
  try {
    if (!userAddress) {
      throw new Error('User address is required for encryption');
    }
    
    const encryptionKey = await getOrCreateEncryptionKey(userAddress);
    const { encrypted, iv } = await encryptData(value, encryptionKey);
    
    const encryptedData = {
      encrypted,
      iv,
      timestamp: Date.now(),
      version: '1.0'
    };
    
    localStorage.setItem(`${ENCRYPTED_DATA_PREFIX}${key}`, JSON.stringify(encryptedData));
  } catch (error) {
    console.error('Failed to encrypt and store data:', error);
    // Fallback to unencrypted storage with warning
    console.warn('Falling back to unencrypted storage');
    localStorage.setItem(key, value);
  }
}

/**
 * Retrieve and decrypt data from localStorage
 */
export async function getEncryptedItem(key: string, userAddress: string): Promise<string | null> {
  try {
    if (!userAddress) {
      // Try unencrypted fallback
      return localStorage.getItem(key);
    }
    
    const encryptedKey = `${ENCRYPTED_DATA_PREFIX}${key}`;
    const storedData = localStorage.getItem(encryptedKey);
    
    if (!storedData) {
      // Try unencrypted fallback
      return localStorage.getItem(key);
    }
    
    // Validate stored data format
    let parsedData;
    try {
      parsedData = JSON.parse(storedData);
    } catch (parseError) {
      // Silently clean up corrupted data and try unencrypted fallback
      localStorage.removeItem(encryptedKey);
      return localStorage.getItem(key);
    }
    
    if (!parsedData.encrypted || !parsedData.iv) {
      // Silently clean up incomplete data and try unencrypted fallback
      localStorage.removeItem(encryptedKey);
      return localStorage.getItem(key);
    }
    
    const encryptionKey = await getOrCreateEncryptionKey(userAddress);
    
    try {
      return await decryptData(parsedData.encrypted, parsedData.iv, encryptionKey);
    } catch (decryptError) {
      // Silently clean up and fallback - this is normal during key rotation or migration
      localStorage.removeItem(encryptedKey);
      return localStorage.getItem(key);
    }
  } catch (error) {
    console.error('Failed to retrieve encrypted data:', error);
    // Try unencrypted fallback
    return localStorage.getItem(key);
  }
}

/**
 * Remove encrypted data from localStorage
 */
export function removeEncryptedItem(key: string): void {
  localStorage.removeItem(`${ENCRYPTED_DATA_PREFIX}${key}`);
  // Also remove unencrypted fallback
  localStorage.removeItem(key);
}

/**
 * Clear all encrypted data for a specific user
 */
export function clearUserEncryptedData(userAddress: string): void {
  const keyStorageId = `${ENCRYPTION_KEY_STORAGE}_${userAddress.toLowerCase()}`;
  localStorage.removeItem(keyStorageId);
  
  // Remove all encrypted data items
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(ENCRYPTED_DATA_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

/**
 * Check if Web Crypto API is supported
 */
export function isEncryptionSupported(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.getRandomValues !== 'undefined';
}

/**
 * Migrate existing unencrypted data to encrypted format
 */
export async function migrateToEncrypted(userAddress: string): Promise<void> {
  if (!isEncryptionSupported() || !userAddress) {
    return;
  }
  
  try {
    // List of XMTP-related localStorage keys that should be encrypted
    const xmtpKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.includes('xmtp') || 
        key.includes('conversation') || 
        key.includes('message') ||
        key.includes('keystore') ||
        key.includes('private_key')
      ) && !key.startsWith(ENCRYPTED_DATA_PREFIX)) {
        xmtpKeys.push(key);
      }
    }
    
    // Migrate each key to encrypted storage
    for (const key of xmtpKeys) {
      const value = localStorage.getItem(key);
      if (value) {
        await setEncryptedItem(key, value, userAddress);
        localStorage.removeItem(key);
        console.log(`Migrated ${key} to encrypted storage`);
      }
    }
    
    if (xmtpKeys.length > 0) {
      console.log(`Successfully migrated ${xmtpKeys.length} items to encrypted storage`);
    }
  } catch (error) {
    console.error('Failed to migrate to encrypted storage:', error);
  }
}

/**
 * Enhanced localStorage wrapper with automatic encryption
 */
export class EncryptedStorage {
  private userAddress: string;
  
  constructor(userAddress: string) {
    this.userAddress = userAddress;
  }
  
  async setItem(key: string, value: string): Promise<void> {
    await setEncryptedItem(key, value, this.userAddress);
  }
  
  async getItem(key: string): Promise<string | null> {
    return await getEncryptedItem(key, this.userAddress);
  }
  
  removeItem(key: string): void {
    removeEncryptedItem(key);
  }
  
  async clear(): Promise<void> {
    clearUserEncryptedData(this.userAddress);
  }
} 