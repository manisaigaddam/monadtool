import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TraitFiltersProps {
  traits: Record<string, string[]>;
  onFilterChange: (selectedTraits: Record<string, string[]>) => void;
}

export default function TraitFilters({ traits, onFilterChange }: TraitFiltersProps) {
  const [selectedTraits, setSelectedTraits] = useState<Record<string, string[]>>({});
  const [expandedTraits, setExpandedTraits] = useState<Record<string, boolean>>({});
  
  // Toggle trait type expansion
  const toggleTraitType = (traitType: string) => {
    setExpandedTraits(prev => ({
      ...prev,
      [traitType]: !prev[traitType]
    }));
  };
  
  // Toggle trait value selection
  const toggleTraitValue = (traitType: string, value: string) => {
    setSelectedTraits(prev => {
      const currentValues = prev[traitType] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      
      const newSelectedTraits = {
        ...prev,
        [traitType]: newValues
      };
      
      // Remove empty arrays
      if (newValues.length === 0) {
        delete newSelectedTraits[traitType];
      }
      
      // Notify parent component
      onFilterChange(newSelectedTraits);
      
      return newSelectedTraits;
    });
  };
  
  // Clear all filters
  const clearFilters = () => {
    setSelectedTraits({});
    onFilterChange({});
  };
  
  // Count total selected filters
  const selectedCount = Object.values(selectedTraits).reduce(
    (count, values) => count + values.length, 
    0
  );
  
  return (
    <div className="card-primary p-4 sticky top-4 max-h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-white">Trait Filters</h2>
        
        {selectedCount > 0 && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.1 }}
            onClick={clearFilters}
            className="text-sm text-slate-300 hover:text-white transition-colors"
          >
            Clear all ({selectedCount})
          </motion.button>
        )}
      </div>
      
      <div className="space-y-3 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
        {Object.entries(traits).map(([traitType, values]) => (
          <div key={traitType} className="border-b border-slate-700/30 pb-3">
            <button
              onClick={() => toggleTraitType(traitType)}
                              className="w-full flex items-center justify-between text-left text-white hover:text-blue-300 transition-colors"
            >
              <span className="font-medium">
                {traitType} 
                {selectedTraits[traitType]?.length > 0 && (
                  <span className="ml-2 text-slate-400 text-sm">
                    ({selectedTraits[traitType].length})
                  </span>
                )}
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 transition-transform duration-150 ${expandedTraits[traitType] ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            <AnimatePresence>
              {expandedTraits[traitType] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-1 pl-2">
                    {values.map(value => (
                      <div key={`${traitType}-${value}`} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`${traitType}-${value}`}
                          checked={selectedTraits[traitType]?.includes(value) || false}
                          onChange={() => toggleTraitValue(traitType, value)}
                          className="w-4 h-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                        />
                        <label
                          htmlFor={`${traitType}-${value}`}
                                                      className="ml-2 text-sm text-slate-200 hover:text-white cursor-pointer truncate"
                        >
                          {value}
                        </label>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
        
        {Object.keys(traits).length === 0 && (
          <p className="text-slate-400 text-sm italic">No traits available</p>
        )}
      </div>
    </div>
  );
} 