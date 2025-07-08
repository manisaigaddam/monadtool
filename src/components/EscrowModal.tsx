import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { config } from '../utils/wagmiConfig';
import { type Address } from 'viem';
import { 
  createEscrow, 
  getEscrow, 
  depositPayment, 
  depositNFT, 
  completeEscrow, 
  cancelEscrow, 
  raiseDispute, 
  cancelExpiredEscrow,
  waitForEscrowStateChange,
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
  EscrowState,
  getConversationEscrows
} from '../utils/escrow';
import { useToast } from './Toast';

interface EscrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'manage';
  conversationId: string;
  peerAddress?: string;
  escrowId?: bigint;
  onEscrowCreated?: (escrowId: bigint) => void;
  onEscrowUpdated?: () => void;
}

export default function EscrowModal({
  isOpen,
  onClose,
  mode,
  conversationId,
  peerAddress,
  escrowId,
  onEscrowCreated,
  onEscrowUpdated
}: EscrowModalProps) {
  const { address } = useAccount();
  const { addToast } = useToast();

  // Form state
  const [nftContract, setNftContract] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [price, setPrice] = useState('');
  const [durationHours, setDurationHours] = useState('24');
  const [role, setRole] = useState<'seller' | 'buyer'>('seller');
  
  // Escrow state
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Action state
  const [cancelReason, setCancelReason] = useState('');
  const [disputeReason, setDisputeReason] = useState('');

  const [allEscrows, setAllEscrows] = useState<Escrow[]>([]);
  const [currentEscrowIndex, setCurrentEscrowIndex] = useState(0);
  const [showAllEscrows, setShowAllEscrows] = useState(false);

  useEffect(() => {
    if (isOpen && mode === 'manage' && escrowId) {
      loadEscrowData();
    }
  }, [isOpen, mode, escrowId]);

  useEffect(() => {
    if (isOpen && mode === 'manage' && conversationId) {
      loadAllConversationEscrows();
    }
  }, [isOpen, mode, conversationId]);

  const loadEscrowData = async () => {
    if (!escrowId) return;
    
    setIsLoading(true);
    try {
      const escrowData = await getEscrow(escrowId);
      setEscrow(escrowData);
    } catch (error) {
      console.error('Error loading escrow:', error);
      addToast('Failed to load escrow data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllConversationEscrows = async () => {
    try {
      const escrowIds = await getConversationEscrows(conversationId);
      if (escrowIds.length > 0) {
        const escrowsData = await Promise.all(
          escrowIds.map(async (id) => {
            const escrowData = await getEscrow(id);
            return escrowData;
          })
        );
        
        const validEscrows = escrowsData.filter(Boolean) as Escrow[];
        const sortedEscrows = validEscrows.sort((a, b) => Number(a.id) - Number(b.id));
        setAllEscrows(sortedEscrows);
        
        // Set current escrow index if a specific escrow is selected
        if (escrowId) {
          const index = sortedEscrows.findIndex(e => e.id === escrowId);
          setCurrentEscrowIndex(index >= 0 ? index : 0);
          setEscrow(sortedEscrows[index >= 0 ? index : 0]);
        } else if (sortedEscrows.length > 0) {
          setCurrentEscrowIndex(0);
          setEscrow(sortedEscrows[0]);
        }
      }
    } catch (error) {
      console.error('Error loading conversation escrows:', error);
    }
  };

  // ENHANCED: Better transaction waiting with state polling
  const waitAndRefresh = async (hash: `0x${string}`, expectedState?: EscrowState) => {
    try {
      // Wait for transaction confirmation silently
      await waitForTransactionReceipt(config, { hash });
      
      if (expectedState && escrowId) {
        // Wait for blockchain state to update to expected state
        const stateUpdated = await waitForEscrowStateChange(escrowId, expectedState, 15, 3000);
        
        if (!stateUpdated) {
          addToast('Transaction completed but state may still be updating. Please refresh manually.', 'warning');
        }
      } else {
        // Add a delay for state propagation
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Refresh escrow data
      await loadEscrowData();
      onEscrowUpdated?.();
    } catch (error) {
      console.error('Error waiting for transaction:', error);
      addToast('Transaction may still be pending. Please refresh manually.', 'warning');
    }
  };

  const resetForm = () => {
    setNftContract('');
    setTokenId('');
    setPrice('');
    setDurationHours('24');
    setRole('seller');
    setDisputeReason('');
    setCancelReason('');
  };

  const handleCreateEscrow = async () => {
    if (!address || !peerAddress) {
      addToast('Wallet not connected or peer address missing', 'error');
      return;
    }

    if (!nftContract || !tokenId || !price) {
      addToast('Please fill in all required fields', 'error');
      return;
    }

    setIsLoading(true);
    try {
      // REMOVED: No longer checking for existing escrows (multiple escrows allowed)
      
      const seller = role === 'seller' ? address : peerAddress;
      const buyer = role === 'buyer' ? address : peerAddress;

      addToast('Creating escrow...', 'info');
      const result = await createEscrow({
        seller: seller as Address,
        buyer: buyer as Address,
        nftContract: nftContract as Address,
        tokenId: BigInt(tokenId),
        priceEth: price,
        durationHours: parseInt(durationHours),
        conversationId,
        ipfsMetadata: ''
      });
      
      // Wait for transaction and get escrow ID from receipt
      const receipt = await waitForTransactionReceipt(config, { hash: result.hash });
      addToast('Escrow created successfully!', 'success');
      
      // Extract escrow ID from EscrowCreated event
      let newEscrowId: bigint | undefined;
      try {
        const escrowCreatedLog = receipt.logs.find((log: any) => 
          log.address.toLowerCase() === '0x7F2118B1f6461A96AB317A3537a294569C83e87D'.toLowerCase() &&
          log.topics[0] === '0x...' // EscrowCreated event signature (you'll need to add this)
        );
        
        if (escrowCreatedLog && escrowCreatedLog.topics.length > 1) {
          newEscrowId = BigInt(escrowCreatedLog.topics[1] || '0');
        }
      } catch (error) {
        console.error('Error extracting escrow ID:', error);
      }
      
      if (newEscrowId && onEscrowCreated) {
        onEscrowCreated(newEscrowId);
      }
      
      resetForm();
      onClose();
    } catch (error: any) {
      console.error('Error creating escrow:', error);
      addToast(error.message || 'Failed to create escrow', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDepositPayment = async () => {
    if (!escrow || !address) return;

    setIsLoading(true);
    try {
      addToast('Depositing payment...', 'info');
      const hash = await depositPayment(escrow.id, formatPrice(escrow.price));
      await waitAndRefresh(hash, EscrowState.FUNDED);
      addToast('Payment deposited successfully!', 'success');
    } catch (error: any) {
      console.error('Error depositing payment:', error);
      if (error.message.includes('User rejected')) {
        addToast('Transaction cancelled by user', 'warning');
      } else {
        addToast(error.message || 'Failed to deposit payment', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDepositNFT = async () => {
    if (!escrow || !address) return;

    setIsLoading(true);
    try {
      addToast('Approving and depositing NFT...', 'info');
      const hash = await depositNFT(escrow.id, escrow.nftContract, escrow.tokenId);
      await waitAndRefresh(hash, EscrowState.NFT_DEPOSITED);
      addToast('NFT deposited successfully!', 'success');
    } catch (error: any) {
      console.error('Error depositing NFT:', error);
      if (error.message.includes('User rejected')) {
        addToast('Transaction cancelled by user', 'warning');
      } else if (error.message.includes('insufficient')) {
        addToast('Insufficient gas or funds for transaction', 'error');
      } else if (error.message.includes('not approved')) {
        addToast('NFT approval failed. Please try again.', 'error');
      } else {
        addToast(error.message || 'Failed to deposit NFT', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteEscrow = async () => {
    if (!escrow || !address) return;

    setIsLoading(true);
    try {
      addToast('Completing escrow...', 'info');
      const hash = await completeEscrow(escrow.id);
      await waitAndRefresh(hash, EscrowState.COMPLETED);
      addToast('Escrow completed successfully!', 'success');
    } catch (error: any) {
      console.error('Error completing escrow:', error);
      if (error.message.includes('User rejected')) {
        addToast('Transaction cancelled by user', 'warning');
      } else {
        addToast(error.message || 'Failed to complete escrow', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEscrow = async () => {
    if (!escrow || !address || !cancelReason) return;

    setIsLoading(true);
    try {
      addToast('Cancelling escrow...', 'info');
      const hash = await cancelEscrow(escrow.id, cancelReason);
      await waitAndRefresh(hash, EscrowState.CANCELLED);
      addToast('Escrow cancelled successfully!', 'success');
      setCancelReason('');
    } catch (error: any) {
      console.error('Error cancelling escrow:', error);
      if (error.message.includes('User rejected')) {
        addToast('Transaction cancelled by user', 'warning');
      } else {
        addToast(error.message || 'Failed to cancel escrow', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRaiseDispute = async () => {
    if (!escrow || !address || !disputeReason) return;

    setIsLoading(true);
    try {
      addToast('Raising dispute...', 'info');
      const hash = await raiseDispute(escrow.id, disputeReason);
      await waitAndRefresh(hash, EscrowState.DISPUTED);
      addToast('Dispute raised successfully! Fee: 0.01 MON', 'success');
      setDisputeReason('');
    } catch (error: any) {
      console.error('Error raising dispute:', error);
      if (error.message.includes('User rejected')) {
        addToast('Transaction cancelled by user', 'warning');
      } else if (error.message.includes('Insufficient dispute fee')) {
        addToast('Insufficient funds for dispute fee (0.01 MON required)', 'error');
      } else {
        addToast(error.message || 'Failed to raise dispute', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelExpiredEscrow = async () => {
    if (!escrow || !address) return;

    setIsLoading(true);
    try {
      addToast('Cancelling expired escrow...', 'info');
      const hash = await cancelExpiredEscrow(escrow.id);
      await waitAndRefresh(hash, EscrowState.CANCELLED);
      addToast('Expired escrow cancelled successfully!', 'success');
    } catch (error: any) {
      console.error('Error cancelling expired escrow:', error);
      if (error.message.includes('User rejected')) {
        addToast('Transaction cancelled by user', 'warning');
      } else {
        addToast(error.message || 'Failed to cancel expired escrow', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEscrowNavigation = (direction: 'prev' | 'next') => {
    if (allEscrows.length <= 1) return;
    
    let newIndex;
    if (direction === 'prev') {
      newIndex = currentEscrowIndex > 0 ? currentEscrowIndex - 1 : allEscrows.length - 1;
    } else {
      newIndex = currentEscrowIndex < allEscrows.length - 1 ? currentEscrowIndex + 1 : 0;
    }
    
    setCurrentEscrowIndex(newIndex);
    setEscrow(allEscrows[newIndex]);
  };

  const handleSelectEscrow = (index: number) => {
    setCurrentEscrowIndex(index);
    setEscrow(allEscrows[index]);
    setShowAllEscrows(false);
  };

  if (!isOpen) return null;

  const renderHeader = () => {
    if (mode === 'create') {
      return (
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Create NFT Escrow</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      );
    }

    // Manage mode header with navigation
    return (
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <h2 className="text-lg font-semibold text-white">
            {allEscrows.length > 1 ? `Escrow #${currentEscrowIndex + 1}` : 'Manage Escrow'}
          </h2>
          
          {/* Navigation controls for multiple escrows */}
          {allEscrows.length > 1 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleEscrowNavigation('prev')}
                className="btn-secondary px-2 py-1 text-xs"
                title="Previous escrow"
              >
                ←
              </button>
              <span className="text-xs text-slate-400">
                {currentEscrowIndex + 1} of {allEscrows.length}
              </span>
              <button
                onClick={() => handleEscrowNavigation('next')}
                className="btn-secondary px-2 py-1 text-xs"
                title="Next escrow"
              >
                →
              </button>
              <button
                onClick={() => setShowAllEscrows(!showAllEscrows)}
                className="text-xs text-blue-400 hover:text-blue-300 ml-2"
              >
                {showAllEscrows ? 'Hide List' : 'Show All'}
              </button>
            </div>
          )}
        </div>
        
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white"
        >
          ✕
        </button>
      </div>
    );
  };

  const renderAllEscrowsList = () => {
    if (!showAllEscrows || allEscrows.length <= 1) return null;

    return (
      <div className="mb-6 bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-medium mb-3">All Escrows in Conversation</h3>
        <div className="space-y-2">
          {allEscrows.map((escrowItem, index) => (
            <button
              key={escrowItem.id.toString()}
              onClick={() => handleSelectEscrow(index)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                index === currentEscrowIndex
                  ? 'bg-blue-900/30 border-blue-500/50 text-white'
                  : 'bg-gray-800/50 border-gray-600 text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">Escrow #{index + 1}</div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getEscrowStateColor(escrowItem.state)}`}>
                  {getEscrowStateLabel(escrowItem.state)}
                </span>
              </div>
              <div className="text-sm text-gray-400">
                {formatPrice(escrowItem.price)} MON • NFT #{escrowItem.tokenId.toString()}
              </div>
              <div className="text-xs text-gray-500">
                ID: {escrowItem.id.toString()}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Create Escrow Form Component
  const CreateEscrowForm = () => (
    <div className="space-y-4">
      {/* Role Selection */}
      <div>
        <label className="block text-slate-300 text-sm font-medium mb-2">Your Role</label>
        <div className="flex space-x-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="role"
              value="seller"
              checked={role === 'seller'}
              onChange={(e) => setRole(e.target.value as 'seller' | 'buyer')}
              className="mr-2"
            />
            <span className="text-white text-sm">I'm selling the NFT</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="role"
              value="buyer"
              checked={role === 'buyer'}
              onChange={(e) => setRole(e.target.value as 'seller' | 'buyer')}
              className="mr-2"
            />
            <span className="text-white text-sm">I'm buying the NFT</span>
          </label>
        </div>
      </div>

      {/* NFT Details */}
      <div>
        <label className="block text-slate-300 text-sm font-medium mb-2">NFT Contract Address</label>
        <input
          type="text"
          value={nftContract}
          onChange={(e) => setNftContract(e.target.value)}
          placeholder="0x..."
          className="input-primary w-full"
        />
      </div>

      <div>
        <label className="block text-slate-300 text-sm font-medium mb-2">Token ID</label>
        <input
          type="text"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          placeholder="123"
          className="input-primary w-full"
        />
      </div>

      <div>
        <label className="block text-slate-300 text-sm font-medium mb-2">Price (MON)</label>
        <input
          type="text"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0.1"
          className="input-primary w-full"
        />
      </div>

      <div>
        <label className="block text-slate-300 text-sm font-medium mb-2">Duration (Hours)</label>
        <select
          value={durationHours}
          onChange={(e) => setDurationHours(e.target.value)}
          className="input-primary w-full"
        >
          <option value="1">1 Hour</option>
          <option value="6">6 Hours</option>
          <option value="12">12 Hours</option>
          <option value="24">24 Hours</option>
          <option value="72">3 Days</option>
          <option value="168">1 Week</option>
        </select>
      </div>

      <div className="flex space-x-2 pt-3">
        <button
          onClick={handleCreateEscrow}
          disabled={isLoading || !nftContract || !tokenId || !price}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm transition-colors"
        >
          {isLoading ? 'Creating...' : 'Create Escrow'}
        </button>
        <button
          onClick={onClose}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // Manage Escrow View Component
  const ManageEscrowView = () => {
    if (!escrow || !address) return null;

    const userRole = escrow.seller.toLowerCase() === address.toLowerCase() ? 'seller' : 
                     escrow.buyer.toLowerCase() === address.toLowerCase() ? 'buyer' : null;
    const expired = isEscrowExpired(escrow);

    return (
      <div className="space-y-6">
        {/* Escrow Info */}
        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-gray-400 text-sm">NFT</div>
              <div className="text-white font-mono text-sm">
                {escrow.nftContract.slice(0, 6)}...{escrow.nftContract.slice(-4)}
              </div>
              <div className="text-gray-400 text-xs">#{escrow.tokenId.toString()}</div>
              <a
                href={`https://magiceden.io/item-details/monad-testnet/${escrow.nftContract}/${escrow.tokenId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-blue-400 hover:text-blue-300 transition-colors text-xs mt-1"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Magic Eden
              </a>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Price</div>
              <div className="text-white font-semibold">{formatPrice(escrow.price)} MON</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-gray-400 text-sm">Seller</div>
              <div className="text-white font-mono text-sm">
                {escrow.seller.slice(0, 6)}...{escrow.seller.slice(-4)}
                {userRole === 'seller' && <span className="text-green-400 ml-1">(You)</span>}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Buyer</div>
              <div className="text-white font-mono text-sm">
                {escrow.buyer.slice(0, 6)}...{escrow.buyer.slice(-4)}
                {userRole === 'buyer' && <span className="text-blue-400 ml-1">(You)</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-gray-400 text-sm">Status</div>
              <div className={`font-medium ${getEscrowStateColor(escrow.state)}`}>
                {getEscrowStateLabel(escrow.state)}
                {expired && <span className="text-red-400 ml-1">• Expired</span>}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Deadline</div>
              <div className="text-white text-sm">
                {new Date(Number(escrow.deadline) * 1000).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Next Action */}
        {userRole && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <div className="text-blue-300 font-medium mb-2">Your Next Action</div>
            <div className="text-blue-200 text-sm mb-3">
              {getNextAction(escrow, address)}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {userRole && (
          <div className="space-y-3">
            {canUserFundEscrow(escrow, address) && (
              <button
                onClick={handleDepositPayment}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                {isLoading ? 'Processing...' : `Deposit ${formatPrice(escrow.price)} MON`}
              </button>
            )}

            {canUserDepositNFT(escrow, address) && (
              <button
                onClick={handleDepositNFT}
                disabled={isLoading}
                className="w-full btn-primary disabled:bg-gray-600 px-4 py-2 font-medium"
              >
                {isLoading ? 'Processing...' : 'Deposit NFT'}
              </button>
            )}

            {canUserCompleteEscrow(escrow, address) && (
              <button
                onClick={handleCompleteEscrow}
                disabled={isLoading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                {isLoading ? 'Processing...' : 'Complete Trade'}
              </button>
            )}

            {canUserCancelEscrow(escrow, address) && (
              <div className="space-y-2">
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason for cancellation (optional)"
                  rows={2}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500"
                />
                <button
                  onClick={handleCancelEscrow}
                  disabled={isLoading}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  {isLoading ? 'Processing...' : 'Cancel Escrow'}
                </button>
              </div>
            )}

            {canUserRaiseDispute(escrow, address) && (
              <div className="space-y-2">
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Describe the issue (required)"
                  rows={3}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-yellow-500"
                />
                <button
                  onClick={handleRaiseDispute}
                  disabled={isLoading || !disputeReason.trim()}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  {isLoading ? 'Processing...' : 'Raise Dispute (0.01 MON fee)'}
                </button>
              </div>
            )}

            {expired && escrow.state !== EscrowState.CANCELLED && escrow.state !== EscrowState.COMPLETED && (
              <button
                onClick={handleCancelExpiredEscrow}
                disabled={isLoading}
                className="w-full bg-gray-600 hover:bg-gray-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                {isLoading ? 'Processing...' : 'Cancel Expired Escrow'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="card-primary w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4">
          {renderHeader()}
          
          {mode === 'manage' && renderAllEscrowsList()}
          
          {mode === 'create' ? (
            <div className="mt-4">
              <CreateEscrowForm />
            </div>
          ) : escrow ? (
            <div className="mt-4">
              <ManageEscrowView />
            </div>
          ) : (
            <div className="text-center text-slate-400 py-6">
              {isLoading ? 'Loading escrow...' : 'Escrow not found'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}