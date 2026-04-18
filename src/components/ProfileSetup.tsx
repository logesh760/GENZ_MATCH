import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { motion } from 'motion/react';
import { UserCircle, Terminal, Languages, Heart, Cpu, Globe, Users } from 'lucide-react';

interface Props {
  user: User;
  onComplete: () => void;
}

export default function ProfileSetup({ user, onComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    displayName: user.displayName || '',
    gender: 'other',
    language: 'English',
    country: '',
    favoriteSong: '',
    bio: '',
    interests: '',
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, `profiles/${user.uid}/friends`), (snap) => {
      setFriends(snap.docs.map(d => d.data()));
    });
    return () => unsub();
  }, [user.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setDoc(doc(db, 'profiles', user.uid), {
        uid: user.uid,
        displayName: formData.displayName,
        gender: formData.gender,
        language: formData.language,
        country: formData.country,
        favoriteSong: formData.favoriteSong,
        voiceTokens: 10, // Default 10 sessions
        bio: formData.bio,
        interests: formData.interests.split(',').map(s => s.trim()).filter(s => s !== ''),
        isOnline: true,
        lastActive: new Date().toISOString(),
        avatarUrl: user.photoURL,
      });
      onComplete();
    } catch (error) {
      console.error("Profile Setup Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 lg:p-8 pt-12 lg:pt-16 h-screen overflow-y-auto pr-2 lg:pr-4 custom-scrollbar">
      <div className="mb-8 lg:mb-12 border-l-4 lg:border-l-8 border-accent pl-4 lg:pl-8">
        <h2 className="text-4xl lg:text-6xl font-black mb-2 italic">BIO_DATA.INIT</h2>
        <p className="font-mono text-accent text-[10px] lg:text-sm uppercase tracking-widest">Registering Student Identity to Network...</p>
      </div>

      <form onSubmit={handleSubmit} className="brutal-card p-6 lg:p-10 space-y-6 lg:space-y-8 bg-panel shadow-2xl mb-20 border border-white/5 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] to-transparent pointer-events-none" />
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <label className="section-label flex items-center gap-2">
              <UserCircle className="w-4 h-4" /> 01_DISPLAY_NAME
            </label>
            <input
              required
              className="w-full bg-bg border border-white/10 focus:border-accent p-4 outline-none font-bold text-lg text-white transition-all"
              value={formData.displayName}
              onChange={e => setFormData({ ...formData, displayName: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="section-label">02_GENDER</label>
              <select
                className="w-full bg-bg border border-white/10 focus:border-accent p-4 outline-none font-mono text-sm uppercase text-white transition-all cursor-pointer"
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value })}
              >
                <option value="male" className="bg-panel">MALE</option>
                <option value="female" className="bg-panel">FEMALE</option>
                <option value="other" className="bg-panel">OTHER/PRIVATE</option>
              </select>
            </div>
            <div className="space-y-4">
              <label className="section-label flex items-center gap-2">
                <Languages className="w-4 h-4" /> 03_PRIMARY_LANG
              </label>
              <input
                required
                className="w-full bg-bg border border-white/10 focus:border-accent p-4 outline-none font-bold italic text-white transition-all"
                value={formData.language}
                onChange={e => setFormData({ ...formData, language: e.target.value })}
                placeholder="e.g. TAMIL, ENG..."
              />
            </div>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="section-label flex items-center gap-2">
              <Globe className="w-4 h-4" /> 04_LOCATION_COUNTRY
            </label>
            <input
              required
              className="w-full bg-bg border border-white/10 focus:border-accent p-4 outline-none font-mono text-sm uppercase text-white transition-all"
              value={formData.country}
              onChange={e => setFormData({ ...formData, country: e.target.value })}
              placeholder="e.g. INDIA, USA..."
            />
          </div>
          <div className="space-y-4">
            <label className="section-label flex items-center gap-2">
               05_FAVORITE_SONG
            </label>
            <input
              className="w-full bg-bg border border-white/10 focus:border-accent p-4 outline-none font-bold italic text-white transition-all"
              value={formData.favoriteSong}
              onChange={e => setFormData({ ...formData, favoriteSong: e.target.value })}
              placeholder="Vibe of the week..."
            />
          </div>
        </div>

        <div className="space-y-4">
          <label className="section-label flex items-center gap-2">
            <Terminal className="w-4 h-4" /> 06_TRANSMISSION_BIO
          </label>
          <textarea
            className="w-full bg-bg border border-white/10 focus:border-accent p-4 h-32 resize-none outline-none italic text-zinc-400 transition-all"
            placeholder="What defines your vibe?"
            value={formData.bio}
            onChange={e => setFormData({ ...formData, bio: e.target.value })}
          />
        </div>

        <div className="space-y-4">
          <label className="section-label flex items-center gap-2">
            <Heart className="w-4 h-4" /> 07_INTEREST_TAGS
          </label>
          <input
            className="w-full bg-bg border border-white/10 focus:border-accent p-4 outline-none font-mono text-sm text-white transition-all"
            placeholder="CODING, ANIME, ART..."
            value={formData.interests}
            onChange={e => setFormData({ ...formData, interests: e.target.value })}
          />
        </div>
      </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full brutal-btn brutal-btn-primary text-xl active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-4">
               <Cpu className="w-6 h-6 animate-spin" />
               ENCRYPTING...
            </div>
          ) : 'COMMIT_PROFILE.EXE'}
        </button>
      </form>

      {friends.length > 0 && (
        <div className="brutal-card p-10 bg-panel border border-white/5 mb-20 relative">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-6 h-6 text-accent" />
            <h3 className="text-2xl font-black italic uppercase">Verified_Connections</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {friends.map(f => (
              <div key={f.uid} className="p-4 bg-bg border border-white/5 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-zinc-300">{f.displayName}</p>
                  <p className="font-mono text-[9px] text-muted uppercase tracking-tighter italic">Handshake_Protocol_Verified</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
