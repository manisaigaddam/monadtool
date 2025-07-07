import React, { useState, useEffect } from 'react';
import { Client } from '@xmtp/browser-sdk';
import { formatInboxId, type ContentTypes } from '../utils/xmtp';
import { useToast } from './Toast';

interface SettingsModalProps {
  client: Client<ContentTypes>;
  isOpen: boolean;
  onClose: () => void;
}

interface Installation {
  id: string;
  createdAt: Date;
  keyPackageStatus?: any;
  bytes: Uint8Array;
}

interface HistorySyncStatus {
  isRunning: boolean;
  lastSyncTime?: Date;
  totalConversations?: number;
  syncedConversations?: number;
}

export default function SettingsModal({ client, isOpen, onClose }: SettingsModalProps) {
  const { addToast } = useToast();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [historySyncStatus, setHistorySyncStatus] = useState<HistorySyncStatus>({
    isRunning: false
  });

  useEffect(() => {
    if (isOpen && client) {
      loadInstallations();
    }
  }, [isOpen, client]);

  const loadInstallations = async () => {
    if (!client) return;
    
    setIsLoading(true);
    try {
      // Get inbox state which includes installations
      const inboxState = await client.preferences.inboxState(true);
      
      // Get key package statuses for installations
      const installationIds = inboxState.installations.map((inst: any) => inst.id);
      const keyPackageStatuses = await client.getKeyPackageStatusesForInstallationIds(installationIds);
      
      // Map installations with their statuses
      const installationsWithStatus = inboxState.installations.map((installation: any) => ({
        id: installation.id,
        createdAt: installation.clientTimestampNs ? 
          new Date(Number(installation.clientTimestampNs) / 1000000) : 
          new Date(),
        keyPackageStatus: keyPackageStatuses.get(installation.id),
        bytes: installation.bytes
      }));

      // Sort by creation date (newest first)
      installationsWithStatus.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
      
      setInstallations(installationsWithStatus);
    } catch (error) {
      console.error('Failed to load installations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const revokeInstallation = async (installationBytes: Uint8Array) => {
    if (!client) return;
    
    setIsRevoking(true);
    try {
      await client.revokeInstallations([installationBytes]);
      await loadInstallations(); // Refresh the list
      addToast('Installation revoked successfully!', 'success');
    } catch (error: any) {
      console.error('Failed to revoke installation:', error);
      
      // Handle specific error types
      if (error?.message?.includes('User rejected') || error?.name === 'UserRejectedRequestError' || error?.code === 4001) {
        addToast('Installation revocation cancelled by user', 'warning');
        return; // Prevent error from propagating
      } else {
        addToast('Failed to revoke installation', 'error');
      }
    } finally {
      setIsRevoking(false);
    }
  };

  const revokeAllOtherInstallations = async () => {
    if (!client) return;
    
    setIsRevoking(true);
    try {
      await client.revokeAllOtherInstallations();
      await loadInstallations(); // Refresh the list
      addToast('All other installations revoked successfully!', 'success');
    } catch (error: any) {
      console.error('Failed to revoke all other installations:', error);
      
      // Handle specific error types
      if (error?.message?.includes('User rejected') || error?.name === 'UserRejectedRequestError' || error?.code === 4001) {
        addToast('Installation revocation cancelled by user', 'warning');
        return; // Prevent error from propagating
      } else {
        addToast('Failed to revoke all other installations', 'error');
      }
    } finally {
      setIsRevoking(false);
    }
  };

  const syncPreferences = async () => {
    try {
      await client.preferences.sync();
      addToast('Preferences synced successfully!', 'success');
    } catch (error) {
      console.error('Failed to sync preferences:', error);
      addToast('Failed to sync preferences', 'error');
    }
  };

  const syncHistory = async () => {
    setHistorySyncStatus({ isRunning: true });
    
    try {
      console.log('Starting history sync...');
      
      // Step 1: Sync conversations from network
      await client.conversations.sync();
      console.log('✅ Conversations synced');
      
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
          console.log(`✅ Synced conversation ${syncedCount}/${conversations.length}`);
        } catch (error) {
          console.error('Failed to sync conversation:', error);
        }
      }
      
      // Step 4: Sync preferences
      await client.preferences.sync();
      console.log('✅ Preferences synced');
      
      setHistorySyncStatus({
        isRunning: false,
        lastSyncTime: new Date(),
        totalConversations: conversations.length,
        syncedConversations: syncedCount
      });
      
      addToast(`History sync completed! Synced ${syncedCount}/${conversations.length} conversations.`, 'success');
      
    } catch (error) {
      console.error('Failed to sync history:', error);
      setHistorySyncStatus({ isRunning: false });
      addToast('Failed to sync history', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          <div className="space-y-6">
            
            {/* Account Information */}
            <div className="border border-gray-600 rounded-lg p-4 bg-gray-900">
              <h3 className="text-lg font-semibold text-white mb-4">Account Information</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Connected Address:</span>
                  <span className="text-white font-mono text-sm break-all">
                    {client.accountIdentifier?.identifier || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Inbox ID:</span>
                  <span className="text-white font-mono text-sm">
                    {client.inboxId ? formatInboxId(client.inboxId) : 'Loading...'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Installation ID:</span>
                  <span className="text-white font-mono text-sm">
                    {client.installationId ? `${client.installationId.slice(0, 8)}...${client.installationId.slice(-8)}` : 'Loading...'}
                  </span>
                </div>
              </div>
            </div>

            {/* Installation Management */}
            <div className="border border-gray-600 rounded-lg p-4 bg-gray-900">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Installations</h3>
                <button
                  onClick={loadInstallations}
                  disabled={isLoading}
                  className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded"
                >
                  {isLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              
              {isLoading ? (
                <div className="text-gray-400 text-center py-4">Loading installations...</div>
              ) : installations.length === 0 ? (
                <div className="text-gray-400 text-center py-4">No other installations found</div>
              ) : (
                <>
                  <div className="space-y-2 mb-4">
                    {installations.map((installation) => (
                      <div key={installation.id} className="flex items-center justify-between p-3 bg-gray-800 rounded">
                        <div className="flex-1">
                          <div className="text-white font-mono text-sm">
                            {installation.id === client.installationId ? (
                              <>
                                {installation.id.slice(0, 20)}... (Current)
                              </>
                            ) : (
                              `${installation.id.slice(0, 20)}...`
                            )}
                          </div>
                          <div className="text-gray-400 text-xs">
                            Created: {installation.createdAt.toLocaleDateString()}
                          </div>
                        </div>
                        {installation.id !== client.installationId && (
                          <button
                            onClick={() => revokeInstallation(installation.bytes)}
                            disabled={isRevoking}
                            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white text-sm px-3 py-1 rounded"
                          >
                            {isRevoking ? 'Revoking...' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {installations.filter(inst => inst.id !== client.installationId).length > 0 && (
                    <div className="flex justify-end">
                      <button
                        onClick={revokeAllOtherInstallations}
                        disabled={isRevoking}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
                      >
                        {isRevoking ? 'Revoking...' : 'Revoke All Other Installations'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* History Sync */}
            <div className="border border-gray-600 rounded-lg p-4 bg-gray-900">
              <h3 className="text-lg font-semibold text-white mb-4">History Sync</h3>
              <div className="space-y-3">
                <button
                  onClick={syncHistory}
                  disabled={historySyncStatus.isRunning}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
                >
                  {historySyncStatus.isRunning ? 'Syncing...' : 'Sync History'}
                </button>
                
                {historySyncStatus.isRunning && (
                  <div className="text-sm text-blue-400">
                    {historySyncStatus.totalConversations ? 
                      `Syncing ${historySyncStatus.syncedConversations || 0}/${historySyncStatus.totalConversations} conversations...` :
                      'Fetching conversations...'
                    }
                  </div>
                )}
                
                {historySyncStatus.lastSyncTime && (
                  <div className="text-sm text-gray-400">
                    Last sync: {historySyncStatus.lastSyncTime.toLocaleString()}
                  </div>
                )}
                
                <div className="text-sm text-gray-400">
                  Sync messages and conversations across all your devices
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="border border-gray-600 rounded-lg p-4 bg-gray-900">
              <h3 className="text-lg font-semibold text-white mb-4">Preferences</h3>
              <div className="space-y-3">
                <button
                  onClick={syncPreferences}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
                >
                  Sync Preferences
                </button>
                <div className="text-sm text-gray-400">
                  Sync consent preferences and HMAC keys across installations
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
} 