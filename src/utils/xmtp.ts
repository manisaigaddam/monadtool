import { Client, type Signer, type Identifier, type ClientOptions, type ExtractCodecContentTypes } from "@xmtp/browser-sdk";
import { ReactionCodec } from "@xmtp/content-type-reaction";
import { RemoteAttachmentCodec } from "@xmtp/content-type-remote-attachment";
import { ReplyCodec } from "@xmtp/content-type-reply";
import { TransactionReferenceCodec } from "@xmtp/content-type-transaction-reference";
import { WalletSendCallsCodec } from "@xmtp/content-type-wallet-send-calls";
import { WalletClient, toBytes } from 'viem';
import { 
  setEncryptedItem, 
  getEncryptedItem, 
  removeEncryptedItem, 
  migrateToEncrypted, 
  isEncryptionSupported,
  EncryptedStorage 
} from './encryption';

// XMTP Environment - Production network
const XMTP_ENV = "production";

// Content types for XMTP client
export type ContentTypes = ExtractCodecContentTypes<
  [
    ReactionCodec,
    ReplyCodec,
    RemoteAttachmentCodec,
    TransactionReferenceCodec,
    WalletSendCallsCodec,
  ]
>;

// Initialize client options
export type InitializeClientOptions = {
  dbEncryptionKey?: Uint8Array;
  env?: ClientOptions["env"];
  loggingLevel?: ClientOptions["loggingLevel"];
  signer: Signer;
};

// Generate unique key for messages to prevent React warnings
export function generateMessageKey(message: any, index: number): string {
  const timestamp = message.sentAtNs || Date.now();
  const sender = message.senderInboxId || 'unknown';
  const content = typeof message.content === 'string' 
    ? message.content.slice(0, 10) 
    : 'content';
  return `msg-${timestamp}-${sender}-${index}-${content.replace(/\s/g, '')}`;
}

// Generate unique key for conversations
export function generateConversationKey(conversation: any, index: number): string {
  const lastMsgTime = conversation.lastMessage?.sentAtNs || Date.now();
  return `conv-${conversation.id}-${index}-${lastMsgTime}`;
}

// Create XMTP signer from wallet client
export function createXMTPSigner(walletClient: WalletClient, address: string): Signer {
  return {
    type: "EOA",
    getIdentifier: async () => ({
      identifier: address.toLowerCase(),
      identifierKind: "Ethereum",
    }),
    signMessage: async (message: string) => {
      const signature = await walletClient.signMessage({
        account: address as `0x${string}`,
        message,
      });
      // Convert hex string to Uint8Array using viem's toBytes
      return toBytes(signature);
    },
  };
}

// Create XMTP client with content types and local database
export async function createXMTPClient(signer: Signer, options?: Partial<InitializeClientOptions>): Promise<Client<ContentTypes>> {
  try {
    const client = await Client.create(signer, {
      env: options?.env || XMTP_ENV,
      loggingLevel: options?.loggingLevel,
      dbEncryptionKey: options?.dbEncryptionKey,
      codecs: [
        new ReactionCodec(),
        new ReplyCodec(),
        new RemoteAttachmentCodec(),
        new TransactionReferenceCodec(),
        new WalletSendCallsCodec(),
      ],
    });
    
    const identifier = await signer.getIdentifier();
    console.log("XMTP client created successfully", {
      inboxId: client.inboxId,
      address: identifier.identifier,
    });
    
    return client;
  } catch (error) {
    console.error("Failed to create XMTP client:", error);
    throw error;
  }
}

// Check if identities can receive messages
export async function checkCanMessage(identities: Identifier[]): Promise<Map<string, boolean>> {
  try {
    // Use Client.canMessage as a static method with environment
    return await Client.canMessage(identities, XMTP_ENV);
  } catch (error) {
    console.error("Failed to check if identities can message:", error);
    return new Map();
  }
}

// Helper to format inbox ID for display
export function formatInboxId(inboxId: string): string {
  if (!inboxId || typeof inboxId !== 'string' || inboxId === 'Unknown') {
    return 'Unknown User';
  }
  return `${inboxId.slice(0, 6)}...${inboxId.slice(-4)}`;
}

// Helper to format address for display
export function formatAddress(address: string): string {
  if (!address || typeof address !== 'string') {
    return 'Invalid address';
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// XMTP client state management with encryption support
export class XMTPClientManager {
  private client: Client<ContentTypes> | null = null;
  private isConnecting = false;
  private connectionPromise: Promise<Client<ContentTypes>> | null = null;
  private encryptedStorage: EncryptedStorage | null = null;
  private userAddress: string | null = null;

  async connect(signer: Signer, options?: Partial<InitializeClientOptions>): Promise<Client<ContentTypes>> {
    if (this.client) {
      return this.client;
    }

    if (this.isConnecting && this.connectionPromise) {
      // Wait for existing connection to complete
      return this.connectionPromise;
    }

    this.isConnecting = true;
    
    try {
      // Get user address for encrypted storage
      const identifier = await signer.getIdentifier();
      this.userAddress = identifier.identifier;
      
      // Initialize encrypted storage
      if (isEncryptionSupported() && this.userAddress) {
        this.encryptedStorage = new EncryptedStorage(this.userAddress);
        
        // Migrate existing unencrypted data
        await migrateToEncrypted(this.userAddress);
        
        console.log('Encrypted storage initialized for XMTP data');
      } else {
        console.warn('Web Crypto API not supported, using unencrypted storage');
      }
      
      this.connectionPromise = createXMTPClient(signer, options);
      this.client = await this.connectionPromise;
      
      return this.client;
    } catch (error) {
      this.client = null;
      throw error;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  disconnect() {
    if (this.client) {
      this.client.close();
    }
    this.client = null;
    this.isConnecting = false;
    this.connectionPromise = null;
    this.encryptedStorage = null;
    this.userAddress = null;
  }

  getClient(): Client<ContentTypes> | null {
    return this.client;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  isConnectingState(): boolean {
    return this.isConnecting;
  }

  // Encrypted storage methods
  async setSecureItem(key: string, value: string): Promise<void> {
    if (this.encryptedStorage) {
      await this.encryptedStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, value);
    }
  }

  async getSecureItem(key: string): Promise<string | null> {
    if (this.encryptedStorage) {
      return await this.encryptedStorage.getItem(key);
    } else {
      return localStorage.getItem(key);
    }
  }

  removeSecureItem(key: string): void {
    if (this.encryptedStorage) {
      this.encryptedStorage.removeItem(key);
    } else {
      localStorage.removeItem(key);
    }
  }

  async clearSecureStorage(): Promise<void> {
    if (this.encryptedStorage) {
      await this.encryptedStorage.clear();
    }
  }

  getEncryptedStorage(): EncryptedStorage | null {
    return this.encryptedStorage;
  }
}

// Helper to get peer inbox ID from conversation
export function getPeerInboxId(conversation: any, clientInboxId: string): string {
  try {
    // If this is our conversation wrapper, get the actual conversation
    const actualConvo = conversation.conversation || conversation;
    
    console.log('Getting peer inbox ID for conversation:', {
      conversationId: actualConvo.id,
      clientInboxId,
      actualConvoKeys: Object.keys(actualConvo),
      conversationData: actualConvo
    });
    
    // XMTP v3 Browser SDK: Check for conversationId property (hex format)
    if (actualConvo.conversationId && typeof actualConvo.conversationId === 'string') {
      // Use the conversation ID as a fallback display name
      return `Conversation ${actualConvo.conversationId.slice(0, 8)}...`;
    }
    
    // Try to extract from conversation ID if it contains peer information
    if (actualConvo.id && typeof actualConvo.id === 'string') {
      // For newer XMTP SDK, conversation ID might be different format
      if (actualConvo.id.includes('-') && actualConvo.id !== clientInboxId) {
        const parts = actualConvo.id.split('-');
        for (const part of parts) {
          if (part && part !== clientInboxId && part.length > 10) {
            return part;
          }
        }
      }
      
      // If it's a long hex string, just use a shortened version
      if (actualConvo.id.length > 20) {
        return `Chat ${actualConvo.id.slice(0, 8)}...`;
      }
    }
    
    // Try to get from peerInboxId property (if available)
    if (actualConvo.peerInboxId && actualConvo.peerInboxId !== clientInboxId) {
      return actualConvo.peerInboxId;
    }
    
    // Try to get from members array (for group chats or DMs)
    if (actualConvo.members && Array.isArray(actualConvo.members)) {
      const peer = actualConvo.members.find((member: any) => 
        member.inboxId && member.inboxId !== clientInboxId
      );
      if (peer?.inboxId) {
        return peer.inboxId;
      }
    }
    
    // Try to get from participantInboxIds (another possible property)
    if (actualConvo.participantInboxIds && Array.isArray(actualConvo.participantInboxIds)) {
      const peerInboxId = actualConvo.participantInboxIds.find((id: string) => id !== clientInboxId);
      if (peerInboxId) {
        return peerInboxId;
      }
    }
    
    // Try to get from peerAddresses if available (though this gives addresses, not inbox IDs)
    if (actualConvo.peerAddresses && actualConvo.peerAddresses.length > 0) {
      return actualConvo.peerAddresses[0];
    }
    
    // If we have a topic or conversation ID, try to extract useful info
    if (actualConvo.topic) {
      return `Topic: ${actualConvo.topic.slice(0, 10)}...`;
    }
    
    console.warn('Could not determine peer inbox ID for conversation:', actualConvo);
    return 'Unknown';
  } catch (error) {
    console.error('Error getting peer inbox ID:', error);
    return 'Unknown';
  }
}

// Helper to get conversation display name
export function getConversationDisplayName(conversation: any, clientInboxId?: string): string {
  try {
    const peerInboxId = getPeerInboxId(conversation, clientInboxId || '');
    
    // If we have a valid inbox ID (not 'Unknown'), format it
    if (peerInboxId && peerInboxId !== 'Unknown') {
      return formatInboxId(peerInboxId);
    }
    
    // Fallback to showing conversation type or generic name
    const actualConvo = conversation.conversation || conversation;
    if (actualConvo.metadata?.conversationType) {
      return `${actualConvo.metadata.conversationType.toUpperCase()} Chat`;
    }
    
    return 'Chat';
  } catch (error) {
    console.error('Error getting conversation display name:', error);
    return 'Chat';
  }
}

// Helper to get peer wallet address (if available)
export function getPeerWalletAddress(conversation: any): string | null {
  try {
    const actualConvo = conversation.conversation || conversation;
    
    // Try to get from peerAddresses
    if (actualConvo.peerAddresses && actualConvo.peerAddresses.length > 0) {
      return actualConvo.peerAddresses[0];
    }
    
    // Try to get from members array
    if (actualConvo.members && Array.isArray(actualConvo.members)) {
      const peer = actualConvo.members.find((member: any) => member.address);
      if (peer?.address) {
        return peer.address;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting peer wallet address:', error);
    return null;
  }
}

// Enhanced function to get recipient wallet address using XMTP API
export async function getRecipientWalletAddress(conversation: any, clientInboxId: string): Promise<string | null> {
  try {
    const actualConvo = conversation.conversation || conversation;
    
    console.log('Getting recipient wallet address for conversation:', {
      conversationId: actualConvo.id,
      clientInboxId,
      hasMembers: !!actualConvo.members,
      membersType: typeof actualConvo.members
    });
    
    // Primary method: Use the proper XMTP API to get conversation members
    if (actualConvo.members && typeof actualConvo.members === 'function') {
      try {
        const members = await actualConvo.members();
        console.log('Conversation members:', members);
        
        // Find the peer member (not the current user)
        const peerMember = members.find((member: any) => 
          member.inboxId && member.inboxId !== clientInboxId
        );
        
        console.log('Found peer member:', peerMember);
        
        // Try to get wallet address from accountIdentifiers
        if (peerMember?.accountIdentifiers && peerMember.accountIdentifiers.length > 0) {
          const walletAddress = peerMember.accountIdentifiers[0].identifier;
          console.log('Extracted wallet address from accountIdentifiers:', walletAddress);
          
          // Validate it's a proper Ethereum address
          if (walletAddress && walletAddress.startsWith('0x') && walletAddress.length === 42) {
            return walletAddress;
          }
        }
        
        // Fallback: Return inbox ID if no wallet address found
        if (peerMember?.inboxId) {
          console.log('Using inbox ID as fallback:', peerMember.inboxId);
          return peerMember.inboxId;
        }
      } catch (memberError) {
        console.error('Error calling members() function:', memberError);
      }
    }
    
    // Secondary method: Try to get directly from DM conversation if members is array
    if (actualConvo.members && Array.isArray(actualConvo.members)) {
      console.log('Members is array:', actualConvo.members);
      const peerMember = actualConvo.members.find((member: any) => 
        member.inboxId && member.inboxId !== clientInboxId
      );
      
      if (peerMember?.accountIdentifiers && peerMember.accountIdentifiers.length > 0) {
        const walletAddress = peerMember.accountIdentifiers[0].identifier;
        if (walletAddress && walletAddress.startsWith('0x') && walletAddress.length === 42) {
          return walletAddress;
        }
      }
      
      if (peerMember?.inboxId) {
        return peerMember.inboxId;
      }
    }
    
    // Tertiary method: For DM conversations, try alternative approach
    if (actualConvo.type === 'dm' || actualConvo.conversationType === 'dm') {
      console.log('This is a DM conversation, trying alternative methods');
      
      // Try to get peer inbox ID
      if (actualConvo.peerInboxId && actualConvo.peerInboxId !== clientInboxId) {
        console.log('Found peer inbox ID from peerInboxId:', actualConvo.peerInboxId);
        return actualConvo.peerInboxId;
      }
      
      // Try memberInboxIds array
      if (actualConvo.memberInboxIds && Array.isArray(actualConvo.memberInboxIds)) {
        const peerInboxId = actualConvo.memberInboxIds.find((id: string) => id !== clientInboxId);
        if (peerInboxId) {
          console.log('Found peer inbox from memberInboxIds:', peerInboxId);
          return peerInboxId;
        }
      }
    }
    
    // Final fallback: Try existing methods
    console.log('Falling back to getPeerWalletAddress');
    const fallbackAddress = getPeerWalletAddress(conversation);
    if (fallbackAddress) {
      return fallbackAddress;
    }
    
    // If all else fails, return a generic identifier
    console.log('No address found, returning null');
    return null;
  } catch (error) {
    console.error('Error getting recipient wallet address:', error);
    return getPeerWalletAddress(conversation);
  }
}

// Get all conversation members with their wallet addresses
export async function getConversationMembers(conversation: any): Promise<Array<{
  inboxId: string;
  walletAddress: string | null;
  permissionLevel: string;
  consentState: string;
}>> {
  try {
    const actualConvo = conversation.conversation || conversation;
    
    if (actualConvo.members && typeof actualConvo.members === 'function') {
      const members = await actualConvo.members();
      
      return members.map((member: any) => ({
        inboxId: member.inboxId,
        walletAddress: member.accountIdentifiers?.[0]?.identifier || null,
        permissionLevel: member.permissionLevel || 'member',
        consentState: member.consentState || 'unknown'
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error getting conversation members:', error);
    return [];
  }
}

// Get conversation display name with wallet address
export async function getConversationDisplayNameWithAddress(
  conversation: any, 
  clientInboxId: string
): Promise<{ displayName: string; walletAddress: string | null }> {
  try {
    const walletAddress = await getRecipientWalletAddress(conversation, clientInboxId);
    const displayName = await getConversationDisplayName(conversation, clientInboxId);
    
    return {
      displayName,
      walletAddress
    };
  } catch (error) {
    console.error('Error getting conversation display name with address:', error);
    return {
      displayName: 'Chat',
      walletAddress: null
    };
  }
}

// Global XMTP client manager instance
export const xmtpClientManager = new XMTPClientManager();