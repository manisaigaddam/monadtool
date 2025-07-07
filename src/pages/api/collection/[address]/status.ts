import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address } = req.query;
    const contractAddress = Array.isArray(address) ? address[0] : address;
    
    if (!contractAddress) {
      return res.status(400).json({ error: 'Contract address is required' });
    }

    // Fetch data from Alchemy
    const apiKey = process.env.ALCHEMY_API_KEY;
    const baseUrl = process.env.ALCHEMY_BASE_URL;
    
    if (!apiKey || !baseUrl) {
      return res.status(500).json({ error: 'API configuration missing' });
    }

    // Get collection info from Alchemy
    try {
      // First get a single NFT to get collection info
      const url = `${baseUrl}/${apiKey}/getNFTsForCollection`;
      const params = {
        contractAddress,
        withMetadata: false,
        limit: 1
      };
      
      const response = await axios.get(url, { params });
      const data = response.data;
      
      if (data.nfts && data.nfts.length > 0 && data.nfts[0].contract) {
        const collectionInfo = data.nfts[0].contract;
        
        return res.status(200).json({
          name: collectionInfo.name || 'Unknown Collection',
          totalSupply: collectionInfo.totalSupply || 'unknown',
          symbol: collectionInfo.symbol || '',
          tokenType: collectionInfo.tokenType || 'ERC721'
        });
      } else {
        return res.status(200).json({ 
          name: 'Unknown Collection',
          totalSupply: 'unknown',
          symbol: '',
          tokenType: 'ERC721'
        });
      }
    } catch (error) {
      console.error('Error fetching collection info:', error);
      return res.status(500).json({ error: 'Failed to fetch collection info' });
    }
  } catch (error) {
    console.error('Error checking collection status:', error);
    return res.status(500).json({ error: 'Failed to check collection status' });
  }
} 