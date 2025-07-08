import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import NFTCard from '../../components/NFTCard';
import TraitFilters from '../../components/TraitFilters';
import { Collection, NFT, fetchCollection, checkCollectionStatus, extractTraits, filterNFTsByTraits } from '../../utils/api';

export default function CollectionPage() {
  const router = useRouter();
  const { address } = router.query;
  
  // Function to handle opening chat with NFT owner
  const handleOpenChat = (ownerAddress: string) => {
    // Navigate to home page with messages tab and owner address
    router.push({
      pathname: '/',
      query: { tab: 'messages', chat: ownerAddress }
    });
  };
  
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
          collectionName: collectionData.collectionName || collectionInfo?.name || 'NFT Collection'
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
  
  const getCollectionName = () => {
    // Prioritize collection data from main API
    if (collection?.collectionName && collection.collectionName !== 'Unknown Collection' && collection.collectionName !== 'NFT Collection') {
      return collection.collectionName;
    }
    // Fallback to collection info from status API
    if (collectionInfo?.name && collectionInfo.name !== 'Unknown Collection' && collectionInfo.name !== 'Unknown' && collectionInfo.name !== '') {
      return collectionInfo.name;
    }
    // Try to get from NFT collection field
    if (collection?.nfts?.[0]?.collection) {
      return collection.nfts[0].collection;
    }
    // Try to extract from first NFT metadata
    if (collection?.nfts?.[0]?.title) {
      const title = collection.nfts[0].title;
      // Extract collection name from NFT title (e.g., "skrumpet #4" -> "Skrumpets")
      const match = title.match(/^([a-zA-Z\s]+)/i);
      if (match) {
        const baseName = match[1].trim();
        const collectionName = baseName.endsWith('s') ? baseName : baseName + 's';
        return collectionName.charAt(0).toUpperCase() + collectionName.slice(1);
      }
    }
    return 'Unknown Collection';
  };
  
  const getMagicEdenUrl = () => {
    return `https://magiceden.io/collections/monad-testnet/${address}`;
  };
  
  const getExplorerUrl = () => {
    return `https://testnet.monadexplorer.com/address/${address}`;
  };

  return (
    <>
      <Head>
        <title>
          {getCollectionName()} | Monad NFT Explorer
        </title>
        <meta name="description" content={`Explore ${getCollectionName()} NFT collection on Monad Testnet`} />
      </Head>
      
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          {/* Clean Back button */}
          <div className="mb-6">
            <Link href="/" className="inline-flex items-center text-blue-400 hover:text-white transition-colors duration-200 card-primary px-4 py-2 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-medium">Back to Home</span>
            </Link>
          </div>
          
          {isLoading && !collection ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-6"></div>
              <div className="text-center space-y-2">
                <p className="text-white text-xl font-semibold">Loading collection...</p>
                {totalFetched > 0 && (
                  <p className="text-slate-400">Loaded {totalFetched} NFTs so far...</p>
                )}
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="card-primary p-8 max-w-md text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-4">Oops! Something went wrong</h2>
                <p className="text-slate-300 mb-6">{error}</p>
                <button
                  onClick={() => router.reload()}
                  className="btn-primary"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : collection ? (
            <>
              {/* Clean Collection Header */}
              <div className="mb-8">
                <div className="card-primary p-6 mb-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                        {getCollectionName()}
                      </h1>
                      <div className="flex flex-wrap items-center gap-4 mb-4">
                        <div className="flex items-center px-3 py-2 bg-slate-700/30 rounded-lg border border-slate-600/40">
                          <svg className="w-4 h-4 text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                          <span className="text-white font-medium text-sm">{collection.nfts.length} NFTs loaded</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {collection.nfts[0]?.description && (
                    <div className="mb-4">
                      <p className="text-slate-300 leading-relaxed max-w-4xl">
                        {collection.nfts[0].description}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={getExplorerUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-sm flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      <span>Monad Explorer</span>
                    </a>
                    <a
                      href={getMagicEdenUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-sm flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      <span>Magic Eden</span>
                    </a>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Filters Sidebar */}
                <div className="w-full lg:w-64 flex-shrink-0">
                  <TraitFilters traits={traits} onFilterChange={handleFilterChange} />
                </div>
                
                {/* Clean NFT Grid */}
                <div className="flex-grow">
                  <div className="mb-6 card-primary p-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-white">
                        {filteredNFTs.length} {filteredNFTs.length === 1 ? 'NFT' : 'NFTs'}
                        {Object.keys(selectedTraits).length > 0 && (
                          <span className="text-blue-400 ml-2">(filtered)</span>
                        )}
                      </h2>
                      <p className="text-slate-400 text-sm mt-1">
                        Showing {Math.min(loadedCount, filteredNFTs.length)} of {filteredNFTs.length}
                      </p>
                    </div>
                    {Object.keys(selectedTraits).length > 0 && (
                      <button
                        onClick={() => setSelectedTraits({})}
                        className="text-blue-400 hover:text-white transition-colors text-sm underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                  
                  {filteredNFTs.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {displayedNFTs.map((nft) => (
                          <NFTCard
                            key={nft.tokenId}
                            nft={nft}
                            contractAddress={collection.contractAddress}
                            onOpenChat={handleOpenChat}
                          />
                        ))}
                      </div>
                      
                      {/* Clean Load More Buttons */}
                      <div className="flex justify-center mt-8 space-x-4">
                        {/* Load more from already fetched NFTs */}
                        {displayedNFTs.length < filteredNFTs.length && (
                          <button
                            onClick={loadMoreNFTs}
                            className="btn-primary"
                          >
                            <span>Load More NFTs</span>
                            
                          </button>
                        )}
                        
                        {/* Fetch more from API */}
                        {hasMoreToFetch && displayedNFTs.length >= filteredNFTs.length && (
                          <button
                            onClick={fetchMoreNFTs}
                            disabled={isLoading}
                            className="btn-secondary disabled:opacity-50"
                          >
                            {isLoading ? (
                              <>
                                <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Fetching...</span>
                              </>
                            ) : (
                              <>
                                <span>Fetch More from API</span>
                                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-slate-600/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">No NFTs found</h3>
                      <p className="text-slate-400">Try adjusting your filters to see more results.</p>
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
