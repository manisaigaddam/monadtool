import React, { useState, useEffect, useCallback } from 'react';
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

  // Helper to load conversation display names and wallet addresses
  const loadConversationInfo = async (conversations: ConversationWithMessages[], clientInboxId: string) => {
    const newDisplayNames = new Map<string, string>();
    const newWalletAddresses = new Map<string, string | null>();
    
    console.log('Loading conversation info for', conversations.length, 'conversations');

    // Load conversation info in parallel for better performance
    const conversationInfoPromises = conversations.map(async (conversation) => {
      try {
        console.log('Loading info for conversation:', conversation.id);
        const { displayName, walletAddress } = await getConversationDisplayNameWithAddress(conversation, clientInboxId);
        
        console.log('Loaded conversation info:', {
          conversationId: conversation.id,
          displayName,
          walletAddress
        });
        
        return { id: conversation.id, displayName, walletAddress };
      } catch (error) {
        console.error('Error loading conversation info for conversation:', conversation.id, error);
        return { id: conversation.id, displayName: 'Chat', walletAddress: null };
      }
    });
    
    const results = await Promise.all(conversationInfoPromises);
    
    results.forEach(({ id, displayName, walletAddress }) => {
      newDisplayNames.set(id, displayName);
      newWalletAddresses.set(id, walletAddress);
    });

    console.log('Final conversation info:', {
      displayNames: Object.fromEntries(newDisplayNames),
      walletAddresses: Object.fromEntries(newWalletAddresses)
    });
    
    setConversationDisplayNames(newDisplayNames);
    setConversationWalletAddresses(newWalletAddresses);
  };

  // Phase I: Connect to XMTP
  const connectToXMTP = useCallback(async () => {
    if (!address || !walletClient || isConnectingXMTP) return;
    setIsConnectingXMTP(true);
    try {
      // Always create a fresh signer
      const signer = createXMTPSigner(walletClient, address);
      // Always use the correct env (from config or default)
      const client = await xmtpClientManager.connect(signer);
      setXmtpClient(client);
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
      console.log('🔄 Loading conversations with history sync...');
      
      // Phase III: Automatic history sync when loading conversations
      // This syncs conversations and messages from the network to local storage
      await client.conversations.sync();
      console.log('✅ Conversations synced from network');
      
      // List conversations from local storage (now includes synced data)
      const convos = await client.conversations.list();
      console.log(`📝 Found ${convos.length} conversations`);
      
      const conversationsWithMessages = await Promise.all(
        convos.map(async (convo: any, index: number) => {
          try {
            // Sync individual conversation messages
            await convo.sync();
            console.log(`✅ Synced conversation ${index + 1}/${convos.length}`);
            
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
      console.log('🎉 Conversations loaded with history sync complete');
      
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
            console.error('Error loading conversation info for existing conversation:', error);
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
      console.log('Manually refreshing conversation info...');
      await loadConversationInfo(conversations, xmtpClient.inboxId);
    }
  };

  // Enhanced escrow selector UI rendering
  const renderEscrowSelector = () => {
    if (!showEscrowSelector || !selectedConversation) return null;

    const escrowIds = conversationEscrows.get(selectedConversation.id) || [];

    return (
      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 p-6 rounded-lg w-96 max-h-[80vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-white mb-4">Select Escrow to Manage</h3>
          <div className="space-y-2 mb-4">
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
            className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white">💬 XMTP Messages</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Wallet Connection */}
        {!isConnected && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white mb-4">
                Connect your wallet to start messaging
              </h3>
              <ConnectButton />
            </div>
          </div>
        )}

        {/* XMTP Connection */}
        {isConnected && !xmtpClient && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white mb-4">
                {isConnectingXMTP ? 'Connecting to XMTP...' : 'Connect to XMTP'}
              </h3>
              {isConnectingXMTP ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto"></div>
              ) : (
                <button
                  onClick={connectToXMTP}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg"
                >
                  Connect to XMTP
                </button>
              )}
            </div>
          </div>
        )}

        {/* Chat Interface */}
        {xmtpClient && (
          <>
            {/* Conversations List */}
            <div className="w-96 border-r border-gray-700 flex flex-col bg-gray-800">
              {/* New Chat Button and Settings */}
              <div className="p-4 border-b border-gray-700">
                <div className="flex space-x-2 mb-3">
                  <button
                    onClick={() => setShowNewChat(true)}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg"
                  >
                    New Message
                  </button>
                  <button
                    onClick={refreshConversationInfo}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg"
                    title="Refresh addresses"
                  >
                    🔄
                  </button>
                  <button
                    onClick={() => setShowSettings(true)}
                    className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Conversations */}
              <div className="flex-1 overflow-y-auto">
                {conversations.map((conversation, conversationIndex) => (
                  <div
                    key={generateConversationKey(conversation, conversationIndex)}
                    onClick={() => setSelectedConversation(conversation)}
                    className={`p-4 cursor-pointer border-b border-gray-700 hover:bg-gray-700 ${
                      selectedConversation?.id === conversation.id ? 'bg-gray-700' : ''
                    }`}
                  >
                    {/* Display wallet address if available */}
                    <div className="text-purple-400 text-sm font-medium">
                      {(() => {
                        const walletAddress = conversationWalletAddresses.get(conversation.id);
                        const displayName = conversationDisplayNames.get(conversation.id);
                        
                        // If we have a proper Ethereum address, show it
                        if (walletAddress && walletAddress.startsWith('0x') && walletAddress.length === 42) {
                          return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
                        }
                        
                        // Otherwise show the display name or loading
                        return displayName || 'Loading address...';
                      })()}
                    </div>
                    <div className="text-gray-300 text-xs">
                      {(() => {
                        const walletAddress = conversationWalletAddresses.get(conversation.id);
                        const peerInboxId = peerInboxIds[conversation.id];
                        
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
                    {conversation.lastMessage && (
                      <div className="text-gray-400 text-sm truncate mt-1">
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
                ))}
                
                {conversations.length === 0 && (
                  <div className="p-4 text-gray-500 text-center">
                    No conversations yet. Start a new message!
                  </div>
                )}
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-gray-900">
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-gray-700 bg-gray-800">
                  <div>
                        {/* Display wallet address in header */}
                        <div className="text-purple-400 text-lg font-medium">
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
                        <div className="text-gray-300 text-sm">
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

                  {/* Messages */}
                  <div className="flex-1 p-4 overflow-y-auto">
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

                      return (
                        <div
                          key={generateMessageKey(message, messageIndex)}
                          className={`mb-4 ${
                            message.senderInboxId === xmtpClient.inboxId
                              ? 'text-right'
                              : 'text-left'
                          }`}
                        >
                          <div
                            className={`inline-block max-w-md px-4 py-2 rounded-lg ${
                              message.senderInboxId === xmtpClient.inboxId
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-white'
                            }`}
                          >
                            <div className="whitespace-pre-wrap">
                              {renderedContent}
                            </div>
                          </div>
                          
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(Number(message.sentAtNs) / 1000000).toLocaleString('en-GB', { 
                              year: 'numeric', 
                              month: '2-digit', 
                              day: '2-digit', 
                              hour: '2-digit', 
                              minute: '2-digit', 
                              second: '2-digit' 
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Message Input */}
                  <div className="p-4 border-t border-gray-700 bg-gray-800">
                    {/* Escrow Quick Actions */}
                    <div className="flex space-x-2 mb-3">
                      <button
                        onClick={() => {
                          setEscrowModalMode('create');
                          setShowEscrowModal(true);
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                      >
                        🤝 Create Escrow
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
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                        >
                          ⚙️ Manage Escrow{(conversationEscrows.get(selectedConversation.id)?.length || 0) > 1 ? 's' : ''}
                        </button>
                      )}
                      <button
                        onClick={() => setNewMessageText('/escrow help')}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
                      >
                        ❓ Help
                      </button>
                    </div>
                    
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newMessageText}
                        onChange={(e) => setNewMessageText(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Type a message or /escrow command..."
                        className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                        disabled={isSending}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={isSending || !newMessageText.trim()}
                        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg"
                      >
                        {isSending ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-gray-500 text-center">
                    <div className="text-4xl mb-4">💬</div>
                    <div className="text-lg mb-2">Select a conversation to start messaging</div>
                    <div className="text-sm">End-to-end encrypted messaging with XMTP</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg w-96">
            <h3 className="text-lg font-semibold text-white mb-4">New Message</h3>
            <input
              type="text"
              value={newChatAddress}
              onChange={(e) => setNewChatAddress(e.target.value)}
              placeholder="Enter Ethereum address (0x...)"
              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none mb-4"
            />
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setShowNewChat(false);
                  setNewChatAddress('');
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={createNewDM}
                disabled={!newChatAddress || isCheckingAddress}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg"
              >
                {isCheckingAddress ? 'Checking...' : 'Start Chat'}
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

      {/* Enhanced Escrow Modal */}
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
      <div className="w-full text-left bg-gray-700 px-4 py-3 rounded-lg border border-gray-600">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-600 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="w-full text-left bg-gray-700 px-4 py-3 rounded-lg border border-gray-600 opacity-50">
        <div className="font-medium text-gray-400">Escrow #{escrowNumber}</div>
        <div className="text-sm text-gray-500">Failed to load</div>
      </div>
    );
  }

  const { formatPrice, getEscrowStateLabel, getEscrowStateColor } = require('../utils/escrow');

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg border border-gray-600 transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="font-medium">Escrow #{escrowNumber}</div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${getEscrowStateColor(escrow.state)}`}>
          {getEscrowStateLabel(escrow.state)}
        </span>
      </div>
      <div className="text-sm text-gray-400">
        {formatPrice(escrow.price)} MON • NFT #{escrow.tokenId.toString()}
      </div>
      <div className="text-xs text-gray-500">
        ID: {escrowId.toString()}
      </div>
    </button>
  );
}