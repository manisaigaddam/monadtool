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
      
      addToast(`History sync completed! Synced ${syncedCount}/${conversations.length} conversations.`, 'success');
      
    } catch (error) {
      console.error('Failed to sync history:', error);
      setHistorySyncStatus({ isRunning: false });
      addToast('Failed to sync history', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop flex items-center justify-center z-50">
      <div className="card-primary w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700/30">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-60px)]">
          <div className="space-y-4">
            
            {/* Account Information */}
            <div className="border border-slate-600/30 rounded-lg p-3 bg-slate-800/30">
              <h3 className="text-md font-medium text-white mb-3">Account Information</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Connected Address:</span>
                  <span className="text-white font-mono text-xs break-all">
                    {client.accountIdentifier?.identifier || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Inbox ID:</span>
                  <span className="text-white font-mono text-xs">
                    {client.inboxId ? formatInboxId(client.inboxId) : 'Loading...'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Installation ID:</span>
                  <span className="text-white font-mono text-xs">
                    {client.installationId ? `${client.installationId.slice(0, 8)}...${client.installationId.slice(-8)}` : 'Loading...'}
                  </span>
                </div>
              </div>
            </div>

            {/* Installation Management */}
            <div className="border border-slate-600/30 rounded-lg p-3 bg-slate-800/30">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-md font-medium text-white">Installations</h3>
                <button
                  onClick={loadInstallations}
                  disabled={isLoading}
                  className="btn-secondary text-xs"
                >
                  {isLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              
              {isLoading ? (
                <div className="text-slate-400 text-center py-3 text-sm">Loading installations...</div>
              ) : installations.length === 0 ? (
                <div className="text-slate-400 text-center py-3 text-sm">No other installations found</div>
              ) : (
                <>
                  <div className="space-y-2 mb-3">
                    {installations.map((installation) => (
                      <div key={installation.id} className="flex items-center justify-between p-2 bg-slate-700/30 rounded">
                        <div className="flex-1">
                          <div className="text-white font-mono text-xs">
                            {installation.id === client.installationId ? (
                              <>
                                {installation.id.slice(0, 20)}... (Current)
                              </>
                            ) : (
                              `${installation.id.slice(0, 20)}...`
                            )}
                          </div>
                          <div className="text-slate-400 text-xs">
                            Created: {installation.createdAt.toLocaleDateString()}
                          </div>
                        </div>
                        {installation.id !== client.installationId && (
                          <button
                            onClick={() => revokeInstallation(installation.bytes)}
                            disabled={isRevoking}
                            className="bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white text-xs px-2 py-1 rounded"
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
                        className="bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white text-xs px-3 py-1 rounded"
                      >
                        {isRevoking ? 'Revoking...' : 'Revoke All Other'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* History Sync */}
            <div className="border border-slate-600/30 rounded-lg p-3 bg-slate-800/30">
              <h3 className="text-md font-medium text-white mb-3">History Sync</h3>
              <div className="space-y-2">
                <button
                  onClick={syncHistory}
                  disabled={historySyncStatus.isRunning}
                  className="w-full btn-primary text-sm"
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
                  <div className="text-xs text-slate-400">
                    Last sync: {historySyncStatus.lastSyncTime.toLocaleString()}
                  </div>
                )}
                
                <div className="text-xs text-slate-400">
                  Sync messages and conversations across all your devices
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="border border-slate-600/30 rounded-lg p-3 bg-slate-800/30">
              <h3 className="text-md font-medium text-white mb-3">Preferences</h3>
              <div className="space-y-2">
                <button
                  onClick={syncPreferences}
                  className="btn-secondary text-sm"
                >
                  Sync Preferences
                </button>
                <div className="text-xs text-slate-400">
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