import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { type Address } from 'viem';
import { 
  getEscrow,
  getConversationEscrows,
  formatPrice,
  getEscrowStateLabel,
  getEscrowStateColor,
  getNextAction,
  canUserFundEscrow,
  canUserDepositNFT,
  canUserCompleteEscrow,
  canUserCancelEscrow,
  canUserRaiseDispute,
  isEscrowExpired,
  type Escrow,
  EscrowState
} from '../utils/escrow';

interface EscrowStatusProps {
  escrowId: bigint;
  conversationId: string;
  onManageClick?: () => void;
  compact?: boolean;
  autoRefresh?: boolean; // Enable automatic state refresh
}

export default function EscrowStatus({ 
  escrowId, 
  conversationId, 
  onManageClick,
  compact = false,
  autoRefresh = true
}: EscrowStatusProps) {
  const { address } = useAccount();
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [escrowNumber, setEscrowNumber] = useState<number>(1);

  useEffect(() => {
    loadEscrowData();
    loadEscrowNumber();
    
    // Set up auto-refresh if enabled
    let refreshInterval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      refreshInterval = setInterval(() => {
        loadEscrowData();
      }, 5000); // Refresh every 5 seconds
    }
    
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [escrowId, conversationId, autoRefresh]);

  const loadEscrowData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const escrowData = await getEscrow(escrowId);
      if (escrowData) {
        setEscrow(escrowData);
      } else {
        setError('Escrow not found');
      }
    } catch (err) {
      console.error('Error loading escrow:', err);
      setError('Failed to load escrow');
    } finally {
      setIsLoading(false);
    }
  };

  const loadEscrowNumber = async () => {
    try {
      // Get all escrows for this conversation to determine the number
      const conversationEscrowIds = await getConversationEscrows(conversationId);
      const sortedEscrows = conversationEscrowIds.sort((a, b) => Number(a) - Number(b));
      const index = sortedEscrows.findIndex(id => id === escrowId);
      setEscrowNumber(index >= 0 ? index + 1 : 1);
    } catch (error) {
      console.error('Error loading escrow number:', error);
      setEscrowNumber(1);
    }
  };

  const getStateIcon = (state: EscrowState): string => {
    switch (state) {
      case EscrowState.CREATED: return '📝';
      case EscrowState.FUNDED: return '💰';
      case EscrowState.NFT_DEPOSITED: return '🖼️';
      case EscrowState.ACTIVE: return '🔄';
      case EscrowState.COMPLETED: return '✅';
      case EscrowState.CANCELLED: return '❌';
      case EscrowState.DISPUTED: return '⚠️';
      default: return '❓';
    }
  };

  const getUserRole = (escrow: Escrow, userAddress: Address): 'seller' | 'buyer' | null => {
    if (escrow.seller.toLowerCase() === userAddress.toLowerCase()) return 'seller';
    if (escrow.buyer.toLowerCase() === userAddress.toLowerCase()) return 'buyer';
    return null;
  };

  const hasAvailableActions = (escrow: Escrow, userAddress: Address): boolean => {
    return canUserFundEscrow(escrow, userAddress) ||
           canUserDepositNFT(escrow, userAddress) ||
           canUserCompleteEscrow(escrow, userAddress) ||
           canUserCancelEscrow(escrow, userAddress) ||
           canUserRaiseDispute(escrow, userAddress);
  };

  if (isLoading) {
    return (
      <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span className="text-gray-400 text-sm">Loading escrow...</span>
        </div>
      </div>
    );
  }

  if (error || !escrow) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
        <div className="flex items-center space-x-2">
          <span className="text-red-400">❌</span>
          <span className="text-red-300 text-sm">{error || 'Escrow not found'}</span>
        </div>
      </div>
    );
  }

  const userRole = address ? getUserRole(escrow, address) : null;
  const expired = isEscrowExpired(escrow);

  if (compact) {
    return (
      <div className="bg-gray-700/50 rounded-lg p-2 border border-gray-600 max-w-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{getStateIcon(escrow.state)}</span>
            <div>
              <div className="flex items-center space-x-1">
                <span className="text-white text-sm font-medium">Escrow #{escrowNumber}</span>
                <span className={`text-xs px-1 py-0.5 rounded ${getEscrowStateColor(escrow.state)}`}>
                  {getEscrowStateLabel(escrow.state)}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                {formatPrice(escrow.price)} MON
                {expired && <span className="text-red-400 ml-1">• Expired</span>}
              </div>
            </div>
          </div>
          {onManageClick && (
            <button
              onClick={onManageClick}
              className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded border border-blue-500/30 hover:border-blue-400/50 transition-colors"
            >
              Manage
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/80 rounded-lg border border-gray-600 overflow-hidden max-w-md">
      {/* Header */}
      <div className="bg-gray-700/50 px-4 py-2 border-b border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{getStateIcon(escrow.state)}</span>
            <div>
              <h3 className="text-white font-medium">Escrow #{escrowNumber}</h3>
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEscrowStateColor(escrow.state)}`}>
                  {getEscrowStateLabel(escrow.state)}
                </span>
                {expired && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/30 text-red-400 border border-red-500/30">
                    Expired
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* NFT Info */}
        <div className="bg-gray-700/30 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">NFT Details</span>
            <span className="text-white font-mono text-sm">
              #{escrow.tokenId.toString()}
            </span>
          </div>
          <div className="text-xs text-gray-500 font-mono break-all">
            {escrow.nftContract}
          </div>
        </div>

        {/* Price & Parties */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-700/30 rounded-lg p-3">
            <div className="text-gray-400 text-xs mb-1">Price</div>
            <div className="text-white font-semibold">{formatPrice(escrow.price)} MON</div>
          </div>
          <div className="bg-gray-700/30 rounded-lg p-3">
            <div className="text-gray-400 text-xs mb-1">Deadline</div>
            <div className="text-white text-sm">
              {new Date(Number(escrow.deadline) * 1000).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* User Role & Action */}
        {address && userRole && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-300 text-sm font-medium">
                You are the {userRole}
              </span>
              {hasAvailableActions(escrow, address) && (
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              )}
            </div>
            <div className="text-blue-200 text-xs">
              {getNextAction(escrow, address)}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {address && userRole && hasAvailableActions(escrow, address) && onManageClick && (
          <button
            onClick={onManageClick}
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
          >
            Take Action
          </button>
        )}

        {/* Parties Info */}
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Seller:</span>
            <span className="font-mono">{escrow.seller.slice(0, 6)}...{escrow.seller.slice(-4)}</span>
          </div>
          <div className="flex justify-between">
            <span>Buyer:</span>
            <span className="font-mono">{escrow.buyer.slice(0, 6)}...{escrow.buyer.slice(-4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

