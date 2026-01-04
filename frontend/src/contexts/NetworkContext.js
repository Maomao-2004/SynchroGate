import React, { createContext, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { triggerOfflineSync } from '../offline/syncWorker'; // Added import for sync

export const NetworkContext = createContext();

export const NetworkProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected;
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
      } else {
        console.log('[Network] Offline mode activated.');
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {children}
    </NetworkContext.Provider>
  );
};
