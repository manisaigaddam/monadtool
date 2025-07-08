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
      
      console.log('Alchemy Response for status API:', JSON.stringify(data, null, 2));
      
      if (data.nfts && data.nfts.length > 0 && data.nfts[0].contract) {
        const collectionInfo = data.nfts[0].contract;
        console.log('Collection info from contract:', JSON.stringify(collectionInfo, null, 2));
        
        // Try multiple fields for collection name
        let collectionName = collectionInfo.name;
        if (!collectionName || collectionName === 'Unknown' || collectionName.trim() === '') {
          collectionName = collectionInfo.symbol;
        }
        if (!collectionName || collectionName === 'Unknown' || collectionName.trim() === '') {
          // Try to extract from first NFT title
          if (data.nfts[0].title) {
            const match = data.nfts[0].title.match(/^([a-zA-Z\s]+)/);
            if (match) {
              collectionName = match[1].trim();
            }
          }
        }
        
        return res.status(200).json({
          name: collectionName || 'Unknown Collection',
          totalSupply: collectionInfo.totalSupply || 'unknown',
          symbol: collectionInfo.symbol || '',
          tokenType: collectionInfo.tokenType || 'ERC721'
        });
      } else {
        console.log('No NFTs found or no contract info in response');
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