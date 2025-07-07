import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { NFT, extractNFTTraits } from '../utils/api';
import NFTModal from './NFTModal';

interface NFTCardProps {
  nft: NFT;
  contractAddress: string;
}

export default function NFTCard({ nft, contractAddress }: NFTCardProps) {
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

  // Get Magic Eden NFT URL
  const getMagicEdenUrl = () => {
    return `https://magiceden.io/item-details/monad-testnet/${contractAddress}/${nft.tokenId}`;
  };

  return (
    <>
      <motion.div 
        whileHover={{ 
          scale: 1.03,
          boxShadow: '0 10px 30px -10px rgba(139, 92, 246, 0.3)'
        }}
        transition={{ duration: 0.2 }}
        className="bg-gradient-to-b from-purple-900/40 to-purple-800/20 rounded-lg overflow-hidden border border-purple-500/30 backdrop-blur-sm"
      >
        <div className="cursor-pointer" onClick={() => setIsModalOpen(true)}>
          {/* NFT Image */}
          <div className="relative aspect-square w-full bg-purple-900/30">
            <div className={`absolute inset-0 flex items-center justify-center ${isImageLoading ? 'block' : 'hidden'}`}>
              <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
            </div>
            
            <Image
              src={getImageUrl()}
              alt={getNFTName()}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className={`object-cover transition-opacity duration-300 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
              onLoad={() => setIsImageLoading(false)}
              onError={() => {
                setIsImageLoading(false);
                setImageError(true);
              }}
            />
          </div>
          
          {/* NFT Name - Simplified */}
          <div className="p-2">
            <h3 className="font-medium text-white text-sm truncate text-center">
              {getNFTName()}
            </h3>
          </div>
        </div>
      </motion.div>
      
      {/* Modal for displaying full NFT details */}
      {isModalOpen && (
        <NFTModal 
          nft={nft} 
          contractAddress={contractAddress} 
          onClose={() => setIsModalOpen(false)} 
        />
      )}
    </>
  );
} 