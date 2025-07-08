import { useState } from 'react';
import { useRouter } from 'next/router';

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
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          placeholder="Enter NFT contract address (0x...)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={isLoading}
          className="flex-1 bg-slate-800/30 border border-slate-600/40 text-white placeholder-slate-400 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200 disabled:opacity-50"
        />
        
        <button
          type="submit"
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
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
        </button>
      </form>
      
      {error && (
        <p className="text-red-400 text-sm mt-2 animate-fade-in">
          {error}
        </p>
      )}
      
      <div className="mt-6">
        <p className="text-slate-400 text-sm mb-3">Popular collections:</p>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'Skrumpets', address: '0xe8f0635591190fb626f9d13c49b60626561ed145' },
            { name: 'Yaiko Nads', address: '0x78a7c5dae2999e90f705def373cc0118d6f49378' },
            { name: 'Purple Frens', address: '0xC5c9425D733b9f769593bd2814B6301916f91271' },
            { name: 'Spikes', address: '0x87E1F1824C9356733A25d6beD6b9c87A3b31E107' },
            { name: 'The10kSquad', address: '0x3a9454c1b4c84d1861bb1209a647c834d137b442' },
            { name: 'r3tards', address: '0xed52e0d80f4e7b295df5e622b55eff22d262f6ed' },
            { name: 'Owlsmons', address: '0x413fF27448ba00aC2fEcd66d98123c88DfE3d1cc' }
          ].map((collection) => (
            <button
              key={collection.address}
              onClick={() => router.push(`/collection/${collection.address}`)}
              className="btn-secondary text-sm"
            >
              {collection.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
} 