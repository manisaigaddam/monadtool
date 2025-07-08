import { useState } from 'react';
import Image from 'next/image';
import { NFT, extractNFTTraits } from '../utils/api';
import NFTModal from './NFTModal';

interface NFTCardProps {
  nft: NFT;
  contractAddress: string;
  onOpenChat?: (ownerAddress: string) => void;
}

export default function NFTCard({ nft, contractAddress, onOpenChat }: NFTCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // Get the best available image URL
  const getImageUrl = () => {
    if (imageError) {
      return '/images/placeholder.png';
    }
    
    // Try multiple possible image paths in metadata
    const imageSources = [
      nft.image?.thumbnailUrl,
      nft.image?.cachedUrl,
      nft.image?.pngUrl,
      nft.image?.originalUrl,
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

  // Extract NFT name or use token ID
  const getNFTName = () => {
    if (nft.name) {
      // If name contains "#", just return the name as is
      if (nft.name.includes('#')) {
        return nft.name;
      }
      // Otherwise add the token ID
      return `${nft.name} #${nft.tokenId}`;
    }
    // Fallback to just token ID
    return `NFT #${nft.tokenId}`;
  };

  // Get Magic Eden NFT URL for Monad testnet
  const getMagicEdenUrl = () => {
    return `https://magiceden.io/item-details/monad-testnet/${contractAddress}/${nft.tokenId}`;
  };

  return (
    <>
      <div className="group relative card-primary overflow-hidden hover:scale-105 hover:shadow-xl transition-all duration-300 ease-out transform hover:-translate-y-1"
      >
        
        <div className="cursor-pointer relative z-10" onClick={() => setIsModalOpen(true)}>
          {/* NFT Image */}
          <div className="relative aspect-square w-full bg-gradient-to-br from-slate-900/50 to-gray-900/50 overflow-hidden">
            {/* Loading state */}
            <div className={`absolute inset-0 flex items-center justify-center ${isImageLoading ? 'block' : 'hidden'}`}>
              <div className="relative">
                <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 w-8 h-8 border-3 border-blue-500/30 border-b-blue-500 rounded-full animate-spin animate-reverse"></div>
              </div>
            </div>
            
            {/* Image */}
            <div className="relative h-full w-full overflow-hidden">
              <Image
                src={getImageUrl()}
                alt={getNFTName()}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className={`object-cover transition-all duration-300 group-hover:scale-110 ${
                  isImageLoading ? 'opacity-0' : 'opacity-100'
                }`}
                onLoad={() => setIsImageLoading(false)}
                onError={() => {
                  setIsImageLoading(false);
                  setImageError(true);
                }}
              />
            </div>
          </div>
          
          {/* NFT Name */}
          <div className="p-4 transition-all duration-300 group-hover:bg-slate-800/50">
            <h3 className="font-semibold text-white text-sm truncate transition-colors duration-300 group-hover:text-slate-100">
              {getNFTName()}
            </h3>
          </div>
        </div>
      </div>
      
      {/* Modal for displaying full NFT details */}
      {isModalOpen && (
        <NFTModal 
          nft={nft} 
          contractAddress={contractAddress} 
          onClose={() => setIsModalOpen(false)}
          onOpenChat={onOpenChat}
        />
      )}
    </>
  );
} 