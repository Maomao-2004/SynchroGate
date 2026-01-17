import React, { createContext, useEffect, useState, useContext } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { triggerOfflineSync } from '../offline/syncWorker'; // Added import for sync
import { sendAllQueuedMessages } from '../offline/queuedMessageSender';

export const NetworkContext = createContext();

export const NetworkProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected;
      const wasOffline = !isConnected && online; // Detect transition from offline to online
      
      setIsConnected(online);

      if (online) {
        console.log('[Network] Back online. Starting offline sync...');
        triggerOfflineSync()
          .then(result => {
            console.log('[Network] Sync completed:', result);
          })
          .catch(err => {
            console.error('[Network] Sync failed:', err.message);
          });

        // Send queued messages when connection is restored (user will be retrieved from AsyncStorage if needed)
        if (wasOffline) {
          console.log('[Network] Connection restored. Sending queued messages...');
          // Try to get user ID from AsyncStorage or use a global approach
          sendAllQueuedMessages(null) // Will find all pending messages regardless of user
            .then(() => {
              console.log('[Network] Queued messages processing completed');
            })
            .catch(err => {
              console.error('[Network] Error sending queued messages:', err);
            });
        }
      } else {
        console.log('[Network] Offline mode activated.');
      }
    });

    return () => unsubscribe();
  }, [isConnected]);

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {children}
    </NetworkContext.Provider>
  );
};
