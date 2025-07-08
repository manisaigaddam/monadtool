import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

// Environment variables should be in .env.local:
// ALCHEMY_API_KEY=your_api_key
// ALCHEMY_BASE_URL=https://monad-testnet.g.alchemy.com/nft/v3

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address, pageKey: requestPageKey, limit = '100' } = req.query;
    const contractAddress = Array.isArray(address) ? address[0] : address;
    const pageLimit = parseInt(Array.isArray(limit) ? limit[0] : limit, 10);
    const userPageKey = Array.isArray(requestPageKey) ? requestPageKey[0] : requestPageKey;
    
    if (!contractAddress) {
      return res.status(400).json({ error: 'Contract address is required' });
    }

    // Fetch data from Alchemy
    const apiKey = process.env.ALCHEMY_API_KEY;
    const baseUrl = process.env.ALCHEMY_BASE_URL;
    
    if (!apiKey || !baseUrl) {
      return res.status(500).json({ error: 'API configuration missing' });
    }

    // Initialize collection data
    let collection = {
      collectionName: '',
      contractAddress,
      totalNFTs: 0,
      collectionInfo: null,
      nfts: [],
      pageKey: null
    };

    // Fetch NFTs for the requested page
    const url = `${baseUrl}/${apiKey}/getNFTsForContract`;
    const params = {
      contractAddress,
      withMetadata: true,
      limit: Math.min(100, pageLimit), // Maximum allowed by Alchemy is 100
      pageKey: userPageKey || undefined
    };
    
    try {
      const response = await axios.get(url, { params });
      const data = response.data;
      
      // Add NFTs to collection
      if (data.nfts && data.nfts.length > 0) {
        collection.nfts = data.nfts;
        
        // Set collection info from the first NFT if not already set
        if (!collection.collectionInfo && data.nfts[0].contract) {
          collection.collectionInfo = data.nfts[0].contract;
          
          // Try to get a good collection name from Alchemy response
          let collectionName = 'NFT Collection';
          
          // 1. Try contract name first - Alchemy provides the actual collection name here
          if (data.nfts[0].contract.name && 
              data.nfts[0].contract.name.trim() !== '' &&
              data.nfts[0].contract.name !== 'Unknown') {
            collectionName = data.nfts[0].contract.name;
          } 
          // 2. Try contract symbol as fallback
          else if (data.nfts[0].contract.symbol && 
                   data.nfts[0].contract.symbol.trim() !== '' &&
                   data.nfts[0].contract.symbol !== 'Unknown') {
            collectionName = data.nfts[0].contract.symbol;
          }
          // 3. Extract from NFT title/name (e.g., "skrumpet #4" -> "Skrumpets")
          else if (data.nfts[0].title || data.nfts[0].name) {
            const nftName = data.nfts[0].title || data.nfts[0].name;
            const match = nftName.match(/^([a-zA-Z\s]+)/i);
            if (match) {
              const baseName = match[1].trim();
              // Add 's' if it doesn't end with 's' already and it's not already plural
              collectionName = baseName.endsWith('s') ? baseName : baseName + 's';
              // Capitalize first letter
              collectionName = collectionName.charAt(0).toUpperCase() + collectionName.slice(1);
            }
          }
          
          collection.collectionName = collectionName;
        }
        
        // Update total count (this is just the count of NFTs in this response)
        collection.totalNFTs = data.nfts.length;
        
        // Pass along the pageKey for client-side pagination
        collection.pageKey = data.pageKey || null;
      }
    } catch (error) {
      console.error('Error fetching collection page:', error);
      return res.status(500).json({ error: 'Failed to fetch collection data from Alchemy' });
    }
    
    return res.status(200).json(collection);
  } catch (error) {
    console.error('Error fetching collection:', error);
    return res.status(500).json({ error: 'Failed to fetch collection data' });
  }
} 