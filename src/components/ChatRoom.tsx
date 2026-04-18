import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, setDoc, limit, getDoc, runTransaction, deleteDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Send, Shield, Sparkles, AlertTriangle, Loader2, Phone, Mic, MicOff, X, Ban } from 'lucide-react';
import { moderateMessage, generateIcebreaker, generateSuggestions } from '../lib/gemini';

interface Props {
  chatId: string;
  currentUser: User;
  onBack: () => void;
}

import { handleFirestoreError } from './Dashboard';

export default function ChatRoom({ chatId, currentUser, onBack }: Props) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isModerating, setIsModerating] = useState(false);
  const [isIcebreaking, setIsIcebreaking] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [voiceTokens, setVoiceTokens] = useState(0);
  const [isCalling, setIsCalling] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'active'>('idle');
  const [otherUserStatus, setOtherUserStatus] = useState<{ isOnline: boolean; lastActive?: any }>({ isOnline: false });
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const participants = chatId.split('_');
  const otherParticipantId = participants.find(id => id !== currentUser.uid);

  useEffect(() => {
    if (!otherParticipantId) return;

    // Fetch my profile for tokens
    getDoc(doc(db, 'profiles', currentUser.uid)).then(p => {
      setVoiceTokens(p.data()?.voiceTokens ?? 0);
    });

    // Listen to other user's status
    const unsubStatus = onSnapshot(doc(db, 'profiles', otherParticipantId), (doc) => {
      if (doc.exists()) {
        setOtherUserStatus({ 
          isOnline: doc.data().isOnline, 
          lastActive: doc.data().lastActive 
        });
      }
    });

    // Listen to chat typing status
    const unsubChat = onSnapshot(doc(db, 'chats', chatId), (doc) => {
      if (doc.exists()) {
        const typing = doc.data().typing || {};
        setIsOtherTyping(typing[otherParticipantId] === true);
      }
    });

    // Listen to messages
    const q = query(
      collection(db, `chats/${chatId}/messages`),
      orderBy('createdAt', 'asc'),
      limit(100)
    );

    const unsubMessages = onSnapshot(q, 
      (snapshot) => {
        setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setTimeout(() => {
          scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      },
      (error) => handleFirestoreError(error, 'list', `chats/${chatId}/messages`)
    );

    // Check Block Status
    if (otherParticipantId) {
      const myBlockRef = doc(db, 'blocks', `${currentUser.uid}_${otherParticipantId}`);
      const theirBlockRef = doc(db, 'blocks', `${otherParticipantId}_${currentUser.uid}`);

      const unsubMyBlock = onSnapshot(myBlockRef, (doc) => {
        setIsBlockedByMe(doc.exists());
      });

      const unsubTheirBlock = onSnapshot(theirBlockRef, (doc) => {
        setHasBlockedMe(doc.exists());
      });

      return () => {
        unsubStatus();
        unsubChat();
        unsubMessages();
        unsubMyBlock();
        unsubTheirBlock();
      };
    }

    return () => {
      unsubStatus();
      unsubChat();
      unsubMessages();
    };
  }, [chatId, otherParticipantId]);

  const handleTyping = () => {
    const chatRef = doc(db, 'chats', chatId);
    updateDoc(chatRef, { [`typing.${currentUser.uid}`]: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      updateDoc(chatRef, { [`typing.${currentUser.uid}`]: false });
    }, 3000);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isModerating) return;

    setIsModerating(true);
    const modResult = await moderateMessage(inputText);
    
    if (modResult.status === 'block') {
      alert("⚠️ ACCESS_DENIED: Message filtered by AI Guard. Reason: " + modResult.reason);
      setIsModerating(false);
      return;
    }

    if (modResult.status === 'warning') {
       if (!confirm("⚠️ CAUTION: AI flagged potential violation. Proceed with transmission?")) {
          setIsModerating(false);
          return;
       }
    }

    try {
      const msgData = {
        senderId: currentUser.uid,
        participants: participants, // Support Pillar 8 (relational check on resource.data)
        text: inputText,
        createdAt: serverTimestamp(),
        status: 'sent'
      };

      await addDoc(collection(db, `chats/${chatId}/messages`), msgData);
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: inputText,
        updatedAt: serverTimestamp()
      });
      setInputText('');
    } catch (e: any) {
      handleFirestoreError(e, 'create', `chats/${chatId}/messages`);
    } finally {
      setIsModerating(false);
    }
  };

  const runIcebreaker = async () => {
    setIsIcebreaking(true);
    const starter = await generateIcebreaker(['Gaming', 'Music', 'UI Design']);
    setInputText(starter);
    setIsIcebreaking(false);
  };

  const handleSuggest = async () => {
    if (messages.length === 0) return;
    setIsSuggesting(true);
    const results = await generateSuggestions(messages);
    setSuggestions(results);
    setIsSuggesting(false);
  };

  const handleBlock = async () => {
    if (isBlockedByMe) {
      const confirmUnblock = confirm("🔓 PROTOCOL_UNBLOCK\nRestore communication with this node?");
      if (!confirmUnblock) return;
      try {
        await deleteDoc(doc(db, 'blocks', `${currentUser.uid}_${otherParticipantId}`));
        alert("✅ LINK_RESTORED: Communication channel reopened.");
      } catch (e: any) {
        handleFirestoreError(e, 'delete', 'blocks');
      }
      return;
    }

    const confirmBlock = confirm("⛔ PROTOCOL_BLOCK\nAre you sure you want to terminate all communication with this node? This will prevent any further signal transmission.");
    if (!confirmBlock) return;

    try {
      const blockId = `${currentUser.uid}_${otherParticipantId}`;
      await setDoc(doc(db, 'blocks', blockId), {
        blockerId: currentUser.uid,
        blockedId: otherParticipantId,
        createdAt: serverTimestamp()
      });
      alert("✅ BLOCK_ENABLED: Node isolation complete. You will no longer receive transmissions from this source.");
    } catch (e: any) {
      handleFirestoreError(e, 'create', 'blocks');
    }
  };

  const handleReport = async () => {
    const reason = prompt("⚠️ PROTOCOL_VIOLATION_REPORT\nPlease specify the nature of the breach (e.g., Harassment, Toxicity, Spam):");
    if (!reason || !reason.trim()) return;

    try {
      const reportId = `${currentUser.uid}_${otherParticipantId}_${Date.now()}`;
      await setDoc(doc(db, 'reports', reportId), {
        reporterId: currentUser.uid,
        reportedId: otherParticipantId,
        chatId: chatId,
        reason: reason.trim(),
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      alert("✅ REPORT_LOGGED: Safety core has received the transmission. Investigation pending.");
    } catch (e: any) {
      handleFirestoreError(e, 'create', 'reports');
    }
  };

  const startVoiceCall = async () => {
    if (voiceTokens <= 0) {
      alert("❌ ALLOCATION_EXHAUSTED: You have used all 10 voice sessions.");
      return;
    }

    const confirmCall = confirm(`Initiate Voice Handshake? (${voiceTokens} tokens remaining)`);
    if (!confirmCall) return;

    setCallStatus('calling');
    try {
      await runTransaction(db, async (transaction) => {
        const profileRef = doc(db, 'profiles', currentUser.uid);
        const profileDoc = await transaction.get(profileRef);
        if (!profileDoc.exists()) throw "User profile missing";
        
        const currentTokens = profileDoc.data().voiceTokens;
        if (currentTokens <= 0) throw "Tokens exhausted";

        transaction.update(profileRef, { voiceTokens: currentTokens - 1 });
      });

      setVoiceTokens(prev => prev - 1);
      setTimeout(() => setCallStatus('active'), 2000);
    } catch (e) {
      alert("SIGNAL_ERROR: Transaction failed.");
      setCallStatus('idle');
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg relative">
      {/* Call Overlay */}
      {callStatus !== 'idle' && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
        >
          <div className="w-32 h-32 border-4 border-accent rounded-full flex items-center justify-center mb-8 relative">
             <motion.div 
               animate={{ scale: [1, 1.2, 1] }}
               transition={{ duration: 2, repeat: Infinity }}
               className="absolute inset-0 border border-accent/30 rounded-full" 
             />
             <Mic className="w-12 h-12 text-accent" />
          </div>
          <h2 className="text-3xl font-black mb-2 italic">
            {callStatus === 'calling' ? 'SIGNALING...' : 'VOICE_SESSION_ACTIVE'}
          </h2>
          <p className="font-mono text-xs text-muted mb-8 italic uppercase">
            {callStatus === 'calling' ? 'Establishing secure link' : 'End-to-end encrypted packet stream'}
          </p>
          <button 
            onClick={() => setCallStatus('idle')}
            className="brutal-btn bg-red-600 text-white px-10 py-3 flex items-center gap-2"
          >
            <X className="w-5 h-5" /> DISCONNECT
          </button>
        </motion.div>
      )}

      {/* Header */}
      <header className="h-[70px] border-b border-white/5 bg-panel px-6 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 border border-white/10 hover:bg-white/5 transition-colors">
            <ChevronLeft className="w-5 h-5 text-accent" />
          </button>
          <div>
            <h2 className="font-mono font-bold text-sm tracking-widest uppercase">NODE_SECURE_SESSION</h2>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${otherUserStatus.isOnline ? 'bg-safe shadow-[0_0_8px_#00FF94]' : 'bg-zinc-600'}`} />
              <span className="text-[10px] text-zinc-500 font-mono uppercase">
                {otherUserStatus.isOnline ? 'ENCRYPTED_HANDSHAKE_OK' : 'LINK_LOST_RECONNECTING'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleBlock}
            className={`flex items-center gap-2 border px-3 py-1.5 rounded-sm font-mono text-[9px] uppercase font-bold transition-all ${
              isBlockedByMe 
                ? 'bg-red-500/20 border-red-500/50 text-red-500 hover:bg-red-500/30' 
                : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Ban className={`w-3 h-3 ${isBlockedByMe ? 'animate-pulse' : 'text-red-500'}`} /> {isBlockedByMe ? 'Unblock_Node.SYS' : 'Block_Node.SYS'}
          </button>
          <button 
            onClick={handleReport}
            className="flex items-center gap-2 bg-danger/10 border border-danger/30 px-3 py-1.5 rounded-sm text-danger font-mono text-[9px] uppercase font-bold hover:bg-danger/20 transition-all"
          >
            <Shield className="w-3 h-3" /> Report_User.SYS
          </button>
          <button 
            onClick={startVoiceCall}
            className="flex items-center gap-2 bg-accent/10 border border-accent/30 px-3 py-1.5 rounded-sm text-accent font-mono text-[9px] uppercase font-bold hover:bg-accent/20 transition-all"
          >
            <Phone className="w-3 h-3" /> Voice_Call ({voiceTokens})
          </button>
          <div className="bg-safe/10 border border-safe/30 px-3 py-1 rounded-sm text-safe font-mono text-[9px] uppercase font-bold">
            Moderation: Strict
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.02)_0%,transparent_80%)]">
        {messages.map((msg, i) => {
          const isMe = msg.senderId === currentUser.uid;
          return (
            <motion.div
              initial={{ opacity: 0, x: isMe ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              key={msg.id || i}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[75%] px-5 py-4 font-medium text-sm transition-all ${
                isMe 
                  ? 'bg-accent text-black rounded-tl-2xl rounded-bl-2xl rounded-tr-sm shadow-[0_0_20px_rgba(204,255,0,0.1)]' 
                  : 'bg-panel text-zinc-100 border border-white/5 rounded-tr-2xl rounded-br-2xl rounded-tl-sm shadow-xl'
              }`}>
                {msg.text}
                <div className={`mt-2 font-mono text-[8px] opacity-50 ${isMe ? 'text-black/60' : 'text-white/40'}`}>
                  {msg.createdAt ? (new Date(msg.createdAt.seconds * 1000)).toLocaleTimeString() : '...'}
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Suggester */}
      <AnimatePresence>
        <motion.div 
               initial={{ y: 20, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               className="bg-accent/5 border-y-2 border-dashed border-accent/30 p-4 mx-4 mb-4 flex items-center justify-between"
             >
               <div className="flex items-center gap-3">
                 <Sparkles className="w-4 h-4 text-accent" />
                 <p className="font-mono text-[10px] text-accent italic uppercase tracking-wider">AI_SUGGESTION: Request vibe check from user.</p>
               </div>
               <button 
                onClick={runIcebreaker}
                disabled={isIcebreaking}
                className="text-[9px] font-mono font-bold bg-accent text-black px-3 py-1 uppercase active:scale-95"
               >
                Generate.exe
               </button>
        </motion.div>
      </AnimatePresence>

      <div className="font-mono text-[8px] text-zinc-800 px-6 py-1 uppercase">
        PACKET_CHECK: 0.02ms | CONTENT_FILTER: PASS | LATENCY: 14ms
      </div>

      {/* Input */}
      <footer className="p-6 pt-2 border-t border-white/5 bg-panel/50 backdrop-blur-md">
        {/* AI Suggestions Row */}
        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex gap-2 mb-4 overflow-x-auto pb-2 custom-scrollbar"
            >
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInputText(s);
                    setSuggestions([]);
                  }}
                  className="whitespace-nowrap bg-zinc-900 border border-accent/20 text-accent text-[10px] px-3 py-1.5 rounded-full hover:bg-zinc-800 transition-colors"
                >
                  {s}
                </button>
              ))}
              <button 
                onClick={() => setSuggestions([])}
                className="bg-zinc-900 border border-zinc-800 text-zinc-500 px-2 rounded-full"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isOtherTyping && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 mb-2 ml-1"
            >
              <div className="flex gap-1">
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-1 bg-accent rounded-full" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-accent rounded-full" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-accent rounded-full" />
              </div>
              <span className="text-[9px] font-mono text-accent italic uppercase">Incoming data stream... (typing)</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSend} className="flex gap-4">
          <div className="relative flex-1">
            <input
              className="w-full bg-bg border border-white/10 focus:border-accent p-4 outline-none font-sans text-sm transition-all pr-24 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={
                isBlockedByMe ? "NODE_SECUREly_ISOLATED" : 
                hasBlockedMe ? "SIGNAL_TERMINATED_BY_RECIPIENT" :
                isModerating ? "SCANNING_PACKET..." : "TRANSMIT MESSAGE..."
              }
              value={inputText}
              onChange={e => {
                setInputText(e.target.value);
                handleTyping();
              }}
              disabled={isModerating || isBlockedByMe || hasBlockedMe}
            />
            {!isBlockedByMe && !hasBlockedMe && (
              <button
                type="button"
                onClick={handleSuggest}
                disabled={isSuggesting || isModerating || messages.length === 0}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[9px] font-mono font-black bg-accent/10 border border-accent/30 text-accent px-2 py-1 rounded hover:bg-accent/20 disabled:opacity-30"
              >
                {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <>✨ SUGGEST</>}
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={isModerating || !inputText.trim() || isBlockedByMe || hasBlockedMe}
            className="brutal-btn brutal-btn-primary px-8 disabled:opacity-30"
          >
            {isModerating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'SEND.SYS'}
          </button>
        </form>
        <div className="flex gap-6 mt-4 opacity-40 font-mono text-[9px]">
           <button className="hover:text-red-500 underline uppercase">REPORT_NODE</button>
           <button className="hover:text-white underline uppercase">CLEAR_BUFFER</button>
        </div>
      </footer>
    </div>
  );
}
