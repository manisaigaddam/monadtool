import { 
  readContract, 
  writeContract, 
  waitForTransactionReceipt
} from '@wagmi/core';
import { parseEther, formatEther, type Address } from 'viem';
import { config } from './wagmiConfig';

// Contract address from deployment - UPDATE THIS AFTER DEPLOYMENT
export const NFT_ESCROW_CONTRACT_ADDRESS: Address = '0x9B581eC73126fE9561dAED14B7B0a2B7E61A0A18';

// Escrow states enum matching the contract
export enum EscrowState {
  CREATED = 0,
  FUNDED = 1,
  NFT_DEPOSITED = 2,
  ACTIVE = 3,
  COMPLETED = 4,
  CANCELLED = 5,
  DISPUTED = 6
}

// Enhanced Escrow struct type to match new contract
export interface Escrow {
  id: bigint;
  seller: Address;
  buyer: Address;
  nftContract: Address;
  tokenId: bigint;
  price: bigint;
  deadline: bigint;
  state: EscrowState;
  createdAt: bigint;
  disputeDeadline: bigint;
  ipfsMetadata: string;
  sellerAgreed: boolean;
  buyerAgreed: boolean;
  xmtpConversationId: string; // Added conversation ID to escrow struct
}

// Enhanced Contract ABI with new functions
export const NFT_ESCROW_ABI = [
  // Read functions
  {
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    name: 'getEscrow',
    outputs: [{
      components: [
        { name: 'id', type: 'uint256' },
        { name: 'seller', type: 'address' },
        { name: 'buyer', type: 'address' },
        { name: 'nftContract', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'price', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'state', type: 'uint8' },
        { name: 'createdAt', type: 'uint256' },
        { name: 'disputeDeadline', type: 'uint256' },
        { name: 'ipfsMetadata', type: 'string' },
        { name: 'sellerAgreed', type: 'bool' },
        { name: 'buyerAgreed', type: 'bool' },
        { name: 'xmtpConversationId', type: 'bytes32' }
      ],
      type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserEscrows',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'xmtpConversationId', type: 'bytes32' }],
    name: 'getConversationEscrows',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'xmtpConversationId', type: 'bytes32' }],
    name: 'getEscrowByXMTP',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getTotalEscrows',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // Write functions
  {
    inputs: [
      { name: 'seller', type: 'address' },
      { name: 'buyer', type: 'address' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'xmtpConversationId', type: 'bytes32' },
      { name: 'ipfsMetadata', type: 'string' }
    ],
    name: 'createEscrow',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    name: 'depositPayment',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    name: 'depositNFT',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    name: 'completeEscrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'escrowId', type: 'uint256' },
      { name: 'reason', type: 'string' }
    ],
    name: 'raiseDispute',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    name: 'resolveExpiredDispute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'escrowId', type: 'uint256' },
      { name: 'reason', type: 'string' }
    ],
    name: 'cancelEscrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    name: 'cancelExpiredEscrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'escrowId', type: 'uint256' },
      { indexed: true, name: 'seller', type: 'address' },
      { indexed: true, name: 'buyer', type: 'address' },
      { indexed: false, name: 'nftContract', type: 'address' },
      { indexed: false, name: 'tokenId', type: 'uint256' },
      { indexed: false, name: 'price', type: 'uint256' },
      { indexed: false, name: 'xmtpConversationId', type: 'bytes32' }
    ],
    name: 'EscrowCreated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'escrowId', type: 'uint256' }
    ],
    name: 'EscrowCancelled',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'escrowId', type: 'uint256' }
    ],
    name: 'DisputeExpired',
    type: 'event'
  }
] as const;

// Helper functions
export function getEscrowStateLabel(state: EscrowState): string {
  switch (state) {
    case EscrowState.CREATED: return 'Created';
    case EscrowState.FUNDED: return 'Funded';
    case EscrowState.NFT_DEPOSITED: return 'NFT Deposited';
    case EscrowState.ACTIVE: return 'Active';
    case EscrowState.COMPLETED: return 'Completed';
    case EscrowState.CANCELLED: return 'Cancelled';
    case EscrowState.DISPUTED: return 'Disputed';
    default: return 'Unknown';
  }
}

export function getEscrowStateColor(state: EscrowState): string {
  switch (state) {
    case EscrowState.CREATED: return 'bg-blue-600 text-white';
    case EscrowState.FUNDED: return 'bg-yellow-600 text-white';
    case EscrowState.NFT_DEPOSITED: return 'bg-purple-600 text-white';
    case EscrowState.ACTIVE: return 'bg-green-600 text-white';
    case EscrowState.COMPLETED: return 'bg-emerald-600 text-white';
    case EscrowState.CANCELLED: return 'bg-red-600 text-white';
    case EscrowState.DISPUTED: return 'bg-orange-600 text-white';
    default: return 'bg-gray-600 text-white';
  }
}

export function formatPrice(priceWei: bigint): string {
  return formatEther(priceWei);
}

export function parsePrice(priceEth: string): bigint {
  return parseEther(priceEth);
}

// Convert conversation ID to bytes32 for contract
export function conversationIdToBytes32(conversationId: string): `0x${string}` {
  // Convert conversation ID to bytes32
  const encoder = new TextEncoder();
  const data = encoder.encode(conversationId);
  
  // Pad or truncate to 32 bytes
  const bytes32 = new Uint8Array(32);
  const length = Math.min(data.length, 32);
  bytes32.set(data.slice(0, length));
  
  // Convert to hex string
  const hex = Array.from(bytes32)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return `0x${hex}` as `0x${string}`;
}

// Enhanced blockchain state polling for better synchronization
export async function waitForEscrowStateChange(
  escrowId: bigint, 
  expectedState: EscrowState, 
  maxAttempts: number = 10,
  delayMs: number = 2000
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const escrow = await getEscrow(escrowId);
      if (escrow && escrow.state === expectedState) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
    }
  }
  return false;
}

// ENHANCED: Create escrow (no restriction check needed for multiple escrows)
export async function createEscrow(params: {
  seller: Address;
  buyer: Address;
  nftContract: Address;
  tokenId: bigint;
  priceEth: string;
  durationHours: number;
  conversationId: string;
  ipfsMetadata?: string;
}): Promise<{ hash: `0x${string}`; escrowId?: bigint }> {
  try {
    const price = parsePrice(params.priceEth);
    const duration = BigInt(params.durationHours * 3600); // Convert to seconds
    const xmtpConversationId = conversationIdToBytes32(params.conversationId);

    const hash = await writeContract(config, {
      address: NFT_ESCROW_CONTRACT_ADDRESS,
      abi: NFT_ESCROW_ABI,
      functionName: 'createEscrow',
      args: [
        params.seller,
        params.buyer,
        params.nftContract,
        params.tokenId,
        price,
        duration,
        xmtpConversationId,
        params.ipfsMetadata || ''
      ]
    });

    return { hash };
  } catch (error) {
    console.error('Error creating escrow:', error);
    throw error;
  }
}

export async function depositPayment(escrowId: bigint, priceEth: string): Promise<`0x${string}`> {
  
  return await writeContract(config, {
    address: NFT_ESCROW_CONTRACT_ADDRESS,
    abi: NFT_ESCROW_ABI,
    functionName: 'depositPayment',
    args: [escrowId],
    value: parsePrice(priceEth)
  });
}

// Enhanced NFT deposit with better error handling
export async function depositNFT(escrowId: bigint, nftContract: Address, tokenId: bigint): Promise<`0x${string}`> {
  // First, approve the NFT for the escrow contract
  const approveAbi = [
    {
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'tokenId', type: 'uint256' }
      ],
      name: 'approve',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    }
  ] as const;

  // Approve NFT transfer
  const approveHash = await writeContract(config, {
    address: nftContract,
    abi: approveAbi,
    functionName: 'approve',
    args: [NFT_ESCROW_CONTRACT_ADDRESS, tokenId]
  });

  // Wait for approval
  await waitForTransactionReceipt(config, { hash: approveHash });

  // Now deposit the NFT
  return await writeContract(config, {
    address: NFT_ESCROW_CONTRACT_ADDRESS,
    abi: NFT_ESCROW_ABI,
    functionName: 'depositNFT',
    args: [escrowId]
  });
}

export async function completeEscrow(escrowId: bigint): Promise<`0x${string}`> {
  
  return await writeContract(config, {
    address: NFT_ESCROW_CONTRACT_ADDRESS,
    abi: NFT_ESCROW_ABI,
    functionName: 'completeEscrow',
    args: [escrowId]
  });
}

export async function cancelEscrow(escrowId: bigint, reason: string): Promise<`0x${string}`> {
  
  return await writeContract(config, {
    address: NFT_ESCROW_CONTRACT_ADDRESS,
    abi: NFT_ESCROW_ABI,
    functionName: 'cancelEscrow',
    args: [escrowId, reason]
  });
}

export async function raiseDispute(escrowId: bigint, reason: string): Promise<`0x${string}`> {
  
  return await writeContract(config, {
    address: NFT_ESCROW_CONTRACT_ADDRESS,
    abi: NFT_ESCROW_ABI,
    functionName: 'raiseDispute',
    args: [escrowId, reason],
    value: parseEther('0.01') // Dispute fee
  });
}

export async function cancelExpiredEscrow(escrowId: bigint): Promise<`0x${string}`> {
  
  return await writeContract(config, {
    address: NFT_ESCROW_CONTRACT_ADDRESS,
    abi: NFT_ESCROW_ABI,
    functionName: 'cancelExpiredEscrow',
    args: [escrowId]
  });
}

// Read functions
export async function getEscrow(escrowId: bigint): Promise<Escrow | null> {
  
  try {
    const result = await readContract(config, {
      address: NFT_ESCROW_CONTRACT_ADDRESS,
      abi: NFT_ESCROW_ABI,
      functionName: 'getEscrow',
      args: [escrowId]
    }) as any;

    return {
      id: result.id,
      seller: result.seller,
      buyer: result.buyer,
      nftContract: result.nftContract,
      tokenId: result.tokenId,
      price: result.price,
      deadline: result.deadline,
      state: result.state,
      createdAt: result.createdAt,
      disputeDeadline: result.disputeDeadline,
      ipfsMetadata: result.ipfsMetadata,
      sellerAgreed: result.sellerAgreed,
      buyerAgreed: result.buyerAgreed,
      xmtpConversationId: result.xmtpConversationId
    };
  } catch (error) {
    console.error('Error fetching escrow:', error);
    return null;
  }
}

export async function getUserEscrows(userAddress: Address): Promise<bigint[]> {
  
  try {
    const result = await readContract(config, {
      address: NFT_ESCROW_CONTRACT_ADDRESS,
      abi: NFT_ESCROW_ABI,
      functionName: 'getUserEscrows',
      args: [userAddress]
    }) as bigint[];

    return result;
  } catch (error) {
    console.error('Error fetching user escrows:', error);
    return [];
  }
}

// NEW: Get all escrows for a conversation
export async function getConversationEscrows(conversationId: string): Promise<bigint[]> {
  
  try {
    const xmtpConversationId = conversationIdToBytes32(conversationId);
    const result = await readContract(config, {
      address: NFT_ESCROW_CONTRACT_ADDRESS,
      abi: NFT_ESCROW_ABI,
      functionName: 'getConversationEscrows',
      args: [xmtpConversationId]
    }) as bigint[];

    return result;
  } catch (error) {
    console.error('Error fetching conversation escrows:', error);
    return [];
  }
}

// ENHANCED: Get detailed escrows for conversation
export async function getConversationEscrowDetails(conversationId: string): Promise<Escrow[]> {
  try {
    const escrowIds = await getConversationEscrows(conversationId);
    const escrows: Escrow[] = [];
    
    await Promise.all(
      escrowIds.map(async (escrowId) => {
        try {
          const escrow = await getEscrow(escrowId);
          if (escrow) {
            escrows.push(escrow);
          }
        } catch (error) {
          console.error('Error fetching escrow details:', escrowId, error);
        }
      })
    );
    
    // Sort by creation time (newest first)
    return escrows.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  } catch (error) {
    console.error('Error fetching conversation escrow details:', error);
    return [];
  }
}

// Keep for backward compatibility
export async function getEscrowByConversation(conversationId: string): Promise<bigint | null> {
  
  try {
    const escrowIds = await getConversationEscrows(conversationId);
    return escrowIds.length > 0 ? escrowIds[escrowIds.length - 1] : null; // Return latest
  } catch (error) {
    console.error('Error fetching escrow by conversation:', error);
    return null;
  }
}

// Enhanced action checking with better expired logic
export function canUserFundEscrow(escrow: Escrow, userAddress: Address): boolean {
  return escrow.state === EscrowState.CREATED && 
         escrow.buyer.toLowerCase() === userAddress.toLowerCase() &&
         !isEscrowExpired(escrow);
}

export function canUserDepositNFT(escrow: Escrow, userAddress: Address): boolean {
  return (escrow.state === EscrowState.CREATED || escrow.state === EscrowState.FUNDED) && 
         escrow.seller.toLowerCase() === userAddress.toLowerCase() &&
         !isEscrowExpired(escrow);
}

export function canUserCompleteEscrow(escrow: Escrow, userAddress: Address): boolean {
  return escrow.state === EscrowState.ACTIVE && 
         (escrow.buyer.toLowerCase() === userAddress.toLowerCase() || 
          escrow.seller.toLowerCase() === userAddress.toLowerCase());
}

export function canUserCancelEscrow(escrow: Escrow, userAddress: Address): boolean {
  const isParty = escrow.buyer.toLowerCase() === userAddress.toLowerCase() || 
                  escrow.seller.toLowerCase() === userAddress.toLowerCase();
  
  // Cannot cancel if already completed, cancelled, or disputed
  if (escrow.state === EscrowState.COMPLETED || 
      escrow.state === EscrowState.CANCELLED || 
      escrow.state === EscrowState.DISPUTED) {
    return false;
  }
  
  // Can cancel if user is a party and escrow is in an incomplete state
  // (we already checked it's not completed/cancelled/disputed above)
  return isParty;
}

export function canUserRaiseDispute(escrow: Escrow, userAddress: Address): boolean {
  return (escrow.state === EscrowState.ACTIVE || 
          escrow.state === EscrowState.FUNDED ||
          escrow.state === EscrowState.NFT_DEPOSITED) &&
         (escrow.buyer.toLowerCase() === userAddress.toLowerCase() || 
          escrow.seller.toLowerCase() === userAddress.toLowerCase()) &&
         !isEscrowExpired(escrow);
}

// Check if escrow is expired
export function isEscrowExpired(escrow: Escrow): boolean {
  return Date.now() / 1000 > Number(escrow.deadline);
}

// ENHANCED: Get next required action for user with better expired handling
export function getNextAction(escrow: Escrow, userAddress: Address): string {
  const isExpired = isEscrowExpired(escrow);
  const userIsBuyer = escrow.buyer.toLowerCase() === userAddress.toLowerCase();
  const userIsSeller = escrow.seller.toLowerCase() === userAddress.toLowerCase();
  
  // Handle completed/final states first
  switch (escrow.state) {
    case EscrowState.COMPLETED:
      return 'Escrow completed successfully';
    case EscrowState.CANCELLED:
      return 'Escrow was cancelled';
    case EscrowState.DISPUTED:
      if (isExpired) {
        return 'Dispute expired - can be auto-resolved';
      }
      return 'Escrow is under dispute - awaiting resolution';
  }
  
  // Handle expired escrows for incomplete states
  if (isExpired) {
    return 'Escrow expired - funds can be refunded';
  }
  
  // Handle active states
  switch (escrow.state) {
    case EscrowState.CREATED:
      if (userIsBuyer) {
        return 'Deposit payment to continue';
      } else if (userIsSeller) {
        return 'Waiting for buyer to deposit payment';
      }
      break;
    case EscrowState.FUNDED:
      if (userIsSeller) {
        return 'Deposit your NFT to activate escrow';
      } else {
        return 'Waiting for seller to deposit NFT';
      }
      break;
    case EscrowState.NFT_DEPOSITED:
      if (userIsBuyer) {
        return 'Deposit payment to activate escrow';
      } else {
        return 'Waiting for buyer to deposit payment';
      }
      break;
    case EscrowState.ACTIVE:
      if (userIsBuyer) {
        return 'Complete escrow to receive NFT';
      } else {
        return 'Waiting for buyer to complete or auto-complete';
      }
      break;
  }
  
  return 'No action required';
}