import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Client, type Conversation, type DecodedMessage } from '@xmtp/browser-sdk';
import { 
  createXMTPSigner, 
  xmtpClientManager, 
  checkCanMessage, 
  formatAddress, 
  formatInboxId, 
  getConversationDisplayName,
  getPeerWalletAddress,
  getRecipientWalletAddress,
  getConversationDisplayNameWithAddress,
  generateMessageKey,
  generateConversationKey,
  type ContentTypes
} from '../utils/xmtp';
import {
  parseEscrowCommand,
  containsEscrowReference,
  checkConversationEscrow,
  sendEscrowCreatedAnnouncement,
  getEscrowHelpMessage,
  renderEscrowContent,
  ESCROW_COMMANDS
} from '../utils/escrowMessages';
import { getConversationEscrowDetails, getConversationEscrows } from '../utils/escrow';
import SettingsModal from './SettingsModal';
import EscrowModal from './EscrowModal';

import { useToast } from './Toast';

interface ConversationWithMessages {
  id: string;
  conversation: any; // Use any for flexibility with different conversation types
  messages: any[];
  lastMessage?: any;
}

function dedupeConversations(convos: ConversationWithMessages[]): ConversationWithMessages[] {
  const map = new Map();
  for (const convo of convos) {
    map.set(convo.id, convo);
  }
  return Array.from(map.values());
}

export default function ChatInbox() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // XMTP State
  const [xmtpClient, setXmtpClient] = useState<Client<ContentTypes> | null>(null);
  const [isConnectingXMTP, setIsConnectingXMTP] = useState(false);
  const [conversations, setConversations] = useState<ConversationWithMessages[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithMessages | null>(null);
  const [newMessageText, setNewMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  // New Conversation State
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatAddress, setNewChatAddress] = useState('');
  const [isCheckingAddress, setIsCheckingAddress] = useState(false);
  
  // UI State
  const [showSettings, setShowSettings] = useState(false);
  const [conversationDisplayNames, setConversationDisplayNames] = useState<Map<string, string>>(new Map());
  const [conversationWalletAddresses, setConversationWalletAddresses] = useState<Map<string, string | null>>(new Map());
  const [peerInboxIds, setPeerInboxIds] = useState<{ [id: string]: string }>({});
  const [selectedPeerInboxId, setSelectedPeerInboxId] = useState<string | null>(null);

  // ENHANCED: Multiple Escrow State
  const [showEscrowModal, setShowEscrowModal] = useState(false);
  const [escrowModalMode, setEscrowModalMode] = useState<'create' | 'manage'>('create');
  const [currentEscrowId, setCurrentEscrowId] = useState<bigint | undefined>();
  const [conversationEscrows, setConversationEscrows] = useState<Map<string, bigint[]>>(new Map());
  const [showEscrowSelector, setShowEscrowSelector] = useState(false);

  // Helper to save/load conversation preferences securely
  const saveConversationPreferences = async (preferences: { [key: string]: any }) => {
    try {
      if (xmtpClientManager.getEncryptedStorage()) {
        await xmtpClientManager.setSecureItem('conversation_preferences', JSON.stringify(preferences));
      }
    } catch (error) {
      console.error('Failed to save conversation preferences:', error);
    }
  };

  const loadConversationPreferences = async (): Promise<{ [key: string]: any }> => {
    try {
      const stored = await xmtpClientManager.getSecureItem('conversation_preferences');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Failed to load conversation preferences:', error);
      return {};
    }
  };

  // Helper to load conversation display names and wallet addresses
  const loadConversationInfo = async (conversations: ConversationWithMessages[], clientInboxId: string) => {
    const newDisplayNames = new Map<string, string>();
    const newWalletAddresses = new Map<string, string | null>();
    
    // Load saved preferences first
    const preferences = await loadConversationPreferences();
    
    // Load conversation info in parallel for better performance
    const conversationInfoPromises = conversations.map(async (conversation) => {
      try {
        // Check if we have cached display name
        const cachedDisplayName = preferences[`displayName_${conversation.id}`];
        const cachedWalletAddress = preferences[`walletAddress_${conversation.id}`];
        
        let displayName = cachedDisplayName;
        let walletAddress = cachedWalletAddress;
        
        // Load fresh data if not cached
        if (!displayName || !walletAddress) {
          const result = await getConversationDisplayNameWithAddress(conversation, clientInboxId);
          displayName = result.displayName;
          walletAddress = result.walletAddress;
          
          // Cache the results
          const updatedPreferences = {
            ...preferences,
            [`displayName_${conversation.id}`]: displayName,
            [`walletAddress_${conversation.id}`]: walletAddress
          };
          await saveConversationPreferences(updatedPreferences);
        }
        
        return { id: conversation.id, displayName, walletAddress };
      } catch (error) {
        return { id: conversation.id, displayName: 'Chat', walletAddress: null };
      }
    });
    
    const results = await Promise.all(conversationInfoPromises);
    
    results.forEach(({ id, displayName, walletAddress }) => {
      newDisplayNames.set(id, displayName);
      newWalletAddresses.set(id, walletAddress);
    });
    
    setConversationDisplayNames(newDisplayNames);
    setConversationWalletAddresses(newWalletAddresses);
  };

  // Phase I: Connect to XMTP with encrypted storage
  const connectToXMTP = useCallback(async () => {
    if (!address || !walletClient || isConnectingXMTP) return;
    setIsConnectingXMTP(true);
    try {
      // Always create a fresh signer
      const signer = createXMTPSigner(walletClient, address);
      // Always use the correct env (from config or default)
      const client = await xmtpClientManager.connect(signer);
      setXmtpClient(client);
      
      // Show encryption status to user
      const hasEncryption = xmtpClientManager.getEncryptedStorage() !== null;
      if (hasEncryption) {
        addToast('XMTP connected with encrypted local storage', 'success');
      } else {
        addToast('XMTP connected (encryption not available)', 'warning');
      }
      
      await loadConversations(client);
      startStreaming(client);
    } catch (error: any) {
      console.error('Failed to connect to XMTP:', error);
      if (error?.message?.includes('get_inbox_ids')) {
        addToast('XMTP error: get_inbox_ids failed. Check your network, wallet connection, and try clearing site data.', 'error');
        return;
      }
      if (error?.message?.includes('User rejected') || error?.name === 'UserRejectedRequestError' || error?.code === 4001) {
        addToast('Wallet connection cancelled by user', 'warning');
        return;
      } else if (error?.message?.includes('network')) {
        addToast('Network error. Please check your connection and try again.', 'error');
      } else {
        addToast('Failed to connect to XMTP. Please try again.', 'error');
      }
    } finally {
      setIsConnectingXMTP(false);
    }
  }, [address, walletClient, isConnectingXMTP]);

  // Phase III: Load existing conversations from local storage
  const loadConversations = async (client: Client<ContentTypes>) => {
    try {
      // Loading conversations with history sync (reduced logging)
      
      // Phase III: Automatic history sync when loading conversations
      // This syncs conversations and messages from the network to local storage
      await client.conversations.sync();
      // Conversations synced from network (reduced logging)
      
      // List conversations from local storage (now includes synced data)
      const convos = await client.conversations.list();
      console.log(`📝 Found ${convos.length} conversations`);
      
      const conversationsWithMessages = await Promise.all(
        convos.map(async (convo: any, index: number) => {
          try {
            // Sync individual conversation messages
            await convo.sync();
            // Synced conversation (reduced logging)
            
            const messages = await convo.messages();
            const lastMessage = messages[messages.length - 1];
            return {
              id: convo.id,
              conversation: convo,
              messages,
              lastMessage,
            };
          } catch (error) {
            console.error(`Failed to sync conversation ${index + 1}:`, error);
            // Return conversation without synced messages as fallback
            const messages = await convo.messages();
            const lastMessage = messages[messages.length - 1];
            return {
              id: convo.id,
              conversation: convo,
              messages,
              lastMessage,
            };
          }
        })
      );
      
      // Sort by last message timestamp
      conversationsWithMessages.sort((a: any, b: any) => {
        const aTime = a.lastMessage?.sentAtNs || BigInt(0);
        const bTime = b.lastMessage?.sentAtNs || BigInt(0);
        return Number(bTime - aTime);
      });
      
      setConversations(conversationsWithMessages);
      // Conversations loaded with history sync complete (reduced logging)
      
      // Load conversation info (display names and wallet addresses)
      if (conversationsWithMessages.length > 0 && client.inboxId) {
        await loadConversationInfo(conversationsWithMessages, client.inboxId);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
      addToast('Failed to load conversations. Some message history may not be available.', 'warning');
    }
  };

  // Phase III: Stream new conversations and messages
  const startStreaming = (client: Client<ContentTypes>) => {
    // Stream new conversations
    const streamConversations = async () => {
      try {
        const stream = await client.conversations.stream();
        for await (const conversation of stream) {
          if (!conversation) continue;
          
          const messages = await conversation.messages();
          const lastMessage = messages[messages.length - 1];
          const newConvo = {
            id: conversation.id,
            conversation,
            messages,
            lastMessage,
          };
          
          setConversations(prev => dedupeConversations([newConvo, ...prev]));
        }
      } catch (error) {
        console.error('Error streaming conversations:', error);
      }
    };
    
    // Stream new messages
    const streamMessages = async () => {
      try {
        const stream = await client.conversations.streamAllMessages();
        for await (const message of stream) {
          if (!message) continue;
          
          setConversations(prev => 
            prev.map(convo => {
              if (convo.id === message.conversationId) {
                const updatedMessages = [...convo.messages, message];
                return {
                  ...convo,
                  messages: updatedMessages,
                  lastMessage: message,
                };
              }
              return convo;
            })
          );
          
          // Update selected conversation if it's the current one
          setSelectedConversation(prev => {
            if (prev && prev.id === message.conversationId) {
              return {
                ...prev,
                messages: [...prev.messages, message],
              };
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('Error streaming messages:', error);
      }
    };
    
    streamConversations();
    streamMessages();
  };

  // Phase II: Check if identity is reachable and create DM
  const createNewDM = async () => {
    if (!xmtpClient || !newChatAddress) return;
    
    setIsCheckingAddress(true);
    try {
      // Create identity object from address for canMessage check
      const identity = {
        identifier: newChatAddress.toLowerCase(),
        identifierKind: "Ethereum" as const,
      };
      
      // Check if the identity can receive messages
      const canMessageMap = await checkCanMessage([identity]);
      const canMessage = canMessageMap.get(newChatAddress.toLowerCase());
      
      if (!canMessage) {
        addToast('This address is not reachable on XMTP', 'error');
        return;
      }
      
      // Get inbox ID for the identity (Browser SDK method)
      const inboxId = await xmtpClient.findInboxIdByIdentifier(identity);
      if (!inboxId) {
        addToast('Could not resolve inbox ID for this address', 'error');
        return;
      }
      
      // Check if DM already exists with this inbox ID
      const existingDm = await xmtpClient.conversations.getDmByInboxId(inboxId);
      if (existingDm) {
        // Find existing conversation in our list
        const existingConvo = conversations.find(conv => conv.id === existingDm.id);
        if (existingConvo) {
          setSelectedConversation(existingConvo);
          setShowNewChat(false);
          setNewChatAddress('');
          addToast('Switched to existing conversation', 'info');
          return;
        }
        
        // If not in list, add it
        const messages = await existingDm.messages();
        const lastMessage = messages[messages.length - 1];
        
        const existingConvoWithMessages = {
          id: existingDm.id,
          conversation: existingDm,
          messages,
          lastMessage,
        };
        
        setConversations(prev => dedupeConversations([existingConvoWithMessages, ...prev]));
        setSelectedConversation(existingConvoWithMessages);
        setShowNewChat(false);
        setNewChatAddress('');
        
        // Load display name and wallet address
        if (xmtpClient.inboxId) {
          try {
            const { displayName, walletAddress } = await getConversationDisplayNameWithAddress(existingConvoWithMessages, xmtpClient.inboxId);
            setConversationDisplayNames(prev => new Map(prev).set(existingConvoWithMessages.id, displayName));
            setConversationWalletAddresses(prev => new Map(prev).set(existingConvoWithMessages.id, walletAddress));
          } catch (error) {
            // Error loading conversation info (reduced logging)
          }
        }
        
        addToast('Switched to existing conversation', 'info');
        return;
      }
      
      // Create new DM using Browser SDK method
      const dm = await xmtpClient.conversations.newDm(inboxId);
      const messages = await dm.messages();
      const lastMessage = messages[messages.length - 1];
      
      const newConvo = {
        id: dm.id,
        conversation: dm,
        messages,
        lastMessage,
      };
      
      setConversations(prev => dedupeConversations([newConvo, ...prev]));
      setSelectedConversation(newConvo);
      setShowNewChat(false);
      setNewChatAddress('');
      
      // Load display name for the new conversation
      if (xmtpClient.inboxId) {
        try {
          const displayName = await getConversationDisplayName(newConvo, xmtpClient.inboxId);
          setConversationDisplayNames(prev => new Map(prev).set(newConvo.id, displayName));
        } catch (error) {
          console.error('Error loading display name for new conversation:', error);
        }
      }
      
      addToast('New conversation created', 'success');
      
    } catch (error: any) {
      console.error('Failed to create DM:', error);
      
      // Handle specific error types
      if (error?.message?.includes('User rejected') || error?.name === 'UserRejectedRequestError' || error?.code === 4001) {
        addToast('Transaction cancelled by user', 'warning');
        return; // Prevent error from propagating
      } else if (error?.message?.includes('network')) {
        addToast('Network error. Please try again.', 'error');
      } else {
        addToast('Failed to create conversation. Please try again.', 'error');
      }
    } finally {
      setIsCheckingAddress(false);
    }
  };

  // Phase II: Send message with escrow command handling
  const sendMessage = async () => {
    if (!selectedConversation || !newMessageText.trim() || isSending) return;
    
    const messageText = newMessageText.trim();
    const escrowCommand = parseEscrowCommand(messageText);
    
    // Handle escrow commands
    if (escrowCommand) {
      handleEscrowCommand(escrowCommand.command, escrowCommand.args);
      setNewMessageText('');
      return;
    }
    
    setIsSending(true);
    try {
      await selectedConversation.conversation.send(messageText);
      setNewMessageText('');
    } catch (error: any) {
      console.error('Failed to send message:', error);
      
      // Handle specific error types
      if (error?.message?.includes('User rejected') || error?.name === 'UserRejectedRequestError' || error?.code === 4001) {
        addToast('Message sending cancelled by user', 'warning');
        return; // Prevent error from propagating
      } else if (error?.message?.includes('network')) {
        addToast('Network error. Please try again.', 'error');
      } else {
        addToast('Failed to send message. Please try again.', 'error');
      }
    } finally {
      setIsSending(false);
    }
  };

  // Enhanced escrow command handling for multiple escrows
  const handleEscrowCommand = async (command: string, args?: string[]) => {
    if (!selectedConversation || !address) return;
    
    switch (command) {
      case ESCROW_COMMANDS.CREATE:
        setEscrowModalMode('create');
        setShowEscrowModal(true);
        break;
        
      case ESCROW_COMMANDS.MANAGE:
        const escrowIds = conversationEscrows.get(selectedConversation.id);
        if (escrowIds && escrowIds.length > 0) {
          if (escrowIds.length === 1) {
            // Single escrow - open directly
            setEscrowModalMode('manage');
            setCurrentEscrowId(escrowIds[0]);
            setShowEscrowModal(true);
          } else {
            // Multiple escrows - show selector
            setShowEscrowSelector(true);
          }
        } else {
          addToast('No escrows found for this conversation', 'warning');
        }
        break;
        
      case ESCROW_COMMANDS.STATUS:
        const statusEscrowIds = conversationEscrows.get(selectedConversation.id);
        if (statusEscrowIds && statusEscrowIds.length > 0) {
          // Send status for all escrows
          const statusMessage = statusEscrowIds.length === 1 
            ? `📊 Found 1 escrow - Use /escrow manage to view details`
            : `📊 Found ${statusEscrowIds.length} escrows - Use /escrow manage to select one`;
          await selectedConversation.conversation.send(statusMessage);
        } else {
          await selectedConversation.conversation.send('ℹ️ No active escrows found for this conversation');
        }
        break;
        
      case ESCROW_COMMANDS.HELP:
      default:
        await selectedConversation.conversation.send(getEscrowHelpMessage());
        break;
    }
  };

  const handleEscrowCreated = async (escrowId: bigint) => {
    if (!selectedConversation || !xmtpClient) return;
    
    // Update conversation escrows mapping - add to existing array
    setConversationEscrows(prev => {
      const newMap = new Map(prev);
      const existingEscrows = newMap.get(selectedConversation.id) || [];
      newMap.set(selectedConversation.id, [...existingEscrows, escrowId]);
      return newMap;
    });
    
    const escrowNumber = (conversationEscrows.get(selectedConversation.id)?.length || 0) + 1;
    addToast(`Escrow #${escrowNumber} created successfully!`, 'success');
  };

  const handleEscrowUpdated = () => {
    // Refresh escrow data for the conversation
    loadConversationEscrows();
  };

  // Load conversation escrows
  const loadConversationEscrows = async () => {
    if (!conversations.length) return;
    
    const escrowMap = new Map<string, bigint[]>();
    
    await Promise.all(
      conversations.map(async (conversation) => {
        try {
          // Get all escrows for this conversation
          const conversationEscrowIds = await getConversationEscrows(conversation.id);
          if (conversationEscrowIds.length > 0) {
            escrowMap.set(conversation.id, conversationEscrowIds);
          }
        } catch (error) {
          console.error('Error loading escrows for conversation:', conversation.id, error);
        }
      })
    );
    
    setConversationEscrows(escrowMap);
  };

  // Scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedConversation?.messages]);

  useEffect(() => {
    if (selectedConversation) {
      scrollToBottom();
    }
  }, [selectedConversation]);

  // Auto-connect when wallet is connected
  useEffect(() => {
    if (isConnected && address && walletClient && !xmtpClient) {
      connectToXMTP();
    }
  }, [isConnected, address, walletClient, xmtpClient, connectToXMTP]);

  // On disconnect, clear all state
  useEffect(() => {
    if (!isConnected) {
      xmtpClientManager.disconnect();
      setXmtpClient(null);
      setConversations([]);
      setSelectedConversation(null);
      setConversationDisplayNames(new Map());
    }
  }, [isConnected]);

  // Reload display names when address/inbox ID toggle changes
  useEffect(() => {
    if (conversations.length > 0 && xmtpClient?.inboxId) {
      loadConversationInfo(conversations, xmtpClient.inboxId);
    }
  }, []);

  // Load conversation escrows when conversations change
  useEffect(() => {
    if (conversations.length > 0) {
      loadConversationEscrows();
    }
  }, [conversations]);

  // Fetch peerInboxIds for all conversations when conversations change
  useEffect(() => {
    const fetchPeerInboxIds = async () => {
      const ids: { [id: string]: string } = {};
      for (const convo of conversations) {
        const peerInboxIdFn = convo.conversation?.peerInboxId;
        let peerInboxId = typeof peerInboxIdFn === 'function' ? await peerInboxIdFn.call(convo.conversation) : peerInboxIdFn;
        if (!peerInboxId) peerInboxId = convo.conversation?.id || convo.id;
        ids[convo.id] = peerInboxId;
      }
      setPeerInboxIds(ids);
    };
    fetchPeerInboxIds();
  }, [conversations]);

  // For the chat header, fetch the peerInboxId for the selected conversation
  useEffect(() => {
    const fetchSelectedPeerInboxId = async () => {
      if (!selectedConversation) {
        setSelectedPeerInboxId(null);
        return;
      }
      const peerInboxIdFn = selectedConversation.conversation?.peerInboxId;
      let peerInboxId = typeof peerInboxIdFn === 'function' ? await peerInboxIdFn.call(selectedConversation.conversation) : peerInboxIdFn;
      if (!peerInboxId) peerInboxId = selectedConversation.conversation?.id || selectedConversation.id;
      setSelectedPeerInboxId(peerInboxId);
    };
    fetchSelectedPeerInboxId();
  }, [selectedConversation]);

  // Manual refresh for conversation info
  const refreshConversationInfo = async () => {
    if (conversations.length > 0 && xmtpClient?.inboxId) {
      // Manually refreshing conversation info (reduced logging)
      await loadConversationInfo(conversations, xmtpClient.inboxId);
    }
  };

  // Enhanced escrow selector UI rendering
  const renderEscrowSelector = () => {
    if (!showEscrowSelector || !selectedConversation) return null;

    const escrowIds = conversationEscrows.get(selectedConversation.id) || [];

    return (
      <div className="modal-backdrop flex items-center justify-center z-50">
        <div className="card-primary p-4 w-96 max-h-[80vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-white mb-3">Select Escrow to Manage</h3>
          <div className="space-y-2 mb-3">
            {escrowIds.map((escrowId: bigint, index: number) => (
              <EscrowSelectorItem
                key={escrowId.toString()}
                escrowId={escrowId}
                escrowNumber={index + 1}
                conversationId={selectedConversation.id}
                onClick={() => {
                  setEscrowModalMode('manage');
                  setCurrentEscrowId(escrowId);
                  setShowEscrowModal(true);
                  setShowEscrowSelector(false);
                }}
              />
            ))}
          </div>
          <button
            onClick={() => setShowEscrowSelector(false)}
            className="w-full btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Clean Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700/30 card-primary">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white">Messages</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Wallet Connection */}
        {!isConnected && (
          <div className="flex-1 flex items-center justify-center p-8 min-h-0">
            <div className="text-center max-w-md mx-auto w-full">
              <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                Connect Your Wallet
              </h3>
              <p className="text-slate-300 mb-6 leading-relaxed">
                Connect your wallet to start sending end-to-end encrypted messages on the Monad network
              </p>
              <div className="flex justify-center">
                <ConnectButton />
              </div>
            </div>
          </div>
        )}

        {/* XMTP Connection */}
        {isConnected && !xmtpClient && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                {isConnectingXMTP ? (
                  <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                {isConnectingXMTP ? 'Connecting to XMTP...' : 'Connect to XMTP'}
              </h3>
              <p className="text-slate-300 mb-6 leading-relaxed">
                {isConnectingXMTP 
                  ? 'Setting up your encrypted messaging...' 
                  : 'Enable secure, decentralized messaging powered by XMTP protocol'
                }
              </p>
              {!isConnectingXMTP && (
                <button
                  onClick={connectToXMTP}
                  className="btn-primary"
                >
                  <span>Connect to XMTP</span>
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Chat Interface */}
        {xmtpClient && (
          <>
            {/* Conversations List */}
            <div className="w-80 border-r border-slate-700/30 flex flex-col card-primary">
              {/* Compact Controls */}
              <div className="p-3 border-b border-slate-700/30">
                <div className="flex space-x-2 mb-2">
                  <button
                    onClick={() => setShowNewChat(true)}
                    className="flex-1 btn-primary text-sm"
                  >
                    <span>New Message</span>
                  </button>
                  <button
                    onClick={refreshConversationInfo}
                    className="btn-secondary px-3"
                    title="Refresh addresses"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setShowSettings(true)}
                    className="btn-secondary px-3"
                    title="Settings"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Clean Conversations */}
              <div className="flex-1 overflow-y-auto">
                {conversations.map((conversation, conversationIndex) => {
                  const isSelected = selectedConversation?.id === conversation.id;
                  const walletAddress = conversationWalletAddresses.get(conversation.id);
                  const displayName = conversationDisplayNames.get(conversation.id);
                  const peerInboxId = peerInboxIds[conversation.id];
                  
                  return (
                    <div
                      key={generateConversationKey(conversation, conversationIndex)}
                      onClick={() => setSelectedConversation(conversation)}
                      className={`p-3 cursor-pointer border-b border-slate-700/20 transition-colors duration-200 ${
                        isSelected 
                          ? 'bg-blue-600/10 border-l-2 border-l-blue-500' 
                          : 'hover:bg-slate-700/30'
                      }`}
                    >                      
                      {/* Wallet address display */}
                      <div className="flex items-center space-x-2 mb-1">
                        <div className="w-6 h-6 bg-slate-600/50 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-sm ${
                            isSelected ? 'text-white' : 'text-slate-200'
                          }`}>
                            {(() => {
                              // If we have a proper Ethereum address, show it
                              if (walletAddress && walletAddress.startsWith('0x') && walletAddress.length === 42) {
                                return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
                              }
                              
                              // Otherwise show the display name or loading
                              return displayName || 'Loading address...';
                            })()}
                          </div>
                          <div className="text-slate-400 text-xs">
                            {(() => {
                              // If wallet address is not a proper Ethereum address, it might be an inbox ID
                              if (walletAddress && !walletAddress.startsWith('0x')) {
                                return `Inbox: ${formatInboxId(walletAddress)}`;
                              }
                              
                              // Show peer inbox ID if available
                              if (peerInboxId && peerInboxId !== 'Unknown') {
                                return `Inbox: ${formatInboxId(peerInboxId)}`;
                              }
                              
                              return 'Loading...';
                            })()}
                          </div>
                        </div>
                      </div>
                      
                      {/* Last message preview */}
                      {conversation.lastMessage && (
                        <div className={`text-xs truncate mt-1 ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}>
                          {(() => {
                            const content = conversation.lastMessage.content;
                            if (typeof content === 'string') {
                              return content;
                            } else if (content && typeof content === 'object' && 'text' in content) {
                              return content.text as string;
                            }
                            return `[${conversation.lastMessage.contentType || 'message'}]`;
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {conversations.length === 0 && (
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-slate-600/30 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-white font-medium mb-1">No conversations yet</p>
                    <p className="text-slate-400 text-sm">Start a new message to begin chatting!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
              {selectedConversation ? (
                <>
                  {/* Clean Chat Header */}
                  <div className="p-3 border-b border-slate-700/30 card-primary">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-7 h-7 bg-slate-600/50 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-base font-medium text-white">
                            {(() => {
                              const walletAddress = conversationWalletAddresses.get(selectedConversation.id);
                              const displayName = conversationDisplayNames.get(selectedConversation.id);
                              
                              // If we have a proper Ethereum address, show it
                              if (walletAddress && walletAddress.startsWith('0x') && walletAddress.length === 42) {
                                return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
                              }
                              
                              // Otherwise show the display name or loading
                              return displayName || 'Loading address...';
                            })()}
                          </div>
                          <div className="text-slate-400 text-sm">
                            {(() => {
                              const walletAddress = conversationWalletAddresses.get(selectedConversation.id);
                              
                              // If wallet address is not a proper Ethereum address, it might be an inbox ID
                              if (walletAddress && !walletAddress.startsWith('0x')) {
                                return `Inbox: ${formatInboxId(walletAddress)}`;
                              }
                              
                              // Show selected peer inbox ID if available
                              if (selectedPeerInboxId && selectedPeerInboxId !== 'Unknown') {
                                return `Inbox: ${formatInboxId(selectedPeerInboxId)}`;
                              }
                              
                              return 'Loading...';
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 p-4 overflow-y-auto bg-slate-900/20">
                    <div className="space-y-3">
                      {selectedConversation.messages.map((message, messageIndex) => {
                        const messageContent = (() => {
                          if (typeof message.content === 'string') {
                            return message.content;
                          } else if (message.content && typeof message.content === 'object') {
                            if ('text' in message.content) {
                              return message.content.text as string;
                            }
                            return `[${message.contentType || 'unknown'}]`;
                          }
                          return 'Unsupported message';
                        })();

                        const conversationEscrowIds = conversationEscrows.get(selectedConversation.id);
                        const renderedContent = renderEscrowContent(messageContent, conversationEscrowIds);
                        const hasEscrowRef = containsEscrowReference(messageContent);
                        const isOwn = message.senderInboxId === xmtpClient.inboxId;

                        return (
                          <div
                            key={generateMessageKey(message, messageIndex)}
                            className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
                              <div
                                className={`px-3 py-2 rounded-lg transition-colors duration-200 ${
                                  isOwn
                                    ? 'bg-blue-600 text-white ml-8'
                                    : 'bg-slate-700/50 text-white border border-slate-600/50 mr-8'
                                } ${hasEscrowRef ? 'border border-yellow-500/50' : ''}`}
                              >
                                <div className="whitespace-pre-wrap text-sm">
                                  {renderedContent}
                                </div>
                                
                                {/* Message timestamp */}
                                <div className={`text-xs mt-1 opacity-70 ${isOwn ? 'text-blue-100' : 'text-slate-400'}`}>
                                  {new Date(Number(message.sentAtNs) / 1000000).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                  {isOwn && (
                                    <svg className="w-3 h-3 inline ml-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>

                  {/* Message Input */}
                  <div className="p-4 border-t border-slate-700/30 card-primary">
                    {/* Compact Escrow Actions */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button
                        onClick={() => {
                          setEscrowModalMode('create');
                          setShowEscrowModal(true);
                        }}
                        className="btn-secondary text-xs"
                      >
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                        </svg>
                        <span>Create Escrow</span>
                      </button>
                      {conversationEscrows.get(selectedConversation.id)?.length && (
                        <button
                          onClick={() => {
                            const escrowIds = conversationEscrows.get(selectedConversation.id);
                            if (escrowIds && escrowIds.length > 0) {
                              if (escrowIds.length === 1) {
                                setEscrowModalMode('manage');
                                setCurrentEscrowId(escrowIds[0]);
                                setShowEscrowModal(true);
                              } else {
                                setShowEscrowSelector(true);
                              }
                            }
                          }}
                          className="btn-secondary text-xs"
                        >
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>Manage Escrow{(conversationEscrows.get(selectedConversation.id)?.length || 0) > 1 ? 's' : ''}</span>
                        </button>
                      )}
                      <button
                        onClick={() => setNewMessageText('/escrow help')}
                        className="btn-secondary text-xs"
                      >
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Help</span>
                      </button>
                    </div>
                    
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newMessageText}
                        onChange={(e) => setNewMessageText(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Type a message or /escrow command..."
                        className="input-primary flex-1 disabled:opacity-50"
                        disabled={isSending}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={isSending || !newMessageText.trim()}
                        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSending ? (
                          <div className="flex items-center">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                            <span>Sending...</span>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <span>Send</span>
                            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                          </div>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-slate-600/30 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-3">Select a conversation</h3>
                    <p className="text-slate-300 mb-2">
                      Choose a conversation from the sidebar to start messaging
                    </p>
                    <p className="text-slate-400 text-sm">
                      🔒 End-to-end encrypted messaging with XMTP protocol
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Clean New Chat Modal */}
      {showNewChat && (
        <div className="modal-backdrop flex items-center justify-center p-4">
          <div className="card-primary p-6 w-full max-w-md">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">New Message</h3>
            </div>
            <p className="text-slate-300 mb-4">Enter an Ethereum address to start a secure conversation</p>
            <input
              type="text"
              value={newChatAddress}
              onChange={(e) => setNewChatAddress(e.target.value)}
              placeholder="Enter Ethereum address (0x...)"
              className="input-primary w-full mb-4"
            />
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setShowNewChat(false);
                  setNewChatAddress('');
                }}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={createNewDM}
                disabled={!newChatAddress || isCheckingAddress}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingAddress ? (
                  <div className="flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    <span>Checking...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <span>Start Chat</span>
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {xmtpClient && (
        <SettingsModal
          client={xmtpClient}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Escrow Selector Modal */}
      {renderEscrowSelector()}

      {/* Escrow Modal */}
      {showEscrowModal && selectedConversation && (
        <EscrowModal
          isOpen={showEscrowModal}
          onClose={() => {
            setShowEscrowModal(false);
            setCurrentEscrowId(undefined);
          }}
          mode={escrowModalMode}
          conversationId={selectedConversation.id}
          peerAddress={conversationWalletAddresses.get(selectedConversation.id) || undefined}
          escrowId={currentEscrowId}
          onEscrowCreated={handleEscrowCreated}
          onEscrowUpdated={handleEscrowUpdated}
        />
      )}
    </div>
  );
}

// Helper component for escrow selector
function EscrowSelectorItem({ 
  escrowId, 
  escrowNumber, 
  conversationId, 
  onClick 
}: {
  escrowId: bigint;
  escrowNumber: number;
  conversationId: string;
  onClick: () => void;
}) {
  const [escrow, setEscrow] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEscrow = async () => {
      try {
        const { getEscrow } = await import('../utils/escrow');
        const escrowData = await getEscrow(escrowId);
        setEscrow(escrowData);
      } catch (error) {
        console.error('Error loading escrow:', error);
      } finally {
        setLoading(false);
      }
    };
    loadEscrow();
  }, [escrowId]);

  if (loading) {
    return (
      <div className="w-full text-left bg-slate-700/50 px-3 py-2 rounded-lg border border-slate-600/50">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-600 rounded w-3/4 mb-1"></div>
          <div className="h-3 bg-slate-600 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="w-full text-left bg-slate-700/50 px-3 py-2 rounded-lg border border-slate-600/50 opacity-50">
        <div className="font-medium text-slate-400">Escrow #{escrowNumber}</div>
        <div className="text-sm text-slate-500">Failed to load</div>
      </div>
    );
  }

  const { formatPrice, getEscrowStateLabel, getEscrowStateColor } = require('../utils/escrow');

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-700/50 hover:bg-slate-600/50 text-white px-4 py-3 rounded-lg border border-slate-600/50 transition-colors duration-200"
    >
      <div className="flex items-center justify-between">
        <div className="font-medium text-white">Escrow #{escrowNumber}</div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${getEscrowStateColor(escrow.state)}`}>
          {getEscrowStateLabel(escrow.state)}
        </span>
      </div>
    </button>
  );
}