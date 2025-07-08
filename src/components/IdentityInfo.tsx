import React, { useState, useEffect } from 'react';
import { Client } from '@xmtp/browser-sdk';
import { formatInboxId, formatAddress, type ContentTypes } from '../utils/xmtp';

interface IdentityInfoProps {
  client: Client<ContentTypes>;
}

interface InstallationInfo {
  id: string;
  createdAt: Date;
}

interface HistorySyncStatus {
  isRunning: boolean;
  lastSyncTime?: Date;
  totalConversations?: number;
  syncedConversations?: number;
}

export default function IdentityInfo({ client }: IdentityInfoProps) {
  const [installations, setInstallations] = useState<InstallationInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historySyncStatus, setHistorySyncStatus] = useState<HistorySyncStatus>({
    isRunning: false
  });

  useEffect(() => {
    loadIdentityInfo();
  }, [client]);

  const loadIdentityInfo = async () => {
    if (!client) return;
    
    setIsLoading(true);
    try {
      // Get installation info - this is a simplified view
      // In actual implementation, you'd fetch from client.installations or similar
      const mockInstallations: InstallationInfo[] = [
        {
          id: 'current-installation',
          createdAt: new Date(),
        }
      ];
      setInstallations(mockInstallations);
    } catch (error) {
      console.error('Failed to load identity info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const syncPreferences = async () => {
    try {
      await client.preferences.sync();
      alert('Preferences synced successfully!');
    } catch (error) {
      console.error('Failed to sync preferences:', error);
      alert('Failed to sync preferences');
    }
  };

  // Phase III: History Sync
  const syncHistory = async () => {
    setHistorySyncStatus({ isRunning: true });
    
    try {
      // Starting history sync (reduced logging)
      
      // Step 1: Sync conversations from network
      await client.conversations.sync();
      // Conversations synced (reduced logging)
      
      // Step 2: Get all conversations
      const conversations = await client.conversations.list();
      setHistorySyncStatus(prev => ({ 
        ...prev, 
        totalConversations: conversations.length,
        syncedConversations: 0 
      }));
      
      // Step 3: Sync messages for each conversation
      let syncedCount = 0;
      for (const conversation of conversations) {
        try {
          await conversation.sync();
          syncedCount++;
          setHistorySyncStatus(prev => ({ 
            ...prev, 
            syncedConversations: syncedCount 
          }));
          // Synced conversation (reduced logging)
        } catch (error) {
          console.error('Failed to sync conversation:', error);
        }
      }
      
      // Step 4: Sync preferences
      await client.preferences.sync();
      // Preferences synced (reduced logging)
      
      setHistorySyncStatus({
        isRunning: false,
        lastSyncTime: new Date(),
        totalConversations: conversations.length,
        syncedConversations: syncedCount
      });
      
      alert(`History sync completed! Synced ${syncedCount}/${conversations.length} conversations.`);
      
    } catch (error) {
      console.error('Failed to sync history:', error);
      setHistorySyncStatus({ isRunning: false });
      alert('Failed to sync history');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">Identity Management</h3>
          
          {/* Inbox Information */}
          <div className="border border-gray-600 rounded-lg p-3 bg-gray-900">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Inbox Details</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-400">Inbox ID:</span>
                <span className="text-white ml-2 font-mono text-xs break-all">
                  {client.inboxId && client.inboxId !== 'Unknown' ? formatInboxId(client.inboxId) : 'Loading...'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Identity Type:</span>
                <span className="text-green-400 ml-2">ETHEREUM</span>
              </div>
            </div>
          </div>

          {/* Installations */}
          <div className="border border-gray-600 rounded-lg p-3 bg-gray-900">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Installations</h4>
            {isLoading ? (
              <div className="text-gray-400 text-sm">Loading...</div>
            ) : (
              <div className="space-y-2">
                {installations.map((installation, index) => (
                  <div key={installation.id} className="text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span className="text-white">Current Installation</span>
                    </div>
                    <div className="text-xs text-gray-400 ml-4">
                      Created: {installation.createdAt.toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* History Sync */}
          <div className="border border-gray-600 rounded-lg p-3 bg-gray-900">
            <h4 className="text-sm font-medium text-gray-300 mb-2">History Sync</h4>
            <div className="space-y-2">
              <button
                onClick={syncHistory}
                disabled={historySyncStatus.isRunning}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm px-3 py-1 rounded w-full"
              >
                {historySyncStatus.isRunning ? 'Syncing...' : 'Sync History'}
              </button>
              
              {historySyncStatus.isRunning && (
                <div className="text-xs text-blue-400">
                  {historySyncStatus.totalConversations ? 
                    `Syncing ${historySyncStatus.syncedConversations || 0}/${historySyncStatus.totalConversations} conversations...` :
                    'Fetching conversations...'
                  }
                </div>
              )}
              
              {historySyncStatus.lastSyncTime && (
                <div className="text-xs text-gray-400">
                  Last sync: {historySyncStatus.lastSyncTime.toLocaleString()}
                </div>
              )}
              
              <div className="text-xs text-gray-400">
                Sync messages and conversations across all your devices
              </div>
            </div>
          </div>

          {/* Preferences Management */}
          <div className="border border-gray-600 rounded-lg p-3 bg-gray-900">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Preferences</h4>
            <button
              onClick={syncPreferences}
              className="btn-primary text-sm px-3 py-1"
            >
              Sync Preferences
            </button>
            <div className="text-xs text-gray-400 mt-2">
              Sync consent preferences and HMAC keys across installations
            </div>
          </div>

          {/* Phase Information */}
          <div className="border border-gray-600 rounded-lg p-3 bg-gray-900">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Implementation Status</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✅</span>
                <span className="text-white">Phase II: Core Messaging</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✅</span>
                <span className="text-white">Phase III: History Sync</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-yellow-400">🚧</span>
                <span className="text-gray-400">Phase III: Group Chats (Future)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-500">⏳</span>
                <span className="text-gray-500">Phase IV: Advanced Features</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}