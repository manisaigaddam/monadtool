import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import NFTCard from '../../components/NFTCard';
import TraitFilters from '../../components/TraitFilters';
import { Collection, NFT, fetchCollection, checkCollectionStatus, extractTraits, filterNFTsByTraits } from '../../utils/api';

export default function CollectionPage() {
  const router = useRouter();
  const { address } = router.query;
  
  const [collection, setCollection] = useState<Collection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTraits, setSelectedTraits] = useState<Record<string, string[]>>({});
  const [filteredNFTs, setFilteredNFTs] = useState<NFT[]>([]);
  const [displayedNFTs, setDisplayedNFTs] = useState<NFT[]>([]);
  const [collectionInfo, setCollectionInfo] = useState<{name: string, totalSupply: string} | null>(null);
  const [traits, setTraits] = useState<Record<string, string[]>>({});
  const [loadedCount, setLoadedCount] = useState(100); // Initial display count - increased to 100
  const [totalFetched, setTotalFetched] = useState(0); // Track total fetched NFTs
  const [isFetchingComplete, setIsFetchingComplete] = useState(false); // Track if fetching is complete
  const [hasMoreToFetch, setHasMoreToFetch] = useState(true); // Track if there are more NFTs to fetch
  const itemsPerPage = 100; // Show 100 NFTs per page
  const maxInitialFetch = 10000; // Maximum NFTs to fetch initially
  
  // Fetch collection status when address changes
  useEffect(() => {
    if (!address) return;
    
    const contractAddress = Array.isArray(address) ? address[0] : address;
    
    const getCollectionStatus = async () => {
      try {
        const status = await checkCollectionStatus(contractAddress);
        if (status) {
          setCollectionInfo({
            name: status.name || 'NFT Collection',
            totalSupply: status.totalSupply || ''
          });
        }
      } catch (err) {
        console.error('Error fetching collection status:', err);
        // Set default values if status fetch fails
        setCollectionInfo({
          name: 'NFT Collection',
          totalSupply: ''
        });
      }
    };
    
    getCollectionStatus();
  }, [address]);
  
  // Fetch collection data when address changes
  useEffect(() => {
    if (!address) return;
    
    const contractAddress = Array.isArray(address) ? address[0] : address;
    
    const fetchAllNFTs = async () => {
      setIsLoading(true);
      setError(null);
      setIsFetchingComplete(false);
      setHasMoreToFetch(true);
      
      try {
        let allNFTs: NFT[] = [];
        let nextPageKey: string | null = null;
        let collectionData: Collection | null = null;
        
        // Fetch first page
        const firstPageData = await fetchCollection(contractAddress);
        if (!firstPageData) {
          setError('Failed to fetch collection data');
          setIsLoading(false);
          return;
        }
        
        collectionData = firstPageData;
        allNFTs = [...firstPageData.nfts];
        nextPageKey = firstPageData.pageKey || null;
        setTotalFetched(allNFTs.length);
        
        // Continue fetching pages until no more pageKey or we reach maxInitialFetch
        while (nextPageKey && allNFTs.length < maxInitialFetch) {
          const nextPageData = await fetchCollection(contractAddress, nextPageKey);
          if (!nextPageData || !nextPageData.nfts.length) break;
          
          allNFTs = [...allNFTs, ...nextPageData.nfts];
          nextPageKey = nextPageData.pageKey || null;
          setTotalFetched(allNFTs.length);
          
          // Check if we've reached the limit but there are still more NFTs
          if (allNFTs.length >= maxInitialFetch && nextPageKey) {
            setHasMoreToFetch(true);
            break;
          }
        }
        
        // If no more pageKey, we've fetched everything
        if (!nextPageKey) {
          setHasMoreToFetch(false);
        }
        
        // Set final collection data
        const finalCollection = {
          ...collectionData,
          nfts: allNFTs,
          totalNFTs: allNFTs.length,
          pageKey: nextPageKey, // Keep the pageKey for loading more later
          collectionName: collectionInfo?.name || collectionData.collectionName || 'NFT Collection'
        };
        
        setCollection(finalCollection);
        setFilteredNFTs(allNFTs);
        setDisplayedNFTs(allNFTs.slice(0, loadedCount));
        
        // Extract traits from all NFTs
        const extractedTraits = extractTraits(finalCollection);
        setTraits(extractedTraits);
        
        setIsLoading(false);
        setIsFetchingComplete(true);
      } catch (err) {
        console.error('Error fetching collection:', err);
        setError('An error occurred while fetching the collection');
        setIsLoading(false);
      }
    };
    
    fetchAllNFTs();
  }, [address]);
  
  // Filter NFTs when selected traits change
  useEffect(() => {
    if (!collection) return;
    
    const filtered = filterNFTsByTraits(collection.nfts, selectedTraits);
    setFilteredNFTs(filtered);
    setLoadedCount(itemsPerPage); // Reset to initial count when filters change
    setDisplayedNFTs(filtered.slice(0, itemsPerPage));
  }, [selectedTraits, collection]);
  
  // Handle trait filter changes
  const handleFilterChange = (newSelectedTraits: Record<string, string[]>) => {
    setSelectedTraits(newSelectedTraits);
  };
  
  // Load more NFTs from the already fetched data
  const loadMoreNFTs = () => {
    const newCount = loadedCount + itemsPerPage;
    setLoadedCount(newCount);
    setDisplayedNFTs(filteredNFTs.slice(0, newCount));
  };
  
  // Fetch more NFTs from API when we've displayed all we have
  const fetchMoreNFTs = async () => {
    if (!address || !collection?.pageKey) return;
    
    const contractAddress = Array.isArray(address) ? address[0] : address;
    setIsLoading(true);
    
    try {
      const newData = await fetchCollection(contractAddress, collection.pageKey);
      if (!newData || !newData.nfts.length) {
        setHasMoreToFetch(false);
        setIsLoading(false);
        return;
      }
      
      // Update collection with new NFTs
      const updatedNFTs = [...collection.nfts, ...newData.nfts];
      const updatedCollection = {
        ...collection,
        nfts: updatedNFTs,
        totalNFTs: updatedNFTs.length,
        pageKey: newData.pageKey
      };
      
      setCollection(updatedCollection);
      setTotalFetched(updatedNFTs.length);
      
      // Update filtered NFTs if filters are applied
      const filtered = filterNFTsByTraits(updatedNFTs, selectedTraits);
      setFilteredNFTs(filtered);
      setDisplayedNFTs(filtered.slice(0, loadedCount));
      
      // Update traits with new NFTs
      const updatedTraits = extractTraits(updatedCollection);
      setTraits(updatedTraits);
      
      // Check if we have more to fetch
      setHasMoreToFetch(!!newData.pageKey);
      
    } catch (err) {
      console.error('Error fetching more NFTs:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Get collection name to display
  const getCollectionName = () => {
    if (collectionInfo?.name && collectionInfo.name !== 'Unknown Collection') {
      return collectionInfo.name;
    }
    if (collection?.collectionName && collection.collectionName !== 'Unknown Collection') {
      return collection.collectionName;
    }
    return 'NFT Collection';
  };

  // Get Magic Eden collection URL
  const getMagicEdenUrl = () => {
    if (!address) return '';
    const contractAddress = Array.isArray(address) ? address[0] : address;
    return `https://magiceden.io/collections/monad-testnet/${contractAddress}`;
  };

  // Get Monad Explorer URL
  const getExplorerUrl = () => {
    if (!address) return '';
    const contractAddress = Array.isArray(address) ? address[0] : address;
    return `https://testnet.monadexplorer.com/address/${contractAddress}`;
  };
  
  return (
    <>
      <Head>
        <title>
          {getCollectionName()} | Monad NFT Explorer
        </title>
        <meta name="description" content={`Explore ${getCollectionName()} NFT collection on Monad Testnet`} />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-b from-purple-950 to-black">
        <div className="container mx-auto px-4 py-8">
          {/* Back button */}
          <Link href="/" className="inline-flex items-center text-purple-400 hover:text-purple-300 mb-6 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </Link>
          
          {isLoading && !collection ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4"></div>
              <p className="text-purple-300 mb-2">Loading collection...</p>
              
              {totalFetched > 0 && (
                <p className="text-purple-300 mt-2">Loaded {totalFetched} NFTs so far...</p>
              )}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6 max-w-md text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 className="text-xl font-medium text-white mb-2">Error</h2>
                <p className="text-red-300">{error}</p>
                <button
                  onClick={() => router.reload()}
                  className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : collection ? (
            <>
              {/* Collection Header */}
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">{getCollectionName()}</h1>
                <div className="flex flex-wrap items-center text-purple-300 mb-4 gap-2">
                  <span>{collection.nfts.length} NFTs loaded</span>
                  <span className="mx-2">•</span>
                  <div className="flex space-x-2">
                    <a
                      href={getExplorerUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 transition-colors flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Monad Explorer
                    </a>
                    <span className="mx-1">|</span>
                    <a
                      href={getMagicEdenUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 transition-colors flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Magic Eden
                    </a>
                  </div>
                </div>
                
                {collection.nfts[0]?.description && (
                  <p className="text-purple-200 max-w-3xl">
                    {collection.nfts[0].description}
                  </p>
                )}
              </div>
              
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Filters Sidebar */}
                <div className="w-full lg:w-64 flex-shrink-0">
                  <TraitFilters traits={traits} onFilterChange={handleFilterChange} />
                </div>
                
                {/* NFT Grid */}
                <div className="flex-grow">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-medium text-white">
                      {filteredNFTs.length} {filteredNFTs.length === 1 ? 'NFT' : 'NFTs'}
                      {Object.keys(selectedTraits).length > 0 && ' (filtered)'}
                    </h2>
                    <p className="text-purple-300 text-sm">
                      Showing {Math.min(loadedCount, filteredNFTs.length)} of {filteredNFTs.length}
                    </p>
                  </div>
                  
                  {filteredNFTs.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {displayedNFTs.map((nft) => (
                          <NFTCard
                            key={nft.tokenId}
                            nft={nft}
                            contractAddress={collection.contractAddress}
                          />
                        ))}
                      </div>
                      
                      {/* Load More Buttons */}
                      <div className="flex justify-center mt-10 space-x-4">
                        {/* Load more from already fetched NFTs */}
                        {displayedNFTs.length < filteredNFTs.length && (
                          <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={loadMoreNFTs}
                            className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-3 rounded-lg font-medium text-white shadow-lg"
                          >
                            Load More NFTs
                          </motion.button>
                        )}
                        
                        {/* Fetch more NFTs from API */}
                        {hasMoreToFetch && displayedNFTs.length === filteredNFTs.length && (
                          <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={fetchMoreNFTs}
                            disabled={isLoading}
                            className={`bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-3 rounded-lg font-medium text-white shadow-lg ${isLoading ? 'opacity-70' : ''}`}
                          >
                            {isLoading ? (
                              <div className="flex items-center">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                                <span>Fetching...</span>
                              </div>
                            ) : (
                              'Fetch More From Collection'
                            )}
                          </motion.button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-8 text-center">
                      <p className="text-purple-300">No NFTs match the selected filters</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}