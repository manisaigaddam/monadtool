import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { NFT, fetchNFTOwner, extractNFTTraits } from '../utils/api';
import { useAccount } from 'wagmi';
import { checkCanMessage } from '../utils/xmtp';

interface NFTModalProps {
  nft: NFT;
  contractAddress: string;
  onClose: () => void;
  onOpenChat?: (ownerAddress: string) => void;
}

export default function NFTModal({ nft, contractAddress, onClose, onOpenChat }: NFTModalProps) {
  const { address: userAddress } = useAccount();
  const [owner, setOwner] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [canMessageOwner, setCanMessageOwner] = useState<boolean | null>(null);
  const [isCheckingXMTP, setIsCheckingXMTP] = useState(false);
  
  // Get the best available image URL
  const getImageUrl = () => {
    if (imageError) {
      return '/images/placeholder.png';
    }
    
    // Try multiple possible image paths in metadata
    const imageSources = [
      nft.image?.originalUrl,
      nft.image?.cachedUrl,
      nft.image?.pngUrl,
      nft.image?.thumbnailUrl,
      nft.raw?.metadata?.image,
      // Some collections use different metadata formats
      typeof nft.raw?.metadata === 'object' ? nft.raw?.metadata?.image_url : null,
      typeof nft.raw?.metadata === 'object' ? nft.raw?.metadata?.imageUrl : null,
      typeof nft.raw?.metadata === 'object' ? nft.raw?.metadata?.image_data : null,
    ];
    
    // Return the first valid image URL or fallback
    for (const src of imageSources) {
      if (src) return src;
    }
    
    return '/images/placeholder.png';
  };
  
  // Extract all traits using the utility function
  const traits = extractNFTTraits(nft);
  
  // Get Magic Eden NFT URL for Monad testnet
  const getMagicEdenUrl = () => {
    return `https://magiceden.io/item-details/monad-testnet/${contractAddress}/${nft.tokenId}`;
  };
  
  // Get Monad Explorer URL for owner
  const getOwnerExplorerUrl = (ownerAddress: string) => {
    return `https://testnet.monadexplorer.com/address/${ownerAddress}`;
  };
  
  // Check if owner can receive XMTP messages
  const checkOwnerXMTP = async (ownerAddress: string) => {
    if (!ownerAddress || ownerAddress === userAddress) {
      setCanMessageOwner(false);
      return;
    }

    setIsCheckingXMTP(true);
    try {
      const identity = {
        identifier: ownerAddress.toLowerCase(),
        identifierKind: "Ethereum" as const,
      };
      
      const canMessageMap = await checkCanMessage([identity]);
      const canMessage = canMessageMap.get(ownerAddress.toLowerCase());
      setCanMessageOwner(canMessage || false);
    } catch (error) {
      console.error('Error checking XMTP availability:', error);
      setCanMessageOwner(false);
    } finally {
      setIsCheckingXMTP(false);
    }
  };

  // Handle chat button click
  const handleChatClick = () => {
    if (owner && onOpenChat) {
      onOpenChat(owner);
      onClose(); // Close modal when opening chat
    }
  };

  // Fetch owner on mount
  useEffect(() => {
    const getOwner = async () => {
      setIsLoading(true);
      setOwnerError(null);
      
      try {
        const response = await fetchNFTOwner(contractAddress, nft.tokenId);
        if (response) {
          setOwner(response);
          // Check XMTP availability for the owner
          await checkOwnerXMTP(response);
        } else {
          setOwnerError('Owner not found');
        }
      } catch (error: any) {
        console.error('Error fetching owner:', error);
        if (error.message?.includes('timeout')) {
          setOwnerError('Request timed out');
        } else if (error.message?.includes('nonexistent token')) {
          setOwnerError('Token does not exist');
        } else {
          setOwnerError('Unable to determine owner');
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    getOwner();
  }, [contractAddress, nft.tokenId, userAddress]);
  
  // Close modal when Escape key is pressed
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);
  
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white p-2 rounded-full bg-slate-800/50 hover:bg-slate-700/60 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="card-primary rounded-2xl overflow-hidden max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
            {/* Image */}
            <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-900/30">
              {isImageLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                </div>
              )}
              <Image
                src={getImageUrl()}
                alt={nft.name || `NFT #${nft.tokenId}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className={`object-contain transition-opacity duration-300 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
                onLoad={() => setIsImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setIsImageLoading(false);
                }}
                priority
              />
            </div>
            
            {/* Details */}
            <div className="flex flex-col">
              <h2 className="text-2xl font-bold text-white">
                {nft.name || `NFT #${nft.tokenId}`}
              </h2>
              
              <p className="text-slate-300 mt-2">
                {nft.description || 'No description available'}
              </p>
              
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Token ID</span>
                  <span className="text-white font-mono">{nft.tokenId}</span>
                </div>
                
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-slate-300">Owner</span>
                  <div className="flex flex-col items-end">
                    {isLoading ? (
                      <div className="flex items-center">
                        <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mr-2"></div>
                        <span className="text-slate-300">Loading...</span>
                      </div>
                    ) : owner ? (
                      <>
                        <a
                          href={getOwnerExplorerUrl(owner)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 font-mono truncate max-w-[200px]"
                        >
                          {owner}
                        </a>
                        {/* Chat Button */}
                        {userAddress && owner !== userAddress && (
                          <div className="mt-1">
                            {isCheckingXMTP ? (
                              <div className="flex items-center text-xs text-slate-400">
                                <div className="w-3 h-3 border border-slate-400 border-t-blue-500 rounded-full animate-spin mr-1"></div>
                                Checking...
                              </div>
                            ) : canMessageOwner === true ? (
                              <button
                                onClick={handleChatClick}
                                className="btn-primary text-xs px-2 py-1 flex items-center"
                              >
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                Chat
                              </button>
                            ) : canMessageOwner === false ? (
                              <span className="text-xs text-slate-500">Not on XMTP</span>
                            ) : null}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-red-400">{ownerError || 'Failed to load'}</span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-slate-300">View on</span>
                  <div className="flex space-x-2">
                    <a
                      href={getMagicEdenUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 transition-colors flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Magic Eden
                    </a>
                  </div>
                </div>
              </div>
              
              {/* Traits */}
              {traits.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-white mb-3">Traits</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {traits.map((trait, index) => (
                      <div 
                        key={`${trait.trait_type}-${index}`}
                        className="bg-slate-800/30 rounded-lg p-2 border border-slate-500/20"
                      >
                        <span className="block text-xs text-slate-300">{trait.trait_type}</span>
                        <span className="block text-sm text-white font-medium break-words">
                          {String(trait.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Raw Metadata Toggle */}
              {nft.raw?.metadata && (
                <div className="mt-6">
                  <details className="text-sm">
                    <summary className="text-slate-300 cursor-pointer hover:text-slate-200 transition-colors">
                      View Raw Metadata
                    </summary>
                    <pre className="mt-2 p-3 bg-slate-900/30 rounded-lg overflow-x-auto text-slate-200 text-xs">
                      {JSON.stringify(nft.raw.metadata, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
} 