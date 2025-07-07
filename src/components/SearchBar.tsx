import { useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';

export default function SearchBar() {
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset error state
    setError('');
    
    // Basic validation
    if (!address.trim()) {
      setError('Please enter a contract address');
      return;
    }
    
    // Simple format validation (not comprehensive)
    if (!address.startsWith('0x') || address.length !== 42) {
      setError('Please enter a valid Ethereum contract address');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Navigate to the collection page
      await router.push(`/collection/${address}`);
    } catch (err) {
      console.error('Navigation error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Enter NFT contract address (0x...)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={isLoading}
            className="w-full px-4 py-3 rounded-lg bg-purple-900/30 border border-purple-500 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50"
          />
          
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.1 }}
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-2 rounded-md font-medium text-white disabled:opacity-50"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading
                </div>
              ) : (
                'Explore'
              )}
            </motion.button>
          </div>
        </div>
        
        {error && (
          <motion.p 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-400 text-sm"
          >
            {error}
          </motion.p>
        )}
      </form>
      
      <div className="mt-6">
        <p className="text-purple-300 text-sm mb-2">Popular collections:</p>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'Skrumpets', address: '0xe8f0635591190fb626f9d13c49b60626561ed145' },
            { name: 'Yaiko Nads', address: '0x78a7c5dae2999e90f705def373cc0118d6f49378' }
          ].map((collection) => (
            <motion.button
              key={collection.address}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push(`/collection/${collection.address}`)}
              className="px-3 py-1 bg-purple-800/50 rounded-full text-xs border border-purple-500 text-white hover:bg-purple-700/50 transition-colors"
            >
              {collection.name}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
} 