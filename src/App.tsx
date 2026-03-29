import React, { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  setDoc,
  serverTimestamp, 
  deleteDoc, 
  doc, 
  orderBy 
} from 'firebase/firestore';
import { 
  auth, 
  db, 
  googleProvider, 
  GameEntry, 
  OperationType, 
  handleFirestoreError 
} from './firebase';
import { GoogleGenAI } from "@google/genai";
import { 
  Plus, 
  Gamepad2, 
  Server, 
  Trash2, 
  LogOut, 
  LogIn, 
  MessageSquare, 
  X, 
  Send, 
  ExternalLink, 
  ChevronRight, 
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// AI Initialization
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<GameEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newEntry, setNewEntry] = useState({ name: '', link: '', category: 'game' as 'game' | 'private_server' });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);
      
      if (user) {
        // Save user profile to Firestore
        try {
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastLogin: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          console.error("Error saving user profile", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      return;
    }

    const q = query(
      collection(db, 'games'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameEntry));
      setEntries(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'games');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newEntry.name || !newEntry.link) return;

    try {
      await addDoc(collection(db, 'games'), {
        ...newEntry,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setNewEntry({ name: '', link: '', category: 'game' });
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'games');
    }
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'games', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `games/${id}`);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatInput('');
    setIsAiTyping(true);

    try {
      const prompt = `You are a helpful gaming assistant for GameVault. 
      The user is asking: "${userMessage}". 
      Context: The user has ${entries.length} saved items. 
      Games: ${entries.filter(e => e.category === 'game').map(e => e.name).join(', ')}. 
      Private Servers: ${entries.filter(e => e.category === 'private_server').map(e => e.name).join(', ')}.
      Help the user with game recommendations, server management tips, or general gaming advice. Keep it concise and friendly. Respond in Portuguese.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      const text = response.text || "Desculpe, não consegui gerar uma resposta.";
      setChatMessages(prev => [...prev, { role: 'ai', text }]);
    } catch (error) {
      console.error("AI Error", error);
      setChatMessages(prev => [...prev, { role: 'ai', text: "Desculpe, tive um problema ao processar sua mensagem." }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-2">
            <h1 className="text-6xl font-black text-white tracking-tighter uppercase italic">
              Game<span className="text-orange-500">Vault</span>
            </h1>
            <p className="text-zinc-400 text-sm uppercase tracking-widest font-mono">
              Sua biblioteca definitiva de jogos e servidores
            </p>
          </div>

          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-white text-black font-bold rounded-full flex items-center justify-center gap-3 hover:bg-orange-500 hover:text-white transition-all duration-300 group"
          >
            <LogIn className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            ENTRAR COM GOOGLE
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-orange-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 p-6 flex items-center justify-between sticky top-0 bg-zinc-950/80 backdrop-blur-md z-40">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black tracking-tighter italic uppercase">
            Game<span className="text-orange-500">Vault</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-tighter">Usuário</span>
            <span className="text-sm font-bold">{user.displayName}</span>
          </div>
          <img 
            src={user.photoURL || ''} 
            alt="Profile" 
            className="w-10 h-10 rounded-full border border-zinc-700"
            referrerPolicy="no-referrer"
          />
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
            title="Sair"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-12">
        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-4xl font-black tracking-tighter uppercase italic">Sua Coleção</h2>
            <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">
              {entries.length} itens salvos no seu cofre
            </p>
          </div>
          
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-orange-500 px-6 py-3 rounded-full font-bold hover:bg-orange-600 transition-all group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            ADICIONAR NOVO
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {entries.map((entry) => (
              <motion.div 
                key={entry.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group bg-zinc-900 border border-zinc-800 p-6 rounded-3xl hover:border-orange-500/50 transition-all relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleDeleteEntry(entry.id!)}
                    className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-2xl ${entry.category === 'game' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'}`}>
                      {entry.category === 'game' ? <Gamepad2 className="w-6 h-6" /> : <Server className="w-6 h-6" />}
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                        {entry.category === 'game' ? 'Jogo' : 'Servidor Privado'}
                      </span>
                      <h3 className="text-xl font-bold truncate pr-8">{entry.name}</h3>
                    </div>
                  </div>

                  <a 
                    href={entry.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-between w-full bg-zinc-800 p-4 rounded-2xl hover:bg-zinc-700 transition-colors group/link"
                  >
                    <span className="text-sm font-mono truncate text-zinc-400 group-hover/link:text-white">
                      {entry.link.replace(/^https?:\/\//, '')}
                    </span>
                    <ExternalLink className="w-4 h-4 text-zinc-500 group-hover/link:text-orange-500" />
                  </a>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {entries.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-zinc-800 rounded-3xl">
              <p className="text-zinc-500 font-mono uppercase tracking-widest">Nenhum item salvo ainda.</p>
              <button 
                onClick={() => setIsAdding(true)}
                className="mt-4 text-orange-500 font-bold hover:underline"
              >
                Comece a salvar agora
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Add Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-[2rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black italic uppercase tracking-tighter">Novo Registro</h3>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-zinc-800 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAddEntry} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-widest text-zinc-500">Categoria</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      type="button"
                      onClick={() => setNewEntry(prev => ({ ...prev, category: 'game' }))}
                      className={`py-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${newEntry.category === 'game' ? 'border-orange-500 bg-orange-500/10 text-orange-500' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                    >
                      <Gamepad2 className="w-6 h-6" />
                      <span className="text-xs font-bold uppercase">Jogo</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setNewEntry(prev => ({ ...prev, category: 'private_server' }))}
                      className={`py-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${newEntry.category === 'private_server' ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                    >
                      <Server className="w-6 h-6" />
                      <span className="text-xs font-bold uppercase">Servidor</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-widest text-zinc-500">Nome</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Roblox Blox Fruits"
                    value={newEntry.name}
                    onChange={e => setNewEntry(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-zinc-800 border-none rounded-2xl p-4 focus:ring-2 focus:ring-orange-500 transition-all outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-widest text-zinc-500">Link</label>
                  <input 
                    type="url" 
                    required
                    placeholder="https://..."
                    value={newEntry.link}
                    onChange={e => setNewEntry(prev => ({ ...prev, link: e.target.value }))}
                    className="w-full bg-zinc-800 border-none rounded-2xl p-4 focus:ring-2 focus:ring-orange-500 transition-all outline-none"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-orange-500 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-orange-600 transition-all"
                >
                  Salvar no Cofre
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Assistant Toggle */}
      <button 
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-white text-black rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40 group"
      >
        <Sparkles className="w-8 h-8 group-hover:text-orange-500 transition-colors" />
      </button>

      {/* AI Chat Drawer */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChatOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-zinc-900 border-l border-zinc-800 z-[60] flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500 rounded-xl">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black uppercase italic tracking-tighter">Vault AI</h3>
                    <span className="text-[10px] font-mono text-green-500 uppercase tracking-widest">Online</span>
                  </div>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="p-2 hover:bg-zinc-800 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
                {chatMessages.length === 0 && (
                  <div className="text-center py-10 space-y-4">
                    <div className="w-16 h-16 bg-zinc-800 rounded-3xl mx-auto flex items-center justify-center">
                      <MessageSquare className="w-8 h-8 text-zinc-500" />
                    </div>
                    <p className="text-zinc-500 text-sm font-mono uppercase tracking-widest">
                      Como posso ajudar com sua biblioteca hoje?
                    </p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-orange-500 text-white rounded-tr-none' : 'bg-zinc-800 text-zinc-200 rounded-tl-none'}`}>
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
                {isAiTyping && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-800 p-4 rounded-2xl rounded-tl-none">
                      <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-6 border-t border-zinc-800 bg-zinc-950">
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Pergunte algo..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || isAiTyping}
                    className="absolute right-2 top-2 p-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-orange-500 transition-all"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
