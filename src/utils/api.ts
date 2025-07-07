// API utility functions for fetching NFT data

// Types
export interface NFTAttribute {
  trait_type: string;
  value: string | number | boolean;
}

export interface NFTImage {
  cachedUrl?: string;
  thumbnailUrl?: string;
  pngUrl?: string;
  originalUrl?: string;
}

export interface NFT {
  tokenId: string;
  name: string;
  description: string;
  image: NFTImage;
  raw: {
    metadata: any;
  };
  timeLastUpdated: string;
}

export interface CollectionInfo {
  address: string;
  name: string;
  symbol: string;
  totalSupply: string;
  tokenType: string;
}

export interface Collection {
  collectionName: string;
  contractAddress: string;
  totalNFTs: number;
  collectionInfo: CollectionInfo;
  nfts: NFT[];
  pageKey?: string | null;
}

export interface CollectionStatus {
  name: string;
  totalSupply: string;
  symbol: string;
  tokenType: string;
}

// Function to fetch collection data with pagination
export async function fetchCollection(
  contractAddress: string, 
  pageKey?: string | null,
  limit: number = 100 // Fetch maximum allowed by Alchemy
): Promise<Collection | null> {
  try {
    let url = `/api/collection/${contractAddress}?limit=${limit}`;
    if (pageKey) {
      url += `&pageKey=${pageKey}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch collection: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching collection:', error);
    return null;
  }
}

// Function to check collection status
export async function checkCollectionStatus(
  contractAddress: string
): Promise<CollectionStatus | null> {
  try {
    const response = await fetch(`/api/collection/${contractAddress}/status`);
    if (!response.ok) {
      throw new Error(`Failed to fetch collection status: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error checking collection status:', error);
    return null;
  }
}

// Function to fetch NFT owner
export async function fetchNFTOwner(
  contractAddress: string,
  tokenId: string
): Promise<string | null> {
  try {
    const response = await fetch(`/api/nft/${contractAddress}/${tokenId}/owner`);
    if (!response.ok) {
      throw new Error(`Failed to fetch NFT owner: ${response.statusText}`);
    }
    const data = await response.json();
    return data.owner;
  } catch (error) {
    console.error('Error fetching NFT owner:', error);
    return null;
  }
}

// Extract traits from an NFT with enhanced support for different metadata formats
export function extractNFTTraits(nft: NFT): NFTAttribute[] {
  if (!nft.raw?.metadata) {
    return [];
  }
  
  const metadata = nft.raw.metadata;
  let traits: NFTAttribute[] = [];
  
  // Case 1: Standard format - attributes array with trait_type and value
  if (Array.isArray(metadata.attributes)) {
    traits = metadata.attributes
      .filter((attr: any) => attr !== null && typeof attr === 'object')
      .map((attr: any) => {
        // Normalize attribute format
        return {
          trait_type: attr.trait_type || attr.key || attr.name || attr.type || 'Unknown',
          value: attr.value !== undefined ? attr.value : (attr.trait_value || '')
        };
      });
    
    if (traits.length > 0) {
      return traits;
    }
  }
  
  // Case 2: Properties.traits object
  if (metadata.properties?.traits && typeof metadata.properties.traits === 'object') {
    traits = Object.entries(metadata.properties.traits).map(([key, value]) => ({
      trait_type: key,
      value: String(value)
    }));
    
    if (traits.length > 0) {
      return traits;
    }
  }
  
  // Case 3: Direct traits object
  if (metadata.traits && typeof metadata.traits === 'object') {
    traits = Object.entries(metadata.traits).map(([key, value]) => ({
      trait_type: key,
      value: String(value)
    }));
    
    if (traits.length > 0) {
      return traits;
    }
  }
  
  // Case 4: Properties array
  if (Array.isArray(metadata.properties)) {
    traits = metadata.properties
      .filter((prop: any) => prop !== null && typeof prop === 'object')
      .map((prop: any) => ({
        trait_type: prop.name || prop.key || prop.trait_type || 'Property',
        value: prop.value || ''
      }));
    
    if (traits.length > 0) {
      return traits;
    }
  }
  
  // Case 5: Direct key-value pairs in metadata (excluding common non-trait fields)
  const excludedKeys = [
    'name', 'description', 'image', 'image_url', 'imageUrl', 'image_data',
    'external_url', 'animation_url', 'attributes', 'properties', 'compiler',
    'date', 'dna', 'edition', 'id', 'background_color', 'youtube_url',
    'external_link', 'tokenId', 'token_id'
  ];
  
  traits = Object.entries(metadata)
    .filter(([key]) => !excludedKeys.includes(key.toLowerCase()) && typeof metadata[key] !== 'object')
    .map(([key, value]) => ({
      trait_type: key,
      value: String(value)
    }));
  
  return traits;
}

// Extract all trait types and values from a collection
export function extractTraits(collection: Collection) {
  const traitTypes: Record<string, Set<string>> = {};
  
  collection.nfts.forEach(nft => {
    const traits = extractNFTTraits(nft);
    
    traits.forEach(attr => {
      if (!traitTypes[attr.trait_type]) {
        traitTypes[attr.trait_type] = new Set();
      }
      traitTypes[attr.trait_type].add(String(attr.value));
    });
  });
  
  // Convert Sets to Arrays for easier use in components
  const result: Record<string, string[]> = {};
  Object.entries(traitTypes).forEach(([key, values]) => {
    result[key] = Array.from(values).sort();
  });
  
  return result;
}

// Filter NFTs by traits
export function filterNFTsByTraits(
  nfts: NFT[], 
  selectedTraits: Record<string, string[]>
): NFT[] {
  if (!Object.keys(selectedTraits).length) return nfts;
  
  return nfts.filter(nft => {
    const traits = extractNFTTraits(nft);
    if (!traits.length) return false;
    
    // Check if NFT has all selected traits
    return Object.entries(selectedTraits).every(([traitType, values]) => {
      if (!values.length) return true; // Skip if no values selected for this trait type
      
      const nftTraitValue = traits.find(
        attr => attr.trait_type === traitType
      )?.value;
      
      return nftTraitValue && values.includes(String(nftTraitValue));
    });
  });
} 