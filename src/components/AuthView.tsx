import { auth } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { motion } from 'motion/react';
import { Terminal, Shield, Cpu } from 'lucide-react';

export default function AuthView() {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 text-center max-w-lg mx-auto overflow-hidden bg-bg relative selection:bg-accent/30">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(204,255,0,0.05)_0%,transparent_100%)] z-0" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none" />
      
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-6 sm:mb-8 relative z-10"
      >
        <div className="p-6 sm:p-8 border border-white/10 bg-panel rotate-3 shadow-2xl relative">
           <div className="absolute -inset-1 border border-accent/20 rotate-2 -z-10" />
           <Terminal className="w-12 h-12 sm:w-16 sm:h-16 text-accent" />
        </div>
      </motion.div>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="z-10"
      >
        <h1 className="text-3xl sm:text-6xl font-display font-black mb-2 text-white">
          GENZ<span className="text-accent underline decoration-2 sm:decoration-4 underline-offset-4 sm:underline-offset-8">MATCH</span>
        </h1>
        <p className="font-mono text-accent text-[9px] sm:text-xs mb-6 sm:mb-8 uppercase tracking-[0.2em]">System.initialize(User:Student)</p>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-muted text-base sm:text-lg mb-8 sm:mb-12 leading-relaxed z-10 font-medium"
      >
        Secure AI-driven peer discovery.<br/>
        <span className="text-white/60 text-xs sm:text-sm">Strict Filter. Safe Chat. Pure Vibe.</span>
      </motion.p>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="w-full space-y-6 z-10"
      >
        <button
          onClick={handleLogin}
          className="w-full brutal-btn brutal-btn-primary hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-4 text-black text-xl py-5"
        >
          <Cpu className="w-6 h-6" />
          START_MATCHING.EXE
        </button>
        
        <div className="flex items-center justify-center gap-6 text-muted text-[10px] font-mono uppercase tracking-widest pt-4">
          <div className="flex items-center gap-2 border border-muted/30 px-3 py-1"><Shield className="w-3 h-3 text-safe" /> SECURE_NODE</div>
          <div className="flex items-center gap-2 border border-muted/30 px-3 py-1">GEMINI_MOD: ON</div>
        </div>
      </motion.div>
      
      <div className="fixed bottom-12 font-mono text-zinc-700 text-[10px] uppercase tracking-widest flex flex-col items-center gap-1">
        <span>build_v2.4.pre_alpha // 18+ college only</span>
        <span className="text-accent/30">DEV_UID: LOGESHWARAN</span>
      </div>
    </div>
  );
}
