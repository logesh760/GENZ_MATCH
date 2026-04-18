/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import AuthView from './components/AuthView';
import ProfileSetup from './components/ProfileSetup';
import Dashboard from './components/Dashboard';
import ChatRoom from './components/ChatRoom';
import { Loader2, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type View = 'auth' | 'setup' | 'dashboard' | 'chat';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [currentView, setCurrentView] = useState<View>('auth');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Set online status
        const profileRef = doc(db, 'profiles', user.uid);
        const profileDoc = await getDoc(profileRef);
        
        if (profileDoc.exists()) {
          setHasProfile(true);
          setCurrentView('dashboard');
          await setDoc(profileRef, { isOnline: true, lastActive: serverTimestamp() }, { merge: true });
        } else {
          setHasProfile(false);
          setCurrentView('setup');
        }
      } else {
        setCurrentView('auth');
      }
      setLoading(false);
    });

    // Handle offline on close
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && auth.currentUser) {
        setDoc(doc(db, 'profiles', auth.currentUser.uid), { isOnline: false, lastActive: serverTimestamp() }, { merge: true });
      } else if (document.visibilityState === 'visible' && auth.currentUser) {
        setDoc(doc(db, 'profiles', auth.currentUser.uid), { isOnline: true, lastActive: serverTimestamp() }, { merge: true });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleProfileComplete = () => {
    setHasProfile(true);
    setCurrentView('dashboard');
  };

  const openChat = (chatId: string) => {
    setActiveChatId(chatId);
    setCurrentView('chat');
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-bg text-white gap-8 font-mono">
        <div className="relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
            className="w-20 h-20 border-8 border-accent border-t-transparent flex items-center justify-center p-4"
          >
             <Cpu className="w-full h-full text-accent" />
          </motion.div>
          <div className="absolute -inset-4 border-2 border-accent/20 animate-pulse" />
        </div>
        <div className="space-y-2 text-center">
          <p className="text-accent text-xl font-black uppercase tracking-[0.2em] animate-pulse">BOOTING_GENZ_MATCH</p>
          <p className="text-muted text-[10px] uppercase tracking-widest">Version//2.4.0-STABLE</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-zinc-100 font-sans selection:bg-accent/30 selection:text-white overflow-x-hidden">
      <AnimatePresence mode="wait">
        {currentView === 'auth' && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AuthView />
          </motion.div>
        )}

        {currentView === 'setup' && user && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <ProfileSetup user={user} onComplete={handleProfileComplete} />
          </motion.div>
        )}

        {currentView === 'dashboard' && user && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Dashboard user={user} onOpenChat={openChat} />
          </motion.div>
        )}

        {currentView === 'chat' && user && activeChatId && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="h-screen"
          >
            <ChatRoom 
              chatId={activeChatId} 
              currentUser={user} 
              onBack={() => setCurrentView('dashboard')} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

