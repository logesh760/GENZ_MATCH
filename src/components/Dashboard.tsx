import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, serverTimestamp, orderBy, limit, deleteDoc, updateDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MessageSquare, User as UserIcon, LogOut, Flame, Globe, Terminal, UserPlus, Check, X, Users, MessageCircle, Menu, Instagram, Facebook } from 'lucide-react';
import { matchProfiles } from '../lib/gemini';

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

export const handleFirestoreError = (error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null) => {
  if (error.code === 'permission-denied') {
    const errorInfo: FirestoreErrorInfo = {
      error: error.message,
      operationType,
      path,
      authInfo: {
        userId: auth.currentUser?.uid || 'anonymous',
        email: auth.currentUser?.email || '',
        emailVerified: !!auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous || false,
        providerInfo: auth.currentUser?.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName || '',
          email: p.email || ''
        })) || []
      }
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw error;
};

interface Props {
  user: User;
  onOpenChat: (chatId: string) => void;
}

export default function Dashboard({ user, onOpenChat }: Props) {
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [matching, setMatching] = useState(false);
  const [matchedUser, setMatchedUser] = useState<any>(null);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  
  // Friend System State
  const [friends, setFriends] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<string[]>([]);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [viewingUser, setViewingUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'chats' | 'friends' | 'requests'>('chats');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [mobileTab, setMobileTab] = useState<'matches' | 'social'>('matches');

  useEffect(() => {
    const profileUnsub = onSnapshot(doc(db, 'profiles', user.uid), (doc) => {
      if (doc.exists()) setMyProfile(doc.data());
    });

    const q = query(collection(db, 'profiles'), where('isOnline', '==', true));
    
    const unsubscribeUsers = onSnapshot(q, 
      (snapshot) => {
        const users = snapshot.docs
          .map(doc => doc.data())
          .filter(u => u.uid !== user.uid);
        setOnlineUsers(users);
      },
      (error) => handleFirestoreError(error, 'list', 'profiles')
    );

    const chatQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(10)
    );

    const unsubscribeChats = onSnapshot(chatQuery, 
      (snapshot) => {
        setRecentChats(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, 'list', 'chats')
    );

    // Friend Requests (Incoming)
    const reqQuery = query(collection(db, 'friend_requests'), where('toId', '==', user.uid), where('status', '==', 'pending'));
    const unsubscribeReqs = onSnapshot(reqQuery, (snap) => {
      setIncomingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Outgoing Requests (to disable button)
    const outReqQuery = query(collection(db, 'friend_requests'), where('fromId', '==', user.uid), where('status', '==', 'pending'));
    const unsubscribeOutReqs = onSnapshot(outReqQuery, (snap) => {
      setOutgoingRequests(snap.docs.map(d => d.data().toId));
    });

    // Friends List
    const friendsUnsub = onSnapshot(collection(db, `profiles/${user.uid}/friends`), (snap) => {
      setFriends(snap.docs.map(d => d.data()));
    });

    // Blocks List
    const blocksQuery = query(collection(db, 'blocks'), where('blockerId', '==', user.uid));
    const unsubscribeBlocks = onSnapshot(blocksQuery, (snap) => {
      setBlockedIds(snap.docs.map(d => d.data().blockedId));
    });

    return () => {
      profileUnsub();
      unsubscribeUsers();
      unsubscribeChats();
      unsubscribeReqs();
      unsubscribeOutReqs();
      friendsUnsub();
      unsubscribeBlocks();
    };
  }, [user.uid]);

  const handleMatch = async () => {
    if (onlineUsers.length === 0) {
      alert("⚠️ NO_NODES_FOUND: The network is currently silent. Invite others to start syncing!");
      return;
    }
    setMatching(true);
    setMatchedUser(null);
    
    try {
      // 1. Filter out blocked, friends, and pending nodes
      const filteredOnline = onlineUsers.filter(u => 
        !blockedIds.includes(u.uid) && 
        !isFriend(u.uid) && 
        !hasPending(u.uid)
      );

      if (filteredOnline.length === 0) {
        alert("⚠️ NETWORK_SATURATED: You have connected with or filtered all active nodes in this region.");
        setMatching(false);
        return;
      }

      // 2. Prioritize same language, but don't strictly require it
      let candidates = filteredOnline.filter(u => u.language === myProfile?.language);
      
      // Fallback: If no same-language users, use any available filtered user
      if (candidates.length === 0) {
        candidates = filteredOnline;
      }

      // 3. Select top candidates to "Scrutinize" via AI
      const selectionPool = candidates.sort(() => 0.5 - Math.random()).slice(0, 3);
      let bestScore = -1;
      let winner = selectionPool[0];

      for (const candidate of selectionPool) {
        const score = await matchProfiles(myProfile, candidate);
        if (score > bestScore) {
          bestScore = score;
          winner = candidate;
        }
      }

      setMatchedUser({ ...winner, score: bestScore });
    } catch (e) {
      console.error(e);
      alert("⚠️ SYNC_INTERRUPTED: Network instability detected.");
    } finally {
      setMatching(false);
    }
  };

  const startChat = async (otherUserId: string) => {
    try {
      const chatId = [user.uid, otherUserId].sort().join('_');
      const chatRef = doc(db, 'chats', chatId);
      const chatDoc = await getDoc(chatRef);

      if (!chatDoc.exists()) {
        await setDoc(chatRef, {
          participants: [user.uid, otherUserId],
          updatedAt: serverTimestamp(),
        });
      }
      onOpenChat(chatId);
    } catch (e) {
      handleFirestoreError(e, 'write', 'chats');
    }
  };

  const sendRequest = async (targetUserId: string) => {
    try {
      const requestId = [user.uid, targetUserId].sort().join('_');
      await setDoc(doc(db, 'friend_requests', requestId), {
        fromId: user.uid,
        fromName: myProfile.displayName,
        toId: targetUserId,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      alert("FRIEND_PROTOCOL_SENT. Waiting for handshake...");
    } catch (e) {
      handleFirestoreError(e, 'create', 'friend_requests');
    }
  };

  const acceptRequest = async (req: any) => {
    try {
      const chatId = [user.uid, req.fromId].sort().join('_');
      
      // Fetch newest profile of the person who sent the request
      const senderProfileDoc = await getDoc(doc(db, 'profiles', req.fromId));
      const senderName = senderProfileDoc.exists() ? senderProfileDoc.data().displayName : req.fromName;

      // 1. Create Friend records
      await setDoc(doc(db, `profiles/${user.uid}/friends`, req.fromId), {
        uid: req.fromId,
        displayName: senderName || 'User',
        chatId: chatId,
        addedAt: serverTimestamp()
      });
      
      await setDoc(doc(db, `profiles/${req.fromId}/friends`, user.uid), {
        uid: user.uid,
        displayName: myProfile.displayName,
        chatId: chatId,
        addedAt: serverTimestamp()
      });

      // 2. Clear Request
      await deleteDoc(doc(db, 'friend_requests', req.id));
      
      // 3. Jump straight to chat for a fast "Handshaking" feel
      await startChat(req.fromId);
    } catch (e) {
      handleFirestoreError(e, 'write', 'friends');
    }
  };

  const isFriend = (uid: string) => friends.some(f => f.uid === uid);
  const hasPending = (uid: string) => outgoingRequests.includes(uid) || incomingRequests.some(r => r.fromId === uid);

  const removeFriend = async (friendId: string) => {
    if (!confirm("⚠️ TERMINATE_LINK: Are you sure you want to remove this node from your verified network?")) return;
    try {
      await deleteDoc(doc(db, `profiles/${user.uid}/friends`, friendId));
      await deleteDoc(doc(db, `profiles/${friendId}/friends`, user.uid));
      alert("✅ LINK_TERMINATED: Node removed from verified network.");
    } catch (e) {
      handleFirestoreError(e, 'delete', 'friends');
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg text-white selection:bg-accent/30">
      {/* Top Nav */}
      <header className="h-[60px] border-b border-white/5 bg-panel flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowMobileSidebar(true)}
            className="lg:hidden p-2 text-muted hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="font-mono font-black text-xl lg:text-2xl tracking-tighter text-accent flex items-center gap-2">
            <Terminal className="w-5 lg:w-6 h-5 lg:h-6" />
            <span className="hidden sm:inline">GENZ_MATCH.SYS</span>
            <span className="sm:hidden">GZ_M</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 lg:gap-6 font-mono text-[9px] lg:text-[10px] uppercase font-bold text-right lg:text-left">
           <div className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-2">
             <div className="flex items-center gap-1">
               <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 bg-accent rounded-full animate-pulse shadow-[0_0_8px_var(--color-accent)]" />
               <span className="text-white hidden lg:inline">VOICE_TOKENS:</span>
               <span className="text-white lg:hidden">TOK:</span>
               <span className="text-white">{myProfile?.voiceTokens || 0}</span>
             </div>
           </div>
           
           <div className="hidden sm:flex items-center gap-2">
             <div className="w-2 h-2 bg-safe rounded-full shadow-[0_0_8px_var(--color-safe)]" />
             <span className="text-white">@{myProfile?.displayName?.toLowerCase() || 'user'}</span>
           </div>

           <button onClick={() => auth.signOut()} className="text-muted hover:text-white transition-colors p-1">
             <LogOut className="w-4 h-4" />
           </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] overflow-hidden relative">
        {/* Sidebar (Left) - Desktop/Mobile Drawer */}
        <aside className={`
          fixed lg:relative inset-y-0 left-0 z-40 w-72 lg:w-auto bg-panel lg:bg-transparent
          border-r border-white/5 p-6 flex flex-col gap-8 transition-transform duration-300
          ${showMobileSidebar ? 'translate-x-0 shadow-[20px_0_60px_rgba(0,0,0,0.8)]' : '-translate-x-full lg:translate-x-0'}
          lg:flex overflow-y-auto no-scrollbar
        `}>
          <div className="lg:hidden flex justify-between items-center mb-4">
             <span className="font-mono text-accent text-xs">NODE_IDENTITY</span>
             <button onClick={() => setShowMobileSidebar(false)} className="text-muted"><X className="w-5 h-5"/></button>
          </div>
          <div>
            <span className="section-label">Your Node</span>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full border border-white/10 overflow-hidden bg-white/5 flex-shrink-0">
                {myProfile?.avatarUrl ? (
                  <img src={myProfile.avatarUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt="me" />
                ) : (
                  <UserIcon className="w-full h-full p-2 text-muted" />
                )}
              </div>
              <div className="flex flex-col min-w-0">
                 <div className="font-mono text-xs text-zinc-300 truncate">LOC: {myProfile?.country || 'UNKNOWN'}</div>
                 <div className="flex gap-2 mt-1">
                    {myProfile?.instagram && <Instagram className="w-3 h-3 text-muted" />}
                    {myProfile?.facebook && <Facebook className="w-3 h-3 text-muted" />}
                 </div>
              </div>
            </div>
            <div className="font-mono text-[10px] text-muted truncate">SONG: {myProfile?.favoriteSong || 'SILENCE'}</div>
          </div>

          <div>
            <span className="section-label">Your Filters</span>
            <div className="flex flex-wrap gap-2">
              <span className="brutal-tag brutal-tag-active">{myProfile?.language}</span>
              <span className="brutal-tag">STUDENT_18+</span>
            </div>
          </div>
          
          <div>
            <span className="section-label">Interests</span>
            <div className="flex flex-wrap gap-2">
              {myProfile?.interests?.map((it: string) => (
                <span key={it} className="brutal-tag active:bg-accent active:text-black">{it}</span>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-zinc-900">
            <span className="section-label text-accent">Security Node</span>
            <p className="font-mono text-[10px] leading-relaxed text-muted uppercase">
              Gemini-Pro Mod Active<br/>
              Safe-Chat Protocol v2.4<br/>
              <span className="text-zinc-800">AUTHORED_BY: LOGESHWARAN</span>
            </p>
          </div>
        </aside>

        {/* Match Zone */}
        <section className={`
          relative flex-1 flex flex-col items-center justify-center p-4 lg:p-8 
          bg-[radial-gradient(circle_at_center,rgba(204,255,0,0.03)_0%,#050505_100%)]
          ${mobileTab === 'matches' ? 'flex' : 'hidden lg:flex'}
        `}>
           <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
           <div className="absolute bottom-[20%] left-10 right-10 h-[1px] bg-accent/10 animate-pulse" />
           
           {!matchedUser && !matching && (
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="text-center relative z-10"
             >
               <h2 className="text-6xl font-black mb-6 leading-tight tracking-tighter">VIBE_CHECK<br/>PENDING...</h2>
               <button
                  onClick={handleMatch}
                  className="brutal-btn brutal-btn-primary px-16 py-6 text-xl"
               >
                  SCAN_NETWORK.CMD
               </button>
             </motion.div>
           )}

           {matching && (
             <div className="text-center space-y-6">
               <div className="w-24 h-24 border-8 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
               <p className="font-mono text-accent animate-pulse uppercase tracking-[0.3em]">Scrutinizing_Bios...</p>
             </div>
           )}

           {matchedUser && !matching && (
             <motion.div 
               initial={{ y: 20, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               className="brutal-card w-full max-w-[420px] p-6 lg:p-10 relative overflow-y-auto max-h-[90%] no-scrollbar"
             >
                <div className="absolute -top-4 right-6 bg-accent text-black font-mono font-black py-1 px-4 text-xs uppercase z-20">
                  AI_MATCH: {matchedUser.score}%
                </div>
                
                <h3 className="text-3xl lg:text-5xl font-black leading-none mb-3 italic">{matchedUser.displayName}</h3>
                <div className="flex justify-between items-center mb-6">
                  <div className="font-mono text-accent text-xs flex items-center gap-2">
                    <div className="w-2 h-2 bg-accent rounded-full animate-ping" />
                    {matchedUser.country} // {matchedUser.language}
                  </div>
                  <div className="flex items-center gap-3">
                    {matchedUser.instagram && (
                      <a href={`https://instagram.com/${matchedUser.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent transition-colors">
                        <Instagram className="w-4 h-4" />
                      </a>
                    )}
                    {matchedUser.facebook && (
                      <a href={matchedUser.facebook.startsWith('http') ? matchedUser.facebook : `https://facebook.com/${matchedUser.facebook}`} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent transition-colors">
                        <Facebook className="w-4 h-4" />
                      </a>
                    )}
                    {matchedUser.favoriteSong && (
                      <div className="font-mono text-[10px] text-muted flex items-center gap-1 uppercase italic">
                         ♫ {matchedUser.favoriteSong}
                      </div>
                    )}
                  </div>
                </div>

                {matchedUser.images && matchedUser.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-4 mb-4 no-scrollbar -mx-2 px-2">
                    {matchedUser.images.map((img: string, idx: number) => (
                      <img 
                        key={idx} 
                        src={img} 
                        referrerPolicy="no-referrer"
                        className="w-48 h-64 object-cover flex-shrink-0 border border-white/10 hover:border-accent/50 transition-all rounded-sm" 
                        alt={`Profile ${idx}`} 
                      />
                    ))}
                  </div>
                )}
                
                <p className="text-muted text-base lg:text-lg mb-8 leading-relaxed italic">
                  "{matchedUser.bio}"
                </p>

                <div className="flex flex-wrap gap-2 mb-10">
                   {matchedUser.interests?.map((it: string) => (
                      <span key={it} className="brutal-tag brutal-tag-active">{it}</span>
                   ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <button 
                     onClick={() => setMatchedUser(null)}
                     className="brutal-btn bg-white/5 border border-white/10 text-white py-4 text-[10px] sm:text-xs tracking-widest uppercase font-bold hover:bg-white/10"
                    >
                      SKIP_NODE
                    </button>
                   {isFriend(matchedUser.uid) ? (
                     <button 
                       onClick={() => startChat(matchedUser.uid)}
                       className="brutal-btn brutal-btn-primary py-4 text-xs flex items-center justify-center gap-2 group"
                      >
                        <MessageCircle className="w-4 h-4 group-hover:rotate-12 transition-transform" /> START_SYNC
                      </button>
                   ) : (
                     <button 
                       onClick={() => sendRequest(matchedUser.uid)}
                       disabled={hasPending(matchedUser.uid)}
                       className={`brutal-btn py-4 text-xs font-black italic tracking-wider transition-all ${
                         hasPending(matchedUser.uid) 
                           ? 'bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed shadow-none' 
                           : 'brutal-btn-primary'
                       }`}
                      >
                        {hasPending(matchedUser.uid) ? 'HANDSHAKE_PENDING' : 'INITIATE_HANDSHAKE'}
                      </button>
                   )}
                </div>
             </motion.div>
           )}
        </section>

        {/* Connections & Requests (Right Sidebar) */}
        <aside className={`
          bg-panel lg:bg-transparent border-white/5 
          ${mobileTab === 'social' ? 'block' : 'hidden lg:block'}
          flex-col p-6 border-l lg:flex
        `}>
             <div className="flex gap-4 mb-6">
                <button onClick={() => setActiveTab('chats')} className={`section-label flex items-center gap-1 transition-colors ${activeTab === 'chats' ? 'text-accent border-b border-accent' : 'hover:text-white'}`}>
                  <MessageSquare className="w-3 h-3" /> Chats
                </button>
                <button onClick={() => setActiveTab('friends')} className={`section-label flex items-center gap-1 transition-colors ${activeTab === 'friends' ? 'text-accent border-b border-accent' : 'hover:text-white'}`}>
                  <Users className="w-3 h-3" /> Friends
                </button>
                <button onClick={() => setActiveTab('requests')} className={`section-label flex items-center gap-1 transition-colors ${activeTab === 'requests' ? 'text-accent border-b border-accent' : incomingRequests.length > 0 ? 'text-danger animate-pulse' : 'hover:text-white'}`}>
                  <UserPlus className="w-3 h-3" /> Requests {incomingRequests.length > 0 && `(${incomingRequests.length})`}
                </button>
             </div>

          <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
            {activeTab === 'chats' && recentChats.filter(c => !c.participants.some((p: string) => blockedIds.includes(p))).map(chat => (
              <button
                key={chat.id}
                onClick={() => onOpenChat(chat.id)}
                className="w-full text-left p-4 bg-bg border border-white/5 hover:border-accent group transition-all"
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="font-mono text-[9px] text-accent uppercase tracking-tighter">SESS_{chat.id.slice(-6).toUpperCase()}</p>
                </div>
                <p className="font-bold text-sm truncate group-hover:text-white">Private Handshake</p>
                <p className="text-[10px] text-muted truncate mt-2 font-mono uppercase italic">{chat.lastMessage || '// LINK_ESTABLISHED'}</p>
              </button>
            ))}

            {activeTab === 'friends' && friends.filter(f => !blockedIds.includes(f.uid)).map(f => (
              <div
                key={f.uid}
                className="w-full p-4 bg-bg border border-white/5 hover:border-accent transition-all group flex items-center justify-between"
              >
                <button 
                  onClick={() => onOpenChat(f.chatId)}
                  className="flex-1 text-left"
                >
                  <p className="font-bold text-sm text-zinc-300 group-hover:text-white">{f.displayName}</p>
                  <p className="text-[10px] text-muted font-mono uppercase tracking-widest">Verified_Friend</p>
                </button>
                <div className="flex items-center gap-2">
                   <button 
                     onClick={() => removeFriend(f.uid)}
                     className="p-2 text-zinc-800 hover:text-danger hover:bg-danger/10 transition-all rounded"
                     title="Remove Friend"
                   >
                     <X className="w-4 h-4" />
                   </button>
                   <button 
                     onClick={() => onOpenChat(f.chatId)}
                     className="p-2 text-zinc-800 hover:text-accent hover:bg-accent/10 transition-all rounded"
                   >
                     <MessageCircle className="w-4 h-4" />
                   </button>
                </div>
              </div>
            ))}

            {activeTab === 'requests' && incomingRequests.filter(r => !blockedIds.includes(r.fromId)).map(req => (
              <div key={req.id} className="p-4 bg-bg border border-danger/20 space-y-3 relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-1 bg-danger/10 text-danger text-[8px] font-mono">SIGNAL_ID: {req.id.slice(0,4)}</div>
                 <div className="flex justify-between items-start">
                    <p className="font-bold text-sm italic text-white">{req.fromName}</p>
                    <button 
                      onClick={async () => {
                        const p = await getDoc(doc(db, 'profiles', req.fromId));
                        if(p.exists()) setViewingUser(p.data());
                      }}
                      className="text-[9px] font-mono text-accent hover:underline"
                    >
                      VIEW_INFO
                    </button>
                 </div>
                 <p className="font-mono text-[9px] text-muted uppercase">Incoming Connection Request...</p>
                 <div className="flex gap-2">
                    <button onClick={() => acceptRequest(req)} className="flex-1 brutal-btn brutal-btn-primary py-2 text-[10px]"><Check className="w-3 h-3" /> ACCEPT</button>
                    <button onClick={async () => await deleteDoc(doc(db, 'friend_requests', req.id))} className="flex-1 brutal-btn brutal-btn-outline border-danger/30 text-danger hover:bg-danger/10 py-2 text-[10px]"><X className="w-3 h-3" /> DENY</button>
                 </div>
              </div>
            ))}

            {activeTab === 'chats' && recentChats.length === 0 && (
              <div className="py-20 text-center">
                <p className="font-mono text-[10px] text-muted uppercase">No active communication records.</p>
              </div>
            )}
            {activeTab === 'friends' && friends.length === 0 && (
              <div className="py-20 text-center">
                <p className="font-mono text-[10px] text-muted uppercase">Network empty. Find friends.</p>
              </div>
            )}
            {activeTab === 'requests' && incomingRequests.length === 0 && (
              <div className="py-20 text-center">
                <p className="font-mono text-[10px] text-muted uppercase">No pending signal requests.</p>
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Bottom Nav for Mobile */}
      <footer className="lg:hidden h-[70px] border-t border-white/5 bg-panel grid grid-cols-2 z-50">
        <button 
          onClick={() => setMobileTab('matches')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${mobileTab === 'matches' ? 'text-accent' : 'text-muted'}`}
        >
          <Search className="w-6 h-6" />
          <span className="font-mono text-[9px] uppercase font-bold">DISCOVERY</span>
        </button>
        <button 
          onClick={() => setMobileTab('social')}
          className={`relative flex flex-col items-center justify-center gap-1 transition-colors ${mobileTab === 'social' ? 'text-accent' : 'text-muted'}`}
        >
          <MessageSquare className="w-6 h-6" />
          <span className="font-mono text-[9px] uppercase font-bold">SOCIAL_NET</span>
          {incomingRequests.length > 0 && (
            <span className="absolute top-3 right-1/3 w-2 h-2 bg-danger rounded-full animate-pulse" />
          )}
        </button>
      </footer>

      {showMobileSidebar && (
        <div 
          onClick={() => setShowMobileSidebar(false)}
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30" 
        />
      )}

      {/* Info Modal */}
      <AnimatePresence>
        {viewingUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm brutal-card bg-panel p-8 relative"
            >
              <button onClick={() => setViewingUser(null)} className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center mb-6 relative group">
                  <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center border border-accent/30 overflow-hidden bg-accent/20">
                    {viewingUser.avatarUrl ? (
                      <img src={viewingUser.avatarUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt="avatar" />
                    ) : (
                      <UserIcon className="w-10 h-10 text-accent" />
                    )}
                  </div>
                  <h3 className="text-2xl font-black italic text-white uppercase">{viewingUser.displayName}</h3>
                  <div className="flex items-center justify-center gap-3 mt-1">
                    <p className="font-mono text-[9px] text-accent uppercase tracking-widest">{viewingUser.gender} // {viewingUser.country}</p>
                    {viewingUser.instagram && (
                      <a href={`https://instagram.com/${viewingUser.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent">
                        <Instagram className="w-3 h-3" />
                      </a>
                    )}
                    {viewingUser.facebook && (
                      <a href={viewingUser.facebook.startsWith('http') ? viewingUser.facebook : `https://facebook.com/${viewingUser.facebook}`} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent">
                        <Facebook className="w-3 h-3" />
                      </a>
                    )}
                  </div>
               </div>

               {viewingUser.images && viewingUser.images.length > 0 && (
                 <div className="flex gap-2 overflow-x-auto pb-4 mb-4 no-scrollbar">
                    {viewingUser.images.map((img: string, idx: number) => (
                      <img 
                        key={idx} 
                        src={img} 
                        referrerPolicy="no-referrer"
                        className="w-24 h-32 object-cover flex-shrink-0 border border-white/5 rounded-sm" 
                        alt="gallery"
                      />
                    ))}
                 </div>
               )}

               <div className="space-y-4 font-mono text-xs">
                  <div className="p-3 bg-bg border border-white/5 italic text-muted">
                     "{viewingUser.bio || 'No transmission data.'}"
                  </div>
                  <div className="flex flex-wrap gap-2">
                     {viewingUser.interests?.map((it: string) => (
                       <span key={it} className="px-2 py-1 bg-white/5 border border-white/10 text-[9px] uppercase">{it}</span>
                     ))}
                  </div>
               </div>

              <button 
                onClick={() => setViewingUser(null)}
                className="w-full brutal-btn brutal-btn-primary mt-8 py-3 text-xs"
              >
                CLOSE_TERMINAL
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
