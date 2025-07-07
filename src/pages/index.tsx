import Head from 'next/head';
import Image from 'next/image';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import SearchBar from '../components/SearchBar';
import ChatInbox from '../components/ChatInbox';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'explore' | 'messages'>('explore');

  return (
    <>
      <Head>
        <title>Monad NFT Explorer</title>
        <meta name="description" content="Explore NFT collections on Monad Testnet" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-purple-950 to-black">
        {/* Navigation Header */}
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <div className="flex items-center">
                <div className="relative w-8 h-8 mr-2">
                  <Image
                    src="/images/monad-logo.png"
                    alt="Monad Logo"
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="text-xl font-bold text-white">Monad NFT Explorer</span>
              </div>
              
              {/* Tab Navigation */}
              <div className="flex space-x-6">
                <button 
                  onClick={() => setActiveTab('explore')}
                  className={`text-purple-300 hover:text-white transition-colors pb-1 ${
                    activeTab === 'explore' 
                      ? 'border-b-2 border-purple-400 text-white' 
                      : 'hover:border-b-2 hover:border-purple-400'
                  }`}
                >
                  🎨 Explore
                </button>
                <button 
                  onClick={() => setActiveTab('messages')}
                  className={`text-purple-300 hover:text-white transition-colors pb-1 ${
                    activeTab === 'messages' 
                      ? 'border-b-2 border-purple-400 text-white' 
                      : 'hover:border-b-2 hover:border-purple-400'
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
              <div className="flex flex-col items-center justify-center">
                {/* Logo and Title */}
                <div className="flex items-center mb-6">
                  <div className="relative w-12 h-12 mr-4">
                    <Image
                      src="/images/monad-logo.png"
                      alt="Monad Logo"
                      fill
                      className="object-contain"
                    />
                  </div>
                  <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
                    Monad NFT Explorer
                  </h1>
                </div>
                
                {/* Subtitle */}
                <p className="text-purple-300 text-xl mb-12 text-center max-w-2xl">
                  Discover and explore NFT collections on the Monad Testnet.<br />
                  <span className="text-purple-400">Now with decentralized messaging powered by XMTP!</span>
                </p>
                
                {/* Search Bar */}
                <div className="w-full max-w-2xl">
                  <SearchBar />
                </div>

                {/* Features Cards */}
                <div className="grid md:grid-cols-2 gap-6 mt-12 w-full max-w-4xl">
                  <div className="bg-gray-900 bg-opacity-50 rounded-lg p-6 border border-purple-500/20">
                    <h3 className="text-xl font-semibold text-white mb-3">🎨 NFT Explorer</h3>
                    <p className="text-gray-300">
                      Search and browse NFT collections, view detailed metadata, and filter by traits.
                    </p>
                  </div>
                  <div className="bg-gray-900 bg-opacity-50 rounded-lg p-6 border border-purple-500/20">
                    <h3 className="text-xl font-semibold text-white mb-3">💬 XMTP Messaging</h3>
                    <p className="text-gray-300">
                      Send end-to-end encrypted messages to other collectors using your wallet.
                    </p>
                    <button 
                      onClick={() => setActiveTab('messages')}
                      className="mt-3 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      Switch to Messages
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[calc(100vh-120px)]">
              <ChatInbox />
            </div>
          )}
        </div>
      </div>
    </>
  );
}