import { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';

// ABI for ERC721 ownerOf function
const ERC721_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ownerOf",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Cache responses for 1 minute (ownership can change frequently)
const CACHE_DURATION = 60 * 1000; // 1 minute in milliseconds
const cache: Record<string, { owner: string; timestamp: number }> = {};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address, tokenId } = req.query;
    const contractAddress = Array.isArray(address) ? address[0] : address;
    const tokenIdValue = Array.isArray(tokenId) ? tokenId[0] : tokenId;
    
    if (!contractAddress || !tokenIdValue) {
      return res.status(400).json({ error: 'Contract address and token ID are required' });
    }

    // Check if we have a fresh cached response
    const cacheKey = `${contractAddress.toLowerCase()}-${tokenIdValue}`;
    const now = Date.now();
    if (cache[cacheKey] && now - cache[cacheKey].timestamp < CACHE_DURATION) {
      return res.status(200).json({ owner: cache[cacheKey].owner });
    }

    // Connect to Monad Testnet
    const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');
    
    // Create contract instance
    const contract = new ethers.Contract(
      contractAddress,
      ERC721_ABI,
      provider
    );
    
    try {
      // Call ownerOf function with timeout
      const owner = await Promise.race([
        contract.ownerOf(tokenIdValue),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 5000)
        )
      ]);
      
      // Cache the result
      cache[cacheKey] = { owner, timestamp: now };
      
      return res.status(200).json({ owner });
    } catch (contractError: any) {
      console.error('Contract error:', contractError);
      
      // Handle specific error cases
      if (contractError?.message?.includes('nonexistent token')) {
        return res.status(404).json({ error: 'Token does not exist' });
      }
      
      if (contractError?.message?.includes('timeout')) {
        return res.status(504).json({ error: 'Request timed out' });
      }
      
      // Return a more user-friendly error
      return res.status(404).json({ error: 'Unable to determine owner' });
    }
  } catch (error) {
    console.error('Error fetching NFT owner:', error);
    return res.status(500).json({ error: 'Failed to fetch NFT owner' });
  }
} 