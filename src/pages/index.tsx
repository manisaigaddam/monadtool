import Head from 'next/head';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import SearchBar from '../components/SearchBar';
import ChatInbox from '../components/ChatInbox';

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'explore' | 'messages'>('explore');

  // Handle query parameters from navigation
  useEffect(() => {
    const { tab, chat } = router.query;
    if (tab === 'messages') {
      setActiveTab('messages');
    }
  }, [router.query]);

  // Function to open chat with a specific address
  const handleOpenChat = (ownerAddress: string) => {
    // Switch to messages tab and potentially pre-populate chat
    setActiveTab('messages');
    // The ChatInbox component will handle the rest
  };

  return (
    <>
      <Head>
        <title>W3aves – Web3 waves: messaging, marketplace, and exploration</title>
        <meta name="description" content="The ultimate NFT trading platform on Monad Testnet with encrypted messaging and escrow protection" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen">
        {/* Clean Navigation Header */}
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between card-primary p-4">
            <div className="flex items-center space-x-6">
              <div className="flex items-center">
                <div className="relative w-12 h-12 mr-1">
                  <Image
                    src="/images/monad-logo.png"
                    alt="Monad Logo"
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="text-lg font-semibold text-white">W3aves</span>
              </div>
              
              {/* Clean Tab Navigation */}
              <div className="flex space-x-1 bg-slate-800/50 rounded-lg p-1">
                <button 
                  onClick={() => setActiveTab('explore')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    activeTab === 'explore' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  🎨 Explore
                </button>
                <button 
                  onClick={() => setActiveTab('messages')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    activeTab === 'messages' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  💬 Messages
                </button>
              </div>
            </div>
            
            {/* Wallet Connection */}
            <ConnectButton />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {activeTab === 'explore' ? (
            <div className="container mx-auto px-4 py-12">
              <div className="flex flex-col items-center justify-center max-w-4xl mx-auto">
                {/* Hero Section */}
                <div className="text-center mb-12">
                  {/* Logo and Title */}
                  <div className="flex items-center justify-center mb-12">
                    <div className="relative w-20 h-20 mr-2">
                      <Image
                        src="/images/monad-logo.png"
                        alt="Monad Logo"
                        fill
                        className="object-contain"
                      />
                    </div>
                    <h1 className="text-5xl md:text-6xl font-bold text-white">
                    W3aves
                    </h1>
                  </div>
                </div>
                
                {/* Search Bar */}
                <div className="w-full max-w-2xl mb-16">
                  <SearchBar />
                </div>

                {/* Key Features */}
                <div className="grid md:grid-cols-3 gap-6 text-center">
                  <div className="space-y-2">
                    <div className="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <h3 className="text-white font-semibold">Discover NFTs</h3>
                    <p className="text-slate-400 text-sm">Browse collections, filter by traits, and find unique digital assets</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-12 h-12 bg-green-600/20 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-white font-semibold">Encrypted Messaging</h3>
                    <p className="text-slate-400 text-sm">Communicate privately with traders using wallet-to-wallet encryption</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <h3 className="text-white font-semibold">Escrow Protection</h3>
                    <p className="text-slate-400 text-sm">Trade safely with smart contract escrow and dispute resolution</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[calc(100vh-100px)]">
              <ChatInbox />
            </div>
          )}
        </div>
      </div>
    </>
  );
}