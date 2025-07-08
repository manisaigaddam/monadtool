import { type Client } from "@xmtp/browser-sdk";
import { getEscrowByConversation } from './escrow';
import type { ContentTypes } from './xmtp';

// Special message types for escrow
export interface EscrowMessage {
  type: 'escrow_created' | 'escrow_updated' | 'escrow_proposal';
  escrowId?: bigint;
  data: {
    nftContract?: string;
    tokenId?: string;
    price?: string;
    role?: 'seller' | 'buyer';
    action?: string;
    [key: string]: any;
  };
}

// Escrow command constants
export const ESCROW_COMMANDS = {
  CREATE: 'create',
  MANAGE: 'manage',
  STATUS: 'status',
  HELP: 'help'
} as const;

// Parse escrow command from message
export function parseEscrowCommand(message: string): { command: string; args: string[] } | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/escrow')) return null;
  
  const parts = trimmed.split(' ').filter(p => p.length > 0);
  if (parts.length < 2) return null;
  
  const command = parts[1].toLowerCase();
  const args = parts.slice(2);
  
  return { command, args };
}

// Check if message contains escrow reference
export function containsEscrowReference(message: string): boolean {
  return message.includes('escrow') || message.includes('Escrow') || 
         message.includes('/escrow') || message.includes('🤝') ||
         message.includes('📋');
}

// Render escrow content in messages
export function renderEscrowContent(message: string, escrowIds?: bigint[]): string {
  if (!escrowIds || escrowIds.length === 0) return message;
  
  // For now, keep the original message content unchanged
  // In the future, we could enhance this to show specific escrow references
  return message;
}

// Get conversation-specific escrow display number
export function getConversationEscrowNumber(conversationId: string, escrowId: bigint): string {
  // For now, always return #1 since we only allow one escrow per conversation
  // In future, this could track multiple escrows per conversation
  return '#1';
}

// Format escrow status message with conversation-specific numbering
export function formatEscrowStatusMessage(escrowId: bigint, conversationId?: string): string {
  const escrowNumber = conversationId ? getConversationEscrowNumber(conversationId, escrowId) : `#${escrowId.toString()}`;
  return `📋 Escrow ${escrowNumber} status updated. Use /escrow manage to take action.`;
}

// Format escrow creation announcement with conversation-specific numbering
export function formatEscrowCreatedMessage(
  escrowId: bigint,
  nftContract: string,
  tokenId: string,
  price: string,
  role: 'seller' | 'buyer',
  conversationId?: string
): string {
  const roleText = role === 'seller' ? 'selling' : 'buying';
  const nftDisplay = `${nftContract.slice(0, 6)}...#${tokenId}`;
  const escrowNumber = conversationId ? getConversationEscrowNumber(conversationId, escrowId) : `#${escrowId.toString()}`;
  
  return `🤝 Escrow ${escrowNumber} created! ${roleText === 'selling' ? 'I am' : 'You are'} ${roleText} NFT ${nftDisplay} for ${price} MON. Use /escrow manage to proceed.`;
}

// Send escrow notification message with conversation-specific numbering
export async function sendEscrowNotification(
  client: Client<ContentTypes>,
  conversation: any,
  escrowId: bigint,
  action: string
): Promise<void> {
  try {
    const escrowNumber = getConversationEscrowNumber(conversation.id, escrowId);
    const message = `🔔 Escrow ${escrowNumber}: ${action}`;
    await conversation.send(message);
  } catch (error) {
    console.error('Failed to send escrow notification:', error);
  }
}

// Send escrow creation announcement with conversation-specific numbering
export async function sendEscrowCreatedAnnouncement(
  client: Client<ContentTypes>,
  conversation: any,
  escrowId: bigint,
  nftContract: string,
  tokenId: string,
  price: string,
  userRole: 'seller' | 'buyer'
): Promise<void> {
  try {
    const message = formatEscrowCreatedMessage(escrowId, nftContract, tokenId, price, userRole, conversation.id);
    await conversation.send(message);
  } catch (error) {
    console.error('Failed to send escrow created announcement:', error);
  }
}

// Generate help message for escrow commands
export function getEscrowHelpMessage(): string {
  return `🤖 **Escrow Commands:**

\`/escrow create\` - Create a new escrow for P2P NFT trading
\`/escrow manage\` - Manage your existing escrow
\`/escrow status\` - Check current escrow status
\`/escrow help\` - Show this help message

**How it works:**
1. Use \`/escrow create\` to start a trustless NFT trade
2. Both parties deposit their assets (NFT + payment)
3. Complete the trade safely with smart contract protection
4. Dispute resolution available if needed

📋 Your escrow will be linked to this conversation for easy tracking.`;
}

// Check conversation for existing escrow
export async function checkConversationEscrow(conversationId: string): Promise<{
  hasEscrow: boolean;
  escrowId?: bigint;
}> {
  try {
    const escrowId = await getEscrowByConversation(conversationId);
    return {
      hasEscrow: escrowId !== null,
      escrowId: escrowId || undefined
    };
  } catch (error) {
    console.error('Failed to check conversation escrow:', error);
    return { hasEscrow: false };
  }
}

// Generate escrow proposal message with conversation-specific display
export function generateEscrowProposal(
  nftContract: string,
  tokenId: string,
  price: string,
  senderRole: 'seller' | 'buyer'
): string {
  const nftDisplay = `${nftContract.slice(0, 6)}...#${tokenId}`;
  const action = senderRole === 'seller' ? 'sell' : 'buy';
  
  return `💡 **Escrow Proposal**

I'd like to ${action} NFT ${nftDisplay} for ${price} MON using a trustless escrow.

Contract: \`${nftContract}\`
Token ID: \`${tokenId}\`
Price: \`${price} MON\`

Reply with \`/escrow create\` to set up the secure trade!`;
}

// Validate escrow creation for conversation
export function validateEscrowCreation(conversationId: string, hasExistingEscrow: boolean): {
  isValid: boolean;
  reason?: string;
} {
  if (hasExistingEscrow) {
    return {
      isValid: false,
      reason: 'This conversation already has an active escrow. Only one escrow per conversation is allowed.'
    };
  }
  
  return { isValid: true };
}

// Utility functions for UI
export function generateConversationKey(conversation: any, index: number): string {
  return `conversation-${conversation.id || index}`;
}

export function generateMessageKey(message: any, index: number): string {
  return `message-${message.id || message.sentAtNs || index}`;
}

export function formatInboxId(inboxId: string): string {
  if (!inboxId || inboxId === 'Unknown') return 'Unknown';
  if (inboxId.length > 10) {
    return `${inboxId.slice(0, 6)}...${inboxId.slice(-4)}`;
  }
  return inboxId;
}