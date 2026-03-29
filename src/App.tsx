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
  serverTimestamp, 
  deleteDoc, 
  doc, 
  orderBy,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  getDocs,
  limit
} from 'firebase/firestore';
import { 
  auth, 
  db, 
  googleProvider, 
  GameEntry, 
  FriendRequest,
  AppStoreEntry,
  UserProfile,
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
  Sparkles,
  Loader2,
  Users,
  ShoppingBag,
  User as UserIcon,
  Search,
  Check,
  UserPlus,
  Palette,
  Download,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// AI Initialization
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RECOMMENDED_GAMES = [
  { name: "Roblox", link: "https://www.roblox.com", icon: "https://picsum.photos/seed/roblox/100/100" },
  { name: "Minecraft", link: "https://www.minecraft.net", icon: "https://picsum.photos/seed/minecraft/100/100" },
  { name: "Fortnite", link: "https://www.fortnite.com", icon: "https://picsum.photos/seed/fortnite/100/100" },
  { name: "League of Legends", link: "https://www.leagueoflegends.com", icon: "https://picsum.photos/seed/lol/100/100" },
];

const THEMES = {
  zinc: { primary: 'bg-zinc-900', accent: 'bg-orange-500', text: 'text-orange-500', border: 'border-zinc-800' },
  orange: { primary: 'bg-orange-950', accent: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-900' },
  blue: { primary: 'bg-blue-950', accent: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-900' },
  purple: { primary: 'bg-purple-950', accent: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-900' },
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'vault' | 'friends' | 'store' | 'profile'>('vault');
  
  // Data States
  const [entries, setEntries] = useState<GameEntry[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [appStoreEntries, setAppStoreEntries] = useState<AppStoreEntry[]>([]);
  
  // UI States
  const [isAdding, setIsAdding] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [newEntry, setNewEntry] = useState({ name: '', link: '', category: 'game' as 'game' | 'private_server' });
  const [newApp, setNewApp] = useState({ name: '', description: '', downloadLink: '', iconUrl: '' });
  const [friendEmail, setFriendEmail] = useState('');
  
  // AI States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auth & Profile Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userDoc = doc(db, 'users', user.uid);
        const snap = await getDoc(userDoc);
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            theme: 'zinc',
            gamingUsername: '',
            friends: []
          };
          await setDoc(userDoc, newProfile);
          setUserProfile(newProfile);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time Data Listeners
  useEffect(() => {
    if (!user) return;

    // Vault Entries
    const vaultQ = query(collection(db, 'games'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubVault = onSnapshot(vaultQ, (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as GameEntry)));
    });

    // Friend Requests
    const friendQ = query(collection(db, 'friendRequests'), where('toEmail', '==', user.email), where('status', '==', 'pending'));
    const unsubFriends = onSnapshot(friendQ, (snap) => {
      setFriendRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)));
    });

    // App Store
    const storeQ = query(collection(db, 'appStore'), orderBy('createdAt', 'desc'));
    const unsubStore = onSnapshot(storeQ, (snap) => {
      setAppStoreEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppStoreEntry)));
    });

    return () => { unsubVault(); unsubFriends(); unsubStore(); };
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } catch (e) { console.error(e); }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch (e) { console.error(e); }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newEntry.name || !newEntry.link) return;
    try {
      await addDoc(collection(db, 'games'), { ...newEntry, userId: user.uid, createdAt: serverTimestamp() });
      setNewEntry({ name: '', link: '', category: 'game' });
      setIsAdding(false);
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, 'games'); }
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'games', id));
    } catch (e) { handleFirestoreError(e, OperationType.DELETE, `games/${id}`); }
  };

  const handlePublishApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newApp.name || !newApp.downloadLink) return;
    try {
      await addDoc(collection(db, 'appStore'), {
        ...newApp,
        authorUid: user.uid,
        authorName: user.displayName || 'Anônimo',
        createdAt: serverTimestamp()
      });
      setNewApp({ name: '', description: '', downloadLink: '', iconUrl: '' });
      setIsPublishing(false);
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, 'appStore'); }
  };

  const sendFriendRequest = async () => {
    if (!user || !friendEmail.trim()) return;
    try {
      await addDoc(collection(db, 'friendRequests'), {
        fromUid: user.uid,
        fromEmail: user.email,
        fromName: user.displayName,
        toEmail: friendEmail.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setFriendEmail('');
      alert('Pedido enviado!');
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, 'friendRequests'); }
  };

  const acceptFriendRequest = async (request: FriendRequest) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'friendRequests', request.id!), { status: 'accepted' });
      await updateDoc(doc(db, 'users', user.uid), { friends: arrayUnion(request.fromUid) });
      await updateDoc(doc(db, 'users', request.fromUid), { friends: arrayUnion(user.uid) });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'friendRequests'); }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), updates);
      setUserProfile(prev => prev ? { ...prev, ...updates } : null);
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'users'); }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMessage = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatInput('');
    setIsAiTyping(true);

    try {
      // AI Memory: Pass history as context
      const historyContext = chatMessages.map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.text}`).join('\n');
      const prompt = `Você é o Vault AI, assistente do GameVault. 
      Histórico da conversa:
      ${historyContext}
      
      Usuário perguntou agora: "${userMessage}"
      
      Contexto do usuário:
      - Nome: ${user?.displayName}
      - Itens salvos: ${entries.length}
      - Amigos: ${userProfile?.friends?.length || 0}
      
      Responda de forma amigável em Português. Lembre-se do que foi dito antes.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      const text = response.text || "Desculpe, não consegui processar.";
      setChatMessages(prev => [...prev, { role: 'ai', text }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'ai', text: "Erro na IA." }]);
    } finally { setIsAiTyping(false); }
  };

  const currentTheme = THEMES[userProfile?.theme || 'zinc'];

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>;

  if (!user) return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full text-center space-y-8">
        <h1 className="text-6xl font-black text-white tracking-tighter uppercase italic">Game<span className="text-orange-500">Vault</span></h1>
        <button onClick={handleLogin} className="w-full py-4 bg-white text-black font-bold rounded-full flex items-center justify-center gap-3 hover:bg-orange-500 hover:text-white transition-all">
          <LogIn className="w-5 h-5" /> ENTRAR COM GOOGLE
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className={`min-h-screen ${currentTheme.primary} text-white font-sans selection:bg-orange-500 selection:text-white transition-colors duration-500`}>
      {/* Sidebar / Nav */}
      <nav className="fixed left-0 top-0 h-full w-20 border-r border-white/10 flex flex-col items-center py-8 gap-8 z-50 bg-black/20 backdrop-blur-xl">
        <div className="text-2xl font-black italic text-orange-500">GV</div>
        <div className="flex-1 flex flex-col gap-6">
          <NavBtn active={activeTab === 'vault'} onClick={() => setActiveTab('vault')} icon={<Gamepad2 />} label="Cofre" />
          <NavBtn active={activeTab === 'friends'} onClick={() => setActiveTab('friends')} icon={<Users />} label="Amigos" />
          <NavBtn active={activeTab === 'store'} onClick={() => setActiveTab('store')} icon={<ShoppingBag />} label="Loja" />
          <NavBtn active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<UserIcon />} label="Perfil" />
        </div>
        <button onClick={handleLogout} className="p-3 text-zinc-500 hover:text-red-500 transition-colors"><LogOut /></button>
      </nav>

      <main className="pl-20 min-h-screen">
        <header className="p-8 flex justify-between items-center border-b border-white/5">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter">
            {activeTab === 'vault' && 'Seu Cofre'}
            {activeTab === 'friends' && 'Comunidade'}
            {activeTab === 'store' && 'App Store'}
            {activeTab === 'profile' && 'Configurações'}
          </h2>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-zinc-500 uppercase">{userProfile?.gamingUsername || user.displayName}</span>
            <img src={user.photoURL || ''} className="w-10 h-10 rounded-full border border-white/10" referrerPolicy="no-referrer" />
          </div>
        </header>

        <div className="p-8 max-w-6xl mx-auto">
          {activeTab === 'vault' && (
            <div className="space-y-12">
              <section className="space-y-6">
                <div className="flex justify-between items-end">
                  <h3 className="text-xl font-bold uppercase tracking-widest text-zinc-500">Recomendados</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {RECOMMENDED_GAMES.map(g => (
                    <a key={g.name} href={g.link} target="_blank" className="bg-white/5 p-4 rounded-3xl hover:bg-white/10 transition-all flex flex-col items-center gap-3 border border-white/5">
                      <img src={g.icon} className="w-12 h-12 rounded-2xl" />
                      <span className="text-xs font-bold text-center">{g.name}</span>
                    </a>
                  ))}
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold uppercase tracking-widest text-zinc-500">Seus Links</h3>
                  <button onClick={() => setIsAdding(true)} className="bg-orange-500 px-6 py-2 rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform">
                    <Plus className="w-4 h-4" /> ADICIONAR
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {entries.map(e => (
                    <div key={e.id} className="bg-white/5 p-6 rounded-3xl border border-white/5 flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${e.category === 'game' ? 'bg-orange-500/20 text-orange-500' : 'bg-blue-500/20 text-blue-500'}`}>
                          {e.category === 'game' ? <Gamepad2 /> : <Server />}
                        </div>
                        <div>
                          <h4 className="font-bold">{e.name}</h4>
                          <a href={e.link} target="_blank" className="text-xs text-zinc-500 hover:text-white truncate block max-w-[200px]">{e.link}</a>
                        </div>
                      </div>
                      <button onClick={() => handleDeleteEntry(e.id!)} className="p-2 text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 /></button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'friends' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <section className="space-y-6">
                <h3 className="text-xl font-bold uppercase tracking-widest text-zinc-500">Adicionar Amigo</h3>
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    placeholder="E-mail do amigo" 
                    value={friendEmail}
                    onChange={e => setFriendEmail(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 outline-none focus:border-orange-500"
                  />
                  <button onClick={sendFriendRequest} className="bg-white text-black px-6 rounded-2xl font-bold hover:bg-orange-500 hover:text-white transition-all">
                    ENVIAR
                  </button>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-zinc-500 uppercase">Pedidos Pendentes</h4>
                  {friendRequests.map(r => (
                    <div key={r.id} className="bg-white/5 p-4 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="font-bold">{r.fromName}</p>
                        <p className="text-xs text-zinc-500">{r.fromEmail}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => acceptFriendRequest(r)} className="p-2 bg-green-500/20 text-green-500 rounded-xl hover:bg-green-500 hover:text-white transition-all"><Check /></button>
                        <button className="p-2 bg-red-500/20 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"><X /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-6">
                <h3 className="text-xl font-bold uppercase tracking-widest text-zinc-500">Seus Amigos</h3>
                <div className="grid grid-cols-1 gap-4">
                  {userProfile?.friends?.map((fId: string) => (
                    <div key={fId}>
                      <FriendItem uid={fId} />
                    </div>
                  ))}
                  {(!userProfile?.friends || userProfile.friends.length === 0) && <p className="text-zinc-500 italic">Nenhum amigo ainda.</p>}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'store' && (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold uppercase tracking-widest text-zinc-500">Comunidade</h3>
                <button onClick={() => setIsPublishing(true)} className="bg-blue-500 px-6 py-2 rounded-full font-bold flex items-center gap-2">
                  <Plus className="w-4 h-4" /> PUBLICAR APP
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {appStoreEntries.map(app => (
                  <div key={app.id} className="bg-white/5 rounded-[2rem] overflow-hidden border border-white/5 hover:border-blue-500/50 transition-all group">
                    <div className="h-32 bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                      {app.iconUrl ? <img src={app.iconUrl} className="w-16 h-16 rounded-2xl shadow-xl" /> : <ImageIcon className="w-12 h-12 text-white/20" />}
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="text-xl font-bold">{app.name}</h4>
                        <p className="text-xs text-zinc-500">por {app.authorName}</p>
                      </div>
                      <p className="text-sm text-zinc-400 line-clamp-2">{app.description}</p>
                      <a href={app.downloadLink} target="_blank" className="flex items-center justify-center gap-2 w-full py-3 bg-white/10 rounded-2xl font-bold hover:bg-blue-500 transition-all">
                        <Download className="w-4 h-4" /> DOWNLOAD
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="max-w-2xl space-y-12">
              <section className="space-y-6">
                <h3 className="text-xl font-bold uppercase tracking-widest text-zinc-500">Personalização</h3>
                <div className="space-y-4">
                  <label className="text-sm font-bold text-zinc-400">Nome de Usuário nos Jogos</label>
                  <input 
                    type="text" 
                    value={userProfile?.gamingUsername || ''} 
                    onChange={e => updateProfile({ gamingUsername: e.target.value })}
                    placeholder="Ex: PlayerOne_99"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-sm font-bold text-zinc-400">Tema do Site</label>
                  <div className="grid grid-cols-4 gap-4">
                    {Object.keys(THEMES).map(t => (
                      <button 
                        key={t} 
                        onClick={() => updateProfile({ theme: t as any })}
                        className={`h-12 rounded-xl border-2 transition-all ${userProfile?.theme === t ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: THEMES[t as keyof typeof THEMES].accent.replace('bg-', '') }}
                      />
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      {/* Modals & AI Chat (Same as before but updated) */}
      <AnimatePresence>
        {isAdding && (
          <Modal onClose={() => setIsAdding(false)} title="Novo Registro">
            <form onSubmit={handleAddEntry} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button type="button" onClick={() => setNewEntry(p => ({...p, category: 'game'}))} className={`p-4 rounded-2xl border-2 ${newEntry.category === 'game' ? 'border-orange-500 bg-orange-500/10' : 'border-white/10'}`}>Jogo</button>
                <button type="button" onClick={() => setNewEntry(p => ({...p, category: 'private_server'}))} className={`p-4 rounded-2xl border-2 ${newEntry.category === 'private_server' ? 'border-blue-500 bg-blue-500/10' : 'border-white/10'}`}>Servidor</button>
              </div>
              <input type="text" placeholder="Nome" required value={newEntry.name} onChange={e => setNewEntry(p => ({...p, name: e.target.value}))} className="w-full bg-white/5 p-4 rounded-2xl outline-none" />
              <input type="url" placeholder="Link" required value={newEntry.link} onChange={e => setNewEntry(p => ({...p, link: e.target.value}))} className="w-full bg-white/5 p-4 rounded-2xl outline-none" />
              <button type="submit" className="w-full py-4 bg-orange-500 rounded-2xl font-bold">SALVAR</button>
            </form>
          </Modal>
        )}

        {isPublishing && (
          <Modal onClose={() => setIsPublishing(false)} title="Publicar App">
            <form onSubmit={handlePublishApp} className="space-y-4">
              <input type="text" placeholder="Nome do App" required value={newApp.name} onChange={e => setNewApp(p => ({...p, name: e.target.value}))} className="w-full bg-white/5 p-4 rounded-2xl outline-none" />
              <textarea placeholder="Descrição" required value={newApp.description} onChange={e => setNewApp(p => ({...p, description: e.target.value}))} className="w-full bg-white/5 p-4 rounded-2xl outline-none h-32" />
              <input type="url" placeholder="Link de Download" required value={newApp.downloadLink} onChange={e => setNewApp(p => ({...p, downloadLink: e.target.value}))} className="w-full bg-white/5 p-4 rounded-2xl outline-none" />
              <input type="url" placeholder="URL do Ícone (Opcional)" value={newApp.iconUrl} onChange={e => setNewApp(p => ({...p, iconUrl: e.target.value}))} className="w-full bg-white/5 p-4 rounded-2xl outline-none" />
              <button type="submit" className="w-full py-4 bg-blue-500 rounded-2xl font-bold">PUBLICAR</button>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      <button onClick={() => setIsChatOpen(true)} className="fixed bottom-8 right-8 w-16 h-16 bg-white text-black rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all z-40"><Sparkles /></button>

      <AnimatePresence>
        {isChatOpen && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="relative w-full max-w-md bg-zinc-900 h-full flex flex-col shadow-2xl">
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <div className="flex items-center gap-2"><Sparkles className="text-orange-500" /><h3 className="font-bold uppercase italic">Vault AI</h3></div>
                <button onClick={() => setIsChatOpen(false)}><X /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 rounded-2xl ${m.role === 'user' ? 'bg-orange-500' : 'bg-white/5'}`}>{m.text}</div>
                  </div>
                ))}
                {isAiTyping && <Loader2 className="animate-spin text-orange-500" />}
                <div ref={chatEndRef} />
              </div>
              <div className="p-6 border-t border-white/10 flex gap-2">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 bg-white/5 p-4 rounded-2xl outline-none" placeholder="Pergunte algo..." />
                <button onClick={handleSendMessage} className="bg-orange-500 p-4 rounded-2xl"><Send /></button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button onClick={onClick} className={`p-4 rounded-2xl transition-all flex flex-col items-center gap-1 group ${active ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-zinc-500 hover:text-white'}`}>
      {icon}
      <span className="text-[10px] font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity">{label}</span>
    </button>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode, onClose: () => void, title: string }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-zinc-900 border border-white/10 w-full max-w-lg rounded-[2.5rem] p-8">
        <div className="flex justify-between items-center mb-8"><h3 className="text-2xl font-black italic uppercase">{title}</h3><button onClick={onClose}><X /></button></div>
        {children}
      </motion.div>
    </div>
  );
}

function FriendItem({ uid }: { uid: string }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    getDoc(doc(db, 'users', uid)).then(snap => setProfile(snap.data() as UserProfile));
  }, [uid]);
  if (!profile) return null;
  return (
    <div className="bg-white/5 p-4 rounded-2xl flex items-center gap-4">
      <img src={profile.photoURL} className="w-10 h-10 rounded-full" />
      <div>
        <p className="font-bold">{profile.displayName}</p>
        <p className="text-xs text-zinc-500">{profile.gamingUsername || 'Sem username'}</p>
      </div>
    </div>
  );
}
