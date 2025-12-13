import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken,
  setPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, // 追加
  onSnapshot, 
  updateDoc, 
  deleteField,
  serverTimestamp, 
  increment,
  arrayUnion
} from 'firebase/firestore';
import { 
  Copy, 
  Users, 
  Play, 
  AlertTriangle, 
  Trophy, 
  RefreshCw,
  Crown,
  Info,
  X,
  List,
  CheckCircle,
  Loader,
  MessageCircle,
  Send,
  LogOut,
  Eye // 追加: 観戦アイコン
} from 'lucide-react';

/* --------------------------------------------------------------------------
   Firebase Initialization & Configuration
   -------------------------------------------------------------------------- */
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCEuMejvz9b7yl0eo4aNUv2tZuN37nLTBs",
  authDomain: "cowtaker.firebaseapp.com",
  projectId: "cowtaker",
  storageBucket: "cowtaker.firebasestorage.app",
  messagingSenderId: "54764846498",
  appId: "1:54764846498:web:f6b8d36ad672c3d08586fb",
  measurementId: "G-SRPT7362MW"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/* --------------------------------------------------------------------------
   Game Constants & Logic Helpers
   -------------------------------------------------------------------------- */
const MAX_PLAYERS = 10;
const INITIAL_HAND_SIZE = 10;
const MAX_ROW_LENGTH = 5;

const getPenaltyPoints = (number) => {
  if (number === 55) return 7;
  if (number % 11 === 0) return 5;
  if (number % 10 === 0) return 3;
  if (number % 5 === 0) return 2;
  return 1;
};

const calculateRowPoints = (rowCards) => {
  return rowCards.reduce((sum, card) => sum + getPenaltyPoints(card), 0);
};

/* --------------------------------------------------------------------------
   Components
   -------------------------------------------------------------------------- */

const Card = ({ number, type = 'hand', onClick, isSelected, isRevealed = true, small = false }) => {
  const points = getPenaltyPoints(number);
  
  let bgColor = "bg-slate-100 text-slate-800";
  if (points >= 7) bgColor = "bg-red-200 text-red-900 border-red-400";
  else if (points >= 5) bgColor = "bg-orange-200 text-orange-900 border-orange-400";
  else if (points >= 2) bgColor = "bg-yellow-100 text-yellow-900 border-yellow-400";

  const baseClasses = `
    relative flex flex-col items-center justify-center 
    rounded-lg border-2 shadow-sm transition-all duration-200 select-none
    ${isSelected ? 'ring-4 ring-blue-500 -translate-y-4 z-10' : 'hover:-translate-y-1'}
    ${type === 'hand' ? 'cursor-pointer' : ''}
    ${small ? 'w-10 h-14 text-sm' : 'w-14 h-20 sm:w-16 sm:h-24 text-xl sm:text-2xl font-bold'}
    ${!isRevealed ? 'bg-indigo-600 border-indigo-800' : bgColor}
  `;

  if (!isRevealed) {
    return (
      <div className={baseClasses}>
        <div className="w-full h-full flex items-center justify-center opacity-20">
          <RefreshCw size={small ? 12 : 24} className="text-white" />
        </div>
      </div>
    );
  }

  return (
    <div className={baseClasses} onClick={onClick}>
      <span className="absolute top-1 left-1 text-[10px] leading-none opacity-60">{number}</span>
      <span>{number}</span>
      <div className="absolute bottom-1 w-full flex justify-center gap-[1px]">
        {Array.from({ length: Math.min(points, 5) }).map((_, i) => (
          <div key={i} className={`rounded-full ${small ? 'w-1 h-1' : 'w-1.5 h-1.5'} ${points >= 5 ? 'bg-red-500' : 'bg-slate-400'}`} />
        ))}
        {points > 5 && <span className="text-[8px] leading-none ml-0.5 text-red-600">+{points-5}</span>}
      </div>
    </div>
  );
};

// Modal: Scoreboard
const ScoreModal = ({ isOpen, onClose, players, myId }) => {
  if (!isOpen) return null;
  // 観戦者を除外してスコア表示する（あるいは観戦者として表示する）
  // ここでは全員表示するが、観戦者はスコア変動なし
  const sortedPlayers = [...players].sort((a, b) => a.score - b.score);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center sticky top-0">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Trophy size={20} className="text-yellow-500" /> スコアボード
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition"><X size={20} className="text-slate-500" /></button>
        </div>
        <div className="overflow-y-auto p-2">
          {sortedPlayers.map((p, idx) => (
            <div key={p.id} className={`p-3 m-1 rounded-xl flex items-center justify-between ${p.id === myId ? 'bg-indigo-50 border border-indigo-200' : 'bg-white border border-slate-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 flex items-center justify-center rounded-full font-black ${idx === 0 ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-500'}`}>
                  {idx + 1}
                </div>
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    {p.name} 
                    {p.id === myId && <span className="text-[10px] bg-indigo-200 text-indigo-800 px-1 rounded">YOU</span>}
                    {p.isSpectator && <span className="text-[10px] bg-slate-200 text-slate-600 px-1 rounded flex items-center gap-0.5"><Eye size={10}/> 観戦</span>}
                  </div>
                  <div className="text-xs text-slate-400">
                    {p.isSpectator ? '観戦中' : (p.selectedCard ? '選択済み' : '考え中...')}
                  </div>
                </div>
              </div>
              <div className="font-mono font-black text-xl text-indigo-600">-{p.score}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Modal: Chat
const ChatModal = ({ isOpen, onClose, messages = [], onSend, myId }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSend(inputText);
    setInputText('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[70vh]">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <MessageCircle size={20} className="text-indigo-500" /> チャット
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition"><X size={20} className="text-slate-500" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-100">
          {messages.length === 0 && (
            <div className="text-center text-slate-400 text-sm mt-10">メッセージはまだありません</div>
          )}
          {messages.map((msg, idx) => {
             const isMe = msg.senderId === myId;
             return (
               <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                 <div className="flex items-end gap-2 max-w-[85%]">
                   {!isMe && (
                     <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0">
                       {msg.senderName.charAt(0)}
                     </div>
                   )}
                   <div className={`p-3 rounded-2xl text-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-200 shadow-sm'}`}>
                     {msg.text}
                   </div>
                 </div>
                 <span className="text-[10px] text-slate-400 mt-1 mx-1">
                   {!isMe && `${msg.senderName} • `}{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                 </span>
               </div>
             );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 flex gap-2">
          <input
            type="text"
            className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
            placeholder="メッセージを入力..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

// Main App Component
export default function NimmtGame() {
  const [user, setUser] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [lobbyId, setLobbyId] = useState('');
  const [joinLobbyId, setJoinLobbyId] = useState('');
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // UI States
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [localSelectedCard, setLocalSelectedCard] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadIndex, setLastReadIndex] = useState(0);

  // Auth & Init
  useEffect(() => {
    const initAuth = async () => {
      try { await setPersistence(auth, browserSessionPersistence); } catch (e) {}
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        const storedName = localStorage.getItem(`nimmt_player_name_${u.uid}`);
        if (storedName) setPlayerName(storedName);
      }
    });
  }, []);

  // Lobby Listener & Chat Notification
  useEffect(() => {
    if (!user || !lobbyId) return;
    const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', lobbyId);
    return onSnapshot(lobbyRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGameState(data);
        
        const myPlayer = data.players[user.uid];
        // Reset local selection if server clears it
        if (myPlayer && myPlayer.selectedCard === null) {
          setLocalSelectedCard(null);
        }

        // Chat notification logic
        const messages = data.chat || [];
        if (showChat) {
          setLastReadIndex(messages.length);
          setUnreadCount(0);
        } else {
          const newCount = Math.max(0, messages.length - lastReadIndex);
          setUnreadCount(newCount);
        }

      } else {
        setError("ロビーが見つかりません");
        setGameState(null);
        setLobbyId('');
      }
    });
  }, [user, lobbyId, showChat, lastReadIndex]);

  // Reset unread when chat opens
  useEffect(() => {
    if (showChat && gameState?.chat) {
      setLastReadIndex(gameState.chat.length);
      setUnreadCount(0);
    }
  }, [showChat]);

  /* ------------------------------------------------------------------------
     Host Auto-Resolution Logic (Modified for Spectators)
     ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!gameState || !user) return;
    if (gameState.hostId === user.uid && gameState.status === 'playing') {
      const players = Object.values(gameState.players);
      
      // 観戦者を除いた「現役プレイヤー」を抽出
      const activePlayers = players.filter(p => !p.isSpectator);
      
      // 全員選択済みかチェック
      const allSelected = activePlayers.length > 0 && activePlayers.every(p => p.selectedCard !== null);
      
      if (allSelected && !loading) {
        const timer = setTimeout(() => resolveTurn(), 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState, user]);

  /* ------------------------------------------------------------------------
     Game Actions
     ------------------------------------------------------------------------ */

  const createLobby = async () => {
    if (!playerName.trim()) return setError("名前を入力してください");
    setLoading(true);
    localStorage.setItem(`nimmt_player_name_${user.uid}`, playerName);
    
    try {
      const newLobbyId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', newLobbyId);
      await setDoc(lobbyRef, {
        id: newLobbyId,
        hostId: user.uid,
        status: 'waiting',
        createdAt: serverTimestamp(),
        round: 0,
        players: {
          [user.uid]: {
            id: user.uid,
            name: playerName,
            score: 0,
            hand: [],
            selectedCard: null,
            isSpectator: false
          }
        },
        rows: { 0: [], 1: [], 2: [], 3: [] },
        chat: []
      });
      setLobbyId(newLobbyId);
    } catch (e) { setError("作成エラー"); }
    finally { setLoading(false); }
  };

  const joinLobby = async () => {
    if (!playerName.trim() || !joinLobbyId) return setError("入力してください");
    setLoading(true);
    localStorage.setItem(`nimmt_player_name_${user.uid}`, playerName);

    try {
      const targetId = joinLobbyId.toUpperCase();
      const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', targetId);
      
      // 現在のステータスを確認して観戦者かどうかを判定
      const lobbySnap = await getDoc(lobbyRef);
      if (!lobbySnap.exists()) {
        setError("ロビーが見つかりません");
        setLoading(false);
        return;
      }
      const lobbyData = lobbySnap.data();
      const isSpectator = lobbyData.status === 'playing';

      await updateDoc(lobbyRef, {
        [`players.${user.uid}`]: {
          id: user.uid,
          name: playerName,
          score: 0,
          hand: [],
          selectedCard: null,
          isSpectator: isSpectator
        }
      });
      setLobbyId(targetId);
    } catch (e) { setError("参加エラー: IDを確認してください"); }
    finally { setLoading(false); }
  };

  const leaveLobby = async () => {
    if (!lobbyId || !user) return;
    if (!window.confirm("ロビーから退出しますか？")) return;
    
    setLoading(true);
    try {
      const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', lobbyId);
      await updateDoc(lobbyRef, {
        [`players.${user.uid}`]: deleteField()
      });
      setLobbyId('');
      setGameState(null);
    } catch (e) {
      console.error(e);
      setLobbyId('');
      setGameState(null);
    } finally {
      setLoading(false);
    }
  };

  const startGame = async () => {
    setLoading(true);
    try {
      const deck = Array.from({ length: 104 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
      const newRows = { 0: [deck.pop()], 1: [deck.pop()], 2: [deck.pop()], 3: [deck.pop()] };
      const updatedPlayers = { ...gameState.players };
      
      // ゲーム開始時は全員プレイヤーとして参加
      Object.keys(updatedPlayers).forEach(pid => {
        const hand = [];
        for (let k = 0; k < INITIAL_HAND_SIZE; k++) if(deck.length) hand.push(deck.pop());
        hand.sort((a, b) => a - b);
        updatedPlayers[pid] = { 
          ...updatedPlayers[pid], 
          hand, 
          selectedCard: null, 
          score: 0,
          isSpectator: false 
        };
      });

      const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', lobbyId);
      await updateDoc(lobbyRef, {
        status: 'playing',
        rows: newRows,
        players: updatedPlayers,
        round: 1,
        message: "ゲーム開始！"
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCardClick = (card) => {
    if (gameState.status !== 'playing') return;
    const myPlayer = gameState.players[user.uid];
    if (myPlayer.isSpectator) return; // 観戦者は操作不可
    if (myPlayer.selectedCard !== null) return;
    setLocalSelectedCard(card);
  };

  const confirmSelection = async () => {
    if (!localSelectedCard) return;
    const myPlayer = gameState.players[user.uid];
    if (myPlayer.isSpectator) return;

    const newHand = myPlayer.hand.filter(c => c !== localSelectedCard);
    const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', lobbyId);
    await updateDoc(lobbyRef, {
      [`players.${user.uid}.hand`]: newHand,
      [`players.${user.uid}.selectedCard`]: localSelectedCard
    });
  };

  const sendChatMessage = async (text) => {
    if (!text.trim()) return;
    const newMessage = {
      senderId: user.uid,
      senderName: playerName,
      text: text.trim(),
      timestamp: Date.now()
    };
    try {
      const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', lobbyId);
      await updateDoc(lobbyRef, {
        chat: arrayUnion(newMessage)
      });
    } catch (e) { console.error(e); }
  };

  const resolveTurn = async () => {
    if (!gameState || user.uid !== gameState.hostId) return;
    setLoading(true);
    try {
      const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', lobbyId);
      let currentRows = { ...gameState.rows };
      let currentPlayers = { ...gameState.players };
      let turnMessage = "";
      
      // 観戦者を除外して処理
      const plays = Object.values(currentPlayers)
        .filter(p => !p.isSpectator && p.selectedCard !== null)
        .map(p => ({ uid: p.id, card: p.selectedCard }))
        .sort((a, b) => a.card - b.card);

      for (const play of plays) {
        const { card, uid } = play;
        const player = currentPlayers[uid];
        let bestRow = -1, minDiff = 1000;
        for (let i = 0; i < 4; i++) {
          const last = currentRows[i][currentRows[i].length - 1];
          if (card > last && (card - last < minDiff)) {
            minDiff = card - last;
            bestRow = i;
          }
        }
        if (bestRow !== -1) {
          if (currentRows[bestRow].length >= MAX_ROW_LENGTH) {
            const pts = calculateRowPoints(currentRows[bestRow]);
            player.score += pts;
            turnMessage += `${player.name}がバースト(${pts}pt). `;
            currentRows[bestRow] = [card];
          } else { currentRows[bestRow] = [...currentRows[bestRow], card]; }
        } else {
          let targetRow = 0, minPenalty = 1000;
          for (let i = 0; i < 4; i++) {
            const pts = calculateRowPoints(currentRows[i]);
            if (pts < minPenalty) { minPenalty = pts; targetRow = i; }
          }
          const pts = calculateRowPoints(currentRows[targetRow]);
          player.score += pts;
          turnMessage += `${player.name}が回収(${pts}pt). `;
          currentRows[targetRow] = [card];
        }
        player.selectedCard = null;
      }

      // 手札判定も観戦者を除外
      const activePlayers = Object.values(currentPlayers).filter(p => !p.isSpectator);
      const isGameEnd = activePlayers.length > 0 && activePlayers[0].hand.length === 0;

      await updateDoc(lobbyRef, {
        rows: currentRows,
        players: currentPlayers,
        status: isGameEnd ? 'finished' : 'playing',
        message: isGameEnd ? "終了！" : (turnMessage || "ターン完了"),
        round: increment(1)
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  /* ------------------------------------------------------------------------
     Views
     ------------------------------------------------------------------------ */

  if (!user) return <div className="h-screen flex items-center justify-center text-slate-400">Loading...</div>;

  // View: Setup (Create/Join)
  if (!lobbyId) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 flex items-center justify-center font-sans">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl">
          <h1 className="text-4xl font-black text-indigo-600 mb-2 text-center">6 NIMMT!</h1>
          <div className="space-y-6 mt-8">
            <input 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="プレイヤー名"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
            />
            <button onClick={createLobby} disabled={loading} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2">
              {loading ? <Loader className="animate-spin" /> : <><Play size={20} /> 部屋を作成</>}
            </button>
            <div className="flex gap-2">
              <input 
                className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-center uppercase"
                placeholder="ROOM ID"
                value={joinLobbyId}
                onChange={e => setJoinLobbyId(e.target.value)}
              />
              <button onClick={joinLobby} disabled={loading} className="px-6 bg-slate-800 text-white font-bold rounded-xl shadow hover:bg-slate-900">参加</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex gap-2"><AlertTriangle size={16}/>{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  // Common Header & Overlay Components
  const CommonUI = () => (
    <>
      <ScoreModal isOpen={showScoreboard} onClose={() => setShowScoreboard(false)} players={Object.values(gameState.players || {})} myId={user.uid} />
      <ChatModal isOpen={showChat} onClose={() => setShowChat(false)} messages={gameState.chat || []} onSend={sendChatMessage} myId={user.uid} />
      
      {/* Floating Buttons */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => setShowScoreboard(true)} className="p-3 bg-white/90 backdrop-blur text-slate-600 rounded-full shadow-md hover:bg-slate-100 transition relative">
          <List size={24} />
        </button>
        <button onClick={() => setShowChat(true)} className="p-3 bg-white/90 backdrop-blur text-slate-600 rounded-full shadow-md hover:bg-slate-100 transition relative">
          <MessageCircle size={24} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse border-2 border-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </>
  );

  // View: Waiting Room
  if (gameState && gameState.status === 'waiting') {
    const isHost = gameState.hostId === user.uid;
    const playersList = Object.values(gameState.players || {});
    return (
      <div className="min-h-screen bg-slate-50 p-4 max-w-2xl mx-auto font-sans">
        <CommonUI />
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 mt-16">
          <div className="text-xs font-bold text-slate-400">ROOM ID</div>
          <div className="text-3xl font-mono font-bold text-slate-800 flex items-center gap-2">
            {gameState.id}
            <button onClick={() => {navigator.clipboard.writeText(gameState.id); alert('Copied!');}} className="p-2 hover:bg-slate-100 rounded-full"><Copy size={18}/></button>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-600 flex items-center gap-2"><Users size={20}/> 参加者 ({playersList.length})</div>
          {playersList.map(p => (
            <div key={p.id} className="p-4 flex items-center justify-between border-b border-slate-50 last:border-0">
              <span className="font-bold text-slate-700 flex items-center gap-2">
                {p.name} {p.id === gameState.hostId && <Crown size={16} className="text-yellow-500" fill="currentColor"/>}
              </span>
              {p.id === user.uid && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">YOU</span>}
            </div>
          ))}
        </div>
        
        <div className="flex flex-col gap-3">
          {isHost ? (
            <button onClick={startGame} disabled={playersList.length < 2 || loading} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Starting...' : 'ゲーム開始'}
            </button>
          ) : (
            <div className="text-center text-slate-400 animate-pulse py-2">ホストの開始を待っています...</div>
          )}
          
          <button 
            onClick={leaveLobby} 
            disabled={loading}
            className="w-full py-3 bg-white text-red-500 border border-red-100 font-bold rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-2"
          >
            <LogOut size={18} /> 退出する
          </button>
        </div>
      </div>
    );
  }

  // View: Game Board
  if (gameState && (gameState.status === 'playing' || gameState.status === 'finished')) {
    const myPlayer = gameState.players[user.uid];
    const isSpectator = myPlayer.isSpectator;
    const isSelected = myPlayer.selectedCard !== null;
    const playersList = Object.values(gameState.players);
    // 待機人数は観戦者を除く
    const waitingCount = playersList.filter(p => !p.isSpectator && p.selectedCard === null).length;
    
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col font-sans relative overflow-hidden">
        <CommonUI />
        
        {/* Info Header */}
        <div className="bg-white/90 backdrop-blur-md px-4 py-3 shadow-sm flex justify-between items-center sticky top-0 z-30 pr-24">
          <div className="font-bold text-slate-700 text-sm md:text-base flex items-center gap-2">
             <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs">Round {gameState.round}</span>
             <span className="truncate max-w-[150px] md:max-w-xs">{gameState.message || "ゲーム進行中"}</span>
          </div>
        </div>

        {/* Board Area */}
        <div className="flex-1 overflow-y-auto p-2 pb-48 md:pb-60">
          <div className="max-w-3xl mx-auto space-y-3 mt-2">
            {[0, 1, 2, 3].map(rowIndex => (
              <div key={rowIndex} className="flex items-center gap-2 p-3 bg-white/70 rounded-xl border border-white shadow-sm min-h-[90px]">
                <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs">{rowIndex + 1}</div>
                <div className="flex-1 flex gap-1.5 overflow-x-auto items-center no-scrollbar">
                  {(gameState.rows[rowIndex] || []).map((c, i) => (
                    <Card key={c} number={c} type="board" small={window.innerWidth < 640} />
                  ))}
                  {gameState.rows[rowIndex]?.length >= 5 && (
                    <div className="w-10 h-14 sm:w-14 sm:h-20 border-2 border-red-300 bg-red-50 rounded-lg flex items-center justify-center">
                      <AlertTriangle size={16} className="text-red-400" />
                    </div>
                  )}
                </div>
                <div className="text-xs font-mono text-slate-400">-{calculateRowPoints(gameState.rows[rowIndex] || [])}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Hand Area - 観戦者は表示を切り替え */}
        {gameState.status === 'playing' && (
          <div className="fixed bottom-0 w-full bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-40 safe-area-bottom">
            <div className="max-w-4xl mx-auto p-4 flex flex-col gap-3">
              {isSpectator ? (
                // 観戦者向け表示
                <div className="flex flex-col items-center justify-center py-4 gap-2 text-slate-500">
                  <div className="flex items-center gap-2 text-lg font-bold">
                    <Eye size={24} /> 現在観戦中です
                  </div>
                  <p className="text-sm">次のゲーム開始までお待ちください</p>
                  <button onClick={leaveLobby} className="mt-2 text-xs text-red-400 underline hover:text-red-600">退出する</button>
                </div>
              ) : (
                // プレイヤー向け表示
                <>
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-bold text-slate-600">
                      {isSelected ? (
                        <span className="text-green-600 flex items-center gap-1"><CheckCircle size={16}/> 送信完了 - 待機中 ({waitingCount}人)</span>
                      ) : localSelectedCard ? (
                        <span className="text-indigo-600">カードを選択中: <b>{localSelectedCard}</b></span>
                      ) : (
                        "カードを選んでください"
                      )}
                    </div>
                    {!isSelected && localSelectedCard && (
                      <button onClick={confirmSelection} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-full font-bold shadow-lg animate-bounce transition active:scale-95">
                        決定する
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-4 pt-2 px-1 snap-x scroll-smooth">
                    {myPlayer.hand.map((cardNum) => (
                      <div key={cardNum} className={`snap-center flex-shrink-0 transition-opacity duration-300 ${isSelected ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                        <Card number={cardNum} isSelected={localSelectedCard === cardNum} onClick={() => handleCardClick(cardNum)} type="hand" />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Game End Overlay */}
        {gameState.status === 'finished' && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl">
                <Trophy size={64} className="mx-auto text-yellow-500 mb-4" />
                <h2 className="text-3xl font-black text-slate-800 mb-2">GAME SET</h2>
                <button onClick={() => setShowScoreboard(true)} className="w-full py-3 bg-indigo-100 text-indigo-700 font-bold rounded-xl mb-3">結果を見る</button>
                <button onClick={() => setLobbyId('')} className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl">ロビーへ戻る</button>
             </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}


