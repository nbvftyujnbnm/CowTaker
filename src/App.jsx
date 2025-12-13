import React, { useState, useEffect, useMemo } from 'react';
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
  onSnapshot, 
  updateDoc, 
  serverTimestamp, 
  arrayUnion,
  increment 
} from 'firebase/firestore';
import { 
  Copy, 
  Users, 
  Play, 
  AlertTriangle, 
  Trophy, 
  ArrowRight,
  RefreshCw,
  Crown,
  Info
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
const MAX_ROW_LENGTH = 5; // 6th card takes the row

// Calculate "牛の頭数" (Penalty Points) based on Nimmt rules
const getPenaltyPoints = (number) => {
  if (number === 55) return 7;
  if (number % 11 === 0) return 5; // 11, 22, 33, 44, 66...
  if (number % 10 === 0) return 3; // 10, 20, 30...
  if (number % 5 === 0) return 2;  // 5, 15, 25... (excluding 10s)
  return 1;
};

// Calculate total points for an array of cards
const calculateRowPoints = (rowCards) => {
  return rowCards.reduce((sum, card) => sum + getPenaltyPoints(card), 0);
};

/* --------------------------------------------------------------------------
   Components
   -------------------------------------------------------------------------- */

// Card Component
const Card = ({ number, type = 'hand', onClick, isSelected, isRevealed = true, small = false }) => {
  const points = getPenaltyPoints(number);
  
  // Background colors based on points for visual flair
  let bgColor = "bg-slate-100 text-slate-800";
  if (points >= 7) bgColor = "bg-red-200 text-red-900 border-red-400";
  else if (points >= 5) bgColor = "bg-orange-200 text-orange-900 border-orange-400";
  else if (points >= 2) bgColor = "bg-yellow-100 text-yellow-900 border-yellow-400";

  const baseClasses = `
    relative flex flex-col items-center justify-center 
    rounded-lg border-2 shadow-sm transition-all duration-200
    ${isSelected ? 'ring-4 ring-blue-500 -translate-y-2' : 'hover:-translate-y-1'}
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
      {/* Top Number */}
      <span className="absolute top-1 left-1 text-[10px] leading-none opacity-60">{number}</span>
      
      {/* Center Number */}
      <span>{number}</span>
      
      {/* Cattle Heads (Points) */}
      <div className="absolute bottom-1 w-full flex justify-center gap-[1px]">
        {Array.from({ length: Math.min(points, 5) }).map((_, i) => (
          <div key={i} className={`rounded-full ${small ? 'w-1 h-1' : 'w-1.5 h-1.5'} ${points >= 5 ? 'bg-red-500' : 'bg-slate-400'}`} />
        ))}
        {points > 5 && <span className="text-[8px] leading-none ml-0.5 text-red-600">+{points-5}</span>}
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

  // 1. Auth & Initial Setup
  useEffect(() => {
    const initAuth = async () => {
      // 永続性をSESSION（タブを閉じたら終了）に設定し、タブ間の干渉を減らす試み
      // ※注意: 完全に分離するにはシークレットウィンドウの使用が推奨されます
      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch (e) {
        console.warn("Persistence setting failed (might be iframe)", e);
      }

      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        // localStorageから名前を復元するが、セッション分離のためキーにUIDを含める工夫も考えられるが
        // ここではシンプルに復元。競合時は再入力してもらう。
        const storedName = localStorage.getItem(`nimmt_player_name_${u.uid}`);
        if (storedName) setPlayerName(storedName);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Lobby Listener
  useEffect(() => {
    if (!user || !lobbyId) return;

    const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', lobbyId);
    
    // Important: Error callback provided
    const unsubscribe = onSnapshot(lobbyRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data());
      } else {
        setError("ロビーが存在しないか、削除されました。");
        setGameState(null);
        setLobbyId('');
      }
    }, (err) => {
      console.error("Snapshot error:", err);
      setError("データの読み込みエラーが発生しました。");
    });

    return () => unsubscribe();
  }, [user, lobbyId]);

  /* ------------------------------------------------------------------------
     Actions: Create / Join
     ------------------------------------------------------------------------ */

  const createLobby = async () => {
    if (!playerName.trim()) {
      setError("名前を入力してください");
      return;
    }
    setLoading(true);
    localStorage.setItem(`nimmt_player_name_${user.uid}`, playerName);
    
    try {
      // Generate a simple 6-char ID
      const newLobbyId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', newLobbyId);

      const initialData = {
        id: newLobbyId,
        hostId: user.uid,
        status: 'waiting', // waiting, playing, finished
        createdAt: serverTimestamp(),
        round: 0,
        players: {
          [user.uid]: {
            id: user.uid,
            name: playerName,
            score: 0,
            hand: [],
            selectedCard: null,
            isReady: false
          }
        },
        rows: { 0: [], 1: [], 2: [], 3: [] } // Map instead of array for safety
      };

      await setDoc(lobbyRef, initialData);
      setLobbyId(newLobbyId);
      setError('');
    } catch (e) {
      console.error(e);
      setError("ロビーの作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const joinLobby = async () => {
    if (!playerName.trim() || !joinLobbyId.trim()) {
      setError("名前とルームIDを入力してください");
      return;
    }
    setLoading(true);
    localStorage.setItem(`nimmt_player_name_${user.uid}`, playerName);

    try {
      const targetId = joinLobbyId.toUpperCase();
      const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', targetId);
      
      // 参加前にドキュメント取得して存在確認
      // ※簡易的な排他制御。厳密にはトランザクション推奨。
      await updateDoc(lobbyRef, {
        [`players.${user.uid}`]: {
          id: user.uid,
          name: playerName,
          score: 0,
          hand: [],
          selectedCard: null,
          isReady: false
        }
      });
      
      setLobbyId(targetId);
      setError('');
    } catch (e) {
      console.error(e);
      setError("参加に失敗しました。IDを確認してください。");
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------------
     Actions: Game Logic (Host Only primarily)
     ------------------------------------------------------------------------ */

  const startGame = async () => {
    if (!gameState) return;
    setLoading(true);

    try {
      // 1. Generate Deck (1-104)
      const deck = Array.from({ length: 104 }, (_, i) => i + 1);
      
      // Shuffle (Fisher-Yates)
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }

      // 2. Deal Rows (4 cards)
      const newRows = {
        0: [deck.pop()],
        1: [deck.pop()],
        2: [deck.pop()],
        3: [deck.pop()]
      };

      // 3. Deal Hands (10 each)
      const updatedPlayers = { ...gameState.players };
      Object.keys(updatedPlayers).forEach(pid => {
        const hand = [];
        for (let k = 0; k < INITIAL_HAND_SIZE; k++) {
          if (deck.length > 0) hand.push(deck.pop());
        }
        // Sort hand for usability
        hand.sort((a, b) => a - b);
        
        updatedPlayers[pid] = {
          ...updatedPlayers[pid],
          hand: hand,
          selectedCard: null,
          isReady: false,
          score: 0 // Reset score for new game
        };
      });

      // Update Firestore
      const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', lobbyId);
      await updateDoc(lobbyRef, {
        status: 'playing',
        rows: newRows,
        players: updatedPlayers,
        round: 1,
        message: "ゲーム開始！カードを選んでください。"
      });

    } catch (e) {
      console.error(e);
      setError("ゲーム開始エラー");
    } finally {
      setLoading(false);
    }
  };

  const selectCard = async (card) => {
    if (!gameState || gameState.status !== 'playing') return;
    
    // Optimistic check
    const myPlayer = gameState.players[user.uid];
    if (myPlayer.selectedCard) return; // Already selected

    const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', lobbyId);
    
    // Remove from hand, set as selected
    const newHand = myPlayer.hand.filter(c => c !== card);
    
    await updateDoc(lobbyRef, {
      [`players.${user.uid}.hand`]: newHand,
      [`players.${user.uid}.selectedCard`]: card
    });
  };

  // HOST ONLY: Resolve Turn
  const resolveTurn = async () => {
    // Only host runs this to avoid race conditions
    if (!gameState || user.uid !== gameState.hostId) return;

    const players = Object.values(gameState.players);
    // Check if everyone has selected
    if (players.some(p => p.selectedCard === null)) return;

    setLoading(true);

    try {
      const lobbyRef = doc(db, 'artifacts', appId, 'public', 'data', 'lobbies', lobbyId);
      
      // Clone state for mutation
      let currentRows = { ...gameState.rows }; // {0: [], 1: [], ...}
      let currentPlayers = { ...gameState.players };
      let turnMessage = "";

      // Sort plays by card value (ascending)
      const plays = players.map(p => ({ uid: p.id, card: p.selectedCard })).sort((a, b) => a.card - b.card);

      // Process each card
      for (const play of plays) {
        const card = play.card;
        const player = currentPlayers[play.uid];
        
        // Find suitable row
        let bestRowIndex = -1;
        let minDiff = 1000;

        for (let i = 0; i < 4; i++) {
          const row = currentRows[i];
          const lastCard = row[row.length - 1];
          
          if (card > lastCard) {
            const diff = card - lastCard;
            if (diff < minDiff) {
              minDiff = diff;
              bestRowIndex = i;
            }
          }
        }

        if (bestRowIndex !== -1) {
          // Found a valid row
          if (currentRows[bestRowIndex].length >= MAX_ROW_LENGTH) {
            // Bust! (6th card rule)
            const rowPoints = calculateRowPoints(currentRows[bestRowIndex]);
            player.score += rowPoints;
            turnMessage += `${player.name}が${rowPoints}点(バースト). `;
            // Replace row with this card
            currentRows[bestRowIndex] = [card];
          } else {
            // Safe placement
            currentRows[bestRowIndex] = [...currentRows[bestRowIndex], card];
          }
        } else {
          // No valid row (Card is smaller than all row ends) -> Take row with MIN penalty
          let minPenalty = 1000;
          let targetRowIndex = 0;

          for (let i = 0; i < 4; i++) {
            const points = calculateRowPoints(currentRows[i]);
            if (points < minPenalty) {
              minPenalty = points;
              targetRowIndex = i;
            }
          }

          const rowPoints = calculateRowPoints(currentRows[targetRowIndex]);
          player.score += rowPoints;
          turnMessage += `${player.name}が${rowPoints}点(最小値). `;
          // Replace row with this card
          currentRows[targetRowIndex] = [card];
        }

        // Reset player selection
        player.selectedCard = null;
      }

      // Check if game end
      const firstPlayerId = Object.keys(currentPlayers)[0];
      const isGameEnd = currentPlayers[firstPlayerId].hand.length === 0 && plays.length > 0;

      if (isGameEnd) {
        await updateDoc(lobbyRef, {
          rows: currentRows,
          players: currentPlayers,
          status: 'finished',
          message: "ゲーム終了！最終結果を確認してください。"
        });
      } else {
        await updateDoc(lobbyRef, {
          rows: currentRows,
          players: currentPlayers,
          message: "ターン終了. " + turnMessage,
          round: increment(1)
        });
      }

    } catch (e) {
      console.error("Turn resolution error", e);
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------------
     Render Helpers
     ------------------------------------------------------------------------ */

  const copyToClipboard = () => {
    if (lobbyId) {
      document.execCommand('copy');
      alert(`IDをコピーしました: ${lobbyId}`);
    }
  };

  /* ------------------------------------------------------------------------
     Views
     ------------------------------------------------------------------------ */

  if (!user) {
    return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-500">認証中...</div>;
  }

  // View: Lobby / Game Setup
  if (!lobbyId) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-800 flex flex-col items-center justify-center">
        <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-lg border border-slate-200">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-indigo-600 mb-2">6 NIMMT!</h1>
            <p className="text-sm text-slate-500">オンライン・ナンバーカードゲーム</p>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">プレイヤー名</label>
              <input 
                type="text" 
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                placeholder="あなたの名前"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </div>

            <div className="border-t border-slate-100 pt-6">
              <button 
                onClick={createLobby}
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition flex items-center justify-center gap-2 mb-4"
              >
                {loading ? '処理中...' : <><Play size={20} /> 新しい部屋を作る</>}
              </button>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-slate-400 text-xs">または IDで参加</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <div className="flex gap-2 mt-4">
                <input 
                  type="text" 
                  className="flex-1 p-3 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 font-mono text-center uppercase"
                  placeholder="ROOM ID"
                  value={joinLobbyId}
                  onChange={(e) => setJoinLobbyId(e.target.value)}
                />
                <button 
                  onClick={joinLobby}
                  disabled={loading}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg shadow-md transition"
                >
                  参加
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertTriangle size={16} /> {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // View: Waiting Room
  if (gameState && gameState.status === 'waiting') {
    const isHost = gameState.hostId === user.uid;
    const playersList = Object.values(gameState.players || {});

    return (
      <div className="min-h-screen bg-slate-50 p-4 max-w-2xl mx-auto">
        <header className="flex items-center justify-between mb-8 p-4 bg-white rounded-xl shadow-sm border border-slate-200">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">ROOM ID</span>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-mono font-bold text-slate-800 tracking-wider">{gameState.id}</h2>
              <button onClick={() => { navigator.clipboard.writeText(gameState.id); alert('コピーしました'); }} className="p-1 hover:bg-slate-100 rounded">
                <Copy size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="mt-1 text-[10px] text-slate-400 font-mono">
               Your ID: {user.uid}
            </div>
          </div>
          <div className="text-right">
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">待機中</span>
          </div>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <Users size={20} className="text-slate-500" />
            <h3 className="font-bold text-slate-700">参加プレイヤー ({playersList.length}/{MAX_PLAYERS})</h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {playersList.map((p) => (
              <li key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className={p.id === user.uid ? "font-bold text-indigo-900" : "text-slate-700"}>
                      {p.name} {p.id === user.uid && "(あなた)"}
                      {p.id === gameState.hostId && <Crown size={14} className="inline ml-2 text-yellow-500" fill="currentColor"/>}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">ID: {p.id}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {isHost ? (
          <button 
            onClick={startGame}
            disabled={playersList.length < 2 || loading}
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition flex items-center justify-center gap-2
              ${playersList.length < 2 
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
          >
            {loading ? '準備中...' : 'ゲームを開始する'}
          </button>
        ) : (
          <div className="text-center p-4 text-slate-500 bg-white rounded-xl border border-slate-200 animate-pulse">
            ホストがゲームを開始するのを待っています...
          </div>
        )}
      </div>
    );
  }

  // View: Game Board & Finished
  if (gameState && (gameState.status === 'playing' || gameState.status === 'finished')) {
    const isHost = gameState.hostId === user.uid;
    const myPlayer = gameState.players[user.uid];
    const playersList = Object.values(gameState.players).sort((a,b) => a.score - b.score);
    const allSelected = playersList.every(p => p.selectedCard !== null);
    
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar: Scoreboard */}
        <div className="w-full md:w-64 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col h-48 md:h-screen overflow-y-auto order-2 md:order-1">
          <div className="p-4 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <Trophy size={18} className="text-yellow-500" /> スコアボード
            </h3>
            <div className="text-[10px] text-slate-400 mt-1 font-mono truncate">ID: {user.uid}</div>
          </div>
          <div className="p-2 space-y-1">
            {playersList.map((p, idx) => (
              <div key={p.id} className={`p-2 rounded-lg flex items-center justify-between text-sm ${p.selectedCard ? 'bg-green-50 border border-green-200' : 'bg-white'}`}>
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className={`font-bold w-5 text-center ${idx === 0 ? 'text-yellow-500' : 'text-slate-400'}`}>
                    #{idx+1}
                  </span>
                  <div className="flex flex-col truncate">
                    <span className="truncate font-medium text-slate-700">{p.name}</span>
                    <span className="text-[9px] text-slate-400 font-mono truncate">{p.id.slice(0,6)}..</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                    -{p.score}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {p.selectedCard ? '選択済' : '考え中...'}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {gameState.status === 'finished' && (
            <div className="p-4 mt-auto border-t border-slate-200">
              <button 
                onClick={() => setLobbyId('')} 
                className="w-full py-2 bg-slate-800 text-white rounded-lg text-sm"
              >
                ロビーに戻る
              </button>
            </div>
          )}
        </div>

        {/* Main Board */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden order-1 md:order-2 relative">
          {/* Header Info */}
          <div className="bg-white/90 backdrop-blur p-3 shadow-sm z-10 flex justify-between items-center absolute w-full top-0">
            <div className="text-xs md:text-sm font-medium text-slate-600">
              {gameState.message || "カードを選択してください"}
            </div>
            {isHost && allSelected && gameState.status === 'playing' && (
              <button 
                onClick={resolveTurn}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white text-xs md:text-sm px-4 py-2 rounded-full font-bold shadow animate-bounce"
              >
                ターンを進める ({loading ? '処理中' : '実行'})
              </button>
            )}
          </div>

          {/* Game Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 pt-16 pb-40 bg-slate-200/50">
            {/* Rows */}
            <div className="space-y-4 max-w-4xl mx-auto">
              {[0, 1, 2, 3].map(rowIndex => (
                <div key={rowIndex} className="flex items-center gap-2 md:gap-4 p-2 md:p-4 bg-white/60 rounded-xl border border-slate-200/60 shadow-sm min-h-[100px] md:min-h-[120px]">
                  <div className="w-6 md:w-8 h-8 md:h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs">
                    {rowIndex + 1}
                  </div>
                  <div className="flex-1 flex gap-2 overflow-x-auto pb-2 items-center">
                    {/* Render Cards in Row */}
                    {(gameState.rows[rowIndex] || []).map((cardNum, i) => (
                      <Card key={`${rowIndex}-${i}-${cardNum}`} number={cardNum} type="board" />
                    ))}
                    {/* Placeholder for visual guidance */}
                    {(gameState.rows[rowIndex] || []).length < 5 && (
                      <div className="w-14 h-20 sm:w-16 sm:h-24 border-2 border-dashed border-slate-300 rounded-lg opacity-30 flex-shrink-0" />
                    )}
                    {(gameState.rows[rowIndex] || []).length >= 5 && (
                       <div className="w-14 h-20 sm:w-16 sm:h-24 border-2 border-red-300 bg-red-50 rounded-lg flex items-center justify-center text-red-400 text-xs text-center p-1">
                         Next Busts!
                       </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono whitespace-nowrap">
                    -{calculateRowPoints(gameState.rows[rowIndex] || [])} pts
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Player Hand Area */}
          {gameState.status === 'playing' && (
            <div className="absolute bottom-0 w-full bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-20">
              <div className="max-w-4xl mx-auto p-4">
                <div className="flex justify-between items-end mb-2">
                  <h4 className="font-bold text-slate-700 text-sm">あなたの手札</h4>
                  {myPlayer.selectedCard && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-bold">
                      選択済み: {myPlayer.selectedCard}
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2 overflow-x-auto pb-2 pt-2 px-1 snap-x">
                  {myPlayer.hand.map((cardNum) => (
                    <div key={cardNum} className="snap-center flex-shrink-0">
                      <Card 
                        number={cardNum} 
                        isSelected={myPlayer.selectedCard === cardNum}
                        onClick={() => !myPlayer.selectedCard && selectCard(cardNum)}
                        type="hand"
                      />
                    </div>
                  ))}
                  {myPlayer.hand.length === 0 && (
                    <div className="w-full text-center py-4 text-slate-400 text-sm">
                      手札がありません
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Game Over Overlay */}
          {gameState.status === 'finished' && (
            <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                <Trophy size={48} className="mx-auto text-yellow-500 mb-4" />
                <h2 className="text-3xl font-black text-slate-800 mb-2">GAME OVER</h2>
                <p className="text-slate-500 mb-6">最終結果</p>
                
                <div className="bg-slate-50 rounded-xl p-4 mb-6 max-h-60 overflow-y-auto">
                  {playersList.map((p, idx) => (
                    <div key={p.id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-center gap-2">
                         <span className={`font-bold ${idx===0 ? 'text-yellow-600 text-xl' : 'text-slate-500'}`}>#{idx+1}</span>
                         <span className="font-medium text-slate-800">{p.name}</span>
                      </div>
                      <span className="font-mono font-bold text-red-600">-{p.score} pts</span>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={() => setLobbyId('')}
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition"
                >
                  トップに戻る
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}


