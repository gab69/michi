"use client";

import { Sora, Inter } from "next/font/google";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../app/globals.css";

// ---------------------------------------------------------------------------
// Tipografía
// ---------------------------------------------------------------------------
const sora = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const RANKING_STORAGE_KEY = "tictactoe-ranking";
const STATS_STORAGE_KEY = "tictactoe-stats";

type Screen = "menu" | "game" | "gameover" | "ranking" | "stats";
type Cell = "X" | "O" | null;
type Board = Cell[];
type Player = "X" | "O";
type Difficulty = "easy" | "medium" | "hard" | "impossible";

// Líneas ganadoras precalculadas
const WIN_LINES: readonly [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // filas
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columnas
  [0, 4, 8], [2, 4, 6],            // diagonales
] as const;

interface RankingEntry {
  name: string;
  wins: number;
  difficulty: Difficulty;
  date: string;
}

interface Stats {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
}

const DIFFICULTY_INFO: Record<Difficulty, { label: string; desc: string; badge: string }> = {
  easy: { label: "Fácil", desc: "La IA juega al azar", badge: "bg-emerald-100 text-emerald-700" },
  medium: { label: "Normal", desc: "La IA bloquea a veces", badge: "bg-amber-100 text-amber-700" },
  hard: { label: "Difícil", desc: "La IA juega bien", badge: "bg-orange-100 text-orange-700" },
  impossible: { label: "Imposible", desc: "Es imposible ganar (empate máx.)", badge: "bg-red-100 text-red-700" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function emptyBoard(): Board {
  return Array(9).fill(null);
}

function checkWinner(board: Board): { winner: Player; line: number[] } | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as Player, line: [a, b, c] };
    }
  }
  return null;
}

function isFull(board: Board): boolean {
  return board.every((c) => c !== null);
}

function emptyIndices(board: Board): number[] {
  const idx: number[] = [];
  for (let i = 0; i < 9; i++) if (board[i] === null) idx.push(i);
  return idx;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// IA — Minimax con poda alpha-beta
// ---------------------------------------------------------------------------
function minimax(board: Board, depth: number, isMax: boolean, alpha: number, beta: number, aiPlayer: Player, humanPlayer: Player): number {
  const result = checkWinner(board);
  if (result) {
    if (result.winner === aiPlayer) return 10 - depth;
    if (result.winner === humanPlayer) return depth - 10;
  }
  if (isFull(board)) return 0;

  if (isMax) {
    let best = -Infinity;
    for (const i of emptyIndices(board)) {
      board[i] = aiPlayer;
      best = Math.max(best, minimax(board, depth + 1, false, alpha, beta, aiPlayer, humanPlayer));
      board[i] = null;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of emptyIndices(board)) {
      board[i] = humanPlayer;
      best = Math.min(best, minimax(board, depth + 1, true, alpha, beta, aiPlayer, humanPlayer));
      board[i] = null;
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function bestMoveMinimax(board: Board, aiPlayer: Player, humanPlayer: Player): number {
  let bestScore = -Infinity;
  let move = -1;
  for (const i of emptyIndices(board)) {
    board[i] = aiPlayer;
    const score = minimax(board, 0, false, -Infinity, Infinity, aiPlayer, humanPlayer);
    board[i] = null;
    if (score > bestScore) {
      bestScore = score;
      move = i;
    }
  }
  return move;
}

function findWinningMove(board: Board, player: Player): number | null {
  for (const [a, b, c] of WIN_LINES) {
    const cells = [board[a], board[b], board[c]];
    const playerCount = cells.filter((v) => v === player).length;
    const emptyCount = cells.filter((v) => v === null).length;
    if (playerCount === 2 && emptyCount === 1) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }
  return null;
}

function getAIMove(board: Board, difficulty: Difficulty, aiPlayer: Player, humanPlayer: Player): number {
  const empties = emptyIndices(board);
  if (empties.length === 0) return -1;

  switch (difficulty) {
    case "easy": {
      if (Math.random() < 0.7) return pickRandom(empties);
      const block = findWinningMove(board, humanPlayer);
      if (block !== null) return block;
      return pickRandom(empties);
    }
    case "medium": {
      if (Math.random() < 0.4) return pickRandom(empties);
      const win = findWinningMove(board, aiPlayer);
      if (win !== null) return win;
      const block = findWinningMove(board, humanPlayer);
      if (block !== null) return block;
      if (board[4] === null) return 4;
      const corners = [0, 2, 6, 8].filter((i) => board[i] === null);
      if (corners.length > 0) return pickRandom(corners);
      return pickRandom(empties);
    }
    case "hard": {
      if (Math.random() < 0.15) return pickRandom(empties);
      return bestMoveMinimax([...board], aiPlayer, humanPlayer);
    }
    case "impossible":
    default:
      return bestMoveMinimax([...board], aiPlayer, humanPlayer);
  }
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------
function loadRanking(): RankingEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RANKING_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as RankingEntry[]) : [];
  } catch {
    return [];
  }
}

function saveRanking(ranking: RankingEntry[]) {
  try {
    localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(ranking));
  } catch {
    /* ignore */
  }
}

function loadStats(): Stats {
  if (typeof window === "undefined") return { wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 };
  try {
    const stored = localStorage.getItem(STATS_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Stats) : { wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 };
  } catch {
    return { wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 };
  }
}

function saveStats(stats: Stats) {
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Iconos — IconProps extendido para aceptar todas las props nativas del SVG
// ---------------------------------------------------------------------------
type IconProps = React.SVGProps<SVGSVGElement>;
const iconBase = "1.75";

const IconX = ({ className = "w-6 h-6", ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className} {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const IconO = ({ className = "w-6 h-6", ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} {...props}>
    <circle cx="12" cy="12" r="7" />
  </svg>
);

const IconGrid = ({ className = "w-6 h-6", ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
  </svg>
);

const IconTrophy = ({ className = "w-6 h-6", ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M7 4h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V4Z" />
    <path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" />
    <path d="M12 13v3m-3 4h6m-3 0v-4" />
  </svg>
);

const IconChart = ({ className = "w-5 h-5", ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

const IconExit = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h11" />
  </svg>
);

const IconExpand = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
  </svg>
);

const IconCollapse = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
  </svg>
);

const IconPlay = ({ className = "w-5 h-5", ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </svg>
);

const IconFlame = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M12 3c2 3 4 5 4 9a4 4 0 1 1-8 0c0-1.5.5-2.5 1.5-3.5C9 10 9 11 10 11c0-3 1-5 2-8Z" />
  </svg>
);

// ---------------------------------------------------------------------------
// Estilos base
// ---------------------------------------------------------------------------
const BRAND_BACKDROP =
  "relative bg-[radial-gradient(120%_100%_at_50%_-10%,#FF3B4E_0%,#C81E2C_45%,#7A0F1C_100%)] " +
  "before:content-[''] before:absolute before:inset-0 before:opacity-[0.06] before:pointer-events-none " +
  "before:bg-[radial-gradient(circle_at_1px_1px,#FFFFFF_1px,transparent_0)] before:bg-[length:22px_22px]";

const CARD_SURFACE = "rounded-3xl bg-white shadow-[0_25px_70px_-20px_rgba(0,0,0,0.55)] border border-black/5";

const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 bg-[#C81E2C] hover:bg-[#A6172A] active:scale-[0.98] text-white font-semibold rounded-xl shadow-lg shadow-[#C81E2C]/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

const BTN_GHOST_LIGHT =
  "inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-full transition-colors duration-200";

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function TicTacToeGame() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [board, setBoard] = useState<Board>(emptyBoard());
  const [currentPlayer, setCurrentPlayer] = useState<Player>("X");
  const [humanPlayer, setHumanPlayer] = useState<Player>("X");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [winner, setWinner] = useState<Player | "draw" | null>(null);
  const [winningLine, setWinningLine] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [stats, setStats] = useState<Stats>({ wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [gameCount, setGameCount] = useState(0);

  const aiPlayer = humanPlayer === "X" ? "O" : "X";
  const isPlayerTurn = currentPlayer === humanPlayer;
  const isGameOver = winner !== null;

  // ---------------------------------------------------------------------
  // Fullscreen
  // ---------------------------------------------------------------------
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ---------------------------------------------------------------------
  // Persistencia
  // ---------------------------------------------------------------------
  useEffect(() => {
    setRanking(loadRanking());
    setStats(loadStats());
  }, []);

  useEffect(() => {
    saveRanking(ranking);
  }, [ranking]);

  useEffect(() => {
    saveStats(stats);
  }, [stats]);

  // ---------------------------------------------------------------------
  // Nueva partida
  // ---------------------------------------------------------------------
  const startNewGame = useCallback((difficultyOverride?: Difficulty, humanOverride?: Player) => {
    const diff = difficultyOverride ?? difficulty;
    const human = humanOverride ?? humanPlayer;
    setBoard(emptyBoard());
    setCurrentPlayer("X");
    setHumanPlayer(human);
    setDifficulty(diff);
    setWinner(null);
    setWinningLine([]);
    setShowResult(false);
    setAiThinking(false);
    setGameCount((c) => c + 1);
  }, [difficulty, humanPlayer]);

  const goToMenu = useCallback(() => {
    setScreen("menu");
    setShowResult(false);
  }, []);

  const startGameFromMenu = useCallback((diff: Difficulty) => {
    setScreen("game");
    startNewGame(diff, "X");
  }, [startNewGame]);

  // ---------------------------------------------------------------------
  // Turno IA
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (screen !== "game") return;
    if (isGameOver) return;
    if (currentPlayer !== aiPlayer) return;

    setAiThinking(true);
    const delay = 350 + Math.random() * 300;
    const timeout = setTimeout(() => {
      const move = getAIMove([...board], difficulty, aiPlayer, humanPlayer);
      if (move < 0) {
        setAiThinking(false);
        return;
      }
      setBoard((prev) => {
        const next = [...prev];
        next[move] = aiPlayer;
        return next;
      });
      setCurrentPlayer(humanPlayer);
      setAiThinking(false);
    }, delay);
    return () => clearTimeout(timeout);
  }, [currentPlayer, board, aiPlayer, humanPlayer, difficulty, isGameOver, screen]);

  // ---------------------------------------------------------------------
  // Detectar fin de partida
  // ---------------------------------------------------------------------
  useEffect(() => {
    const result = checkWinner(board);
    if (result) {
      setWinner(result.winner);
      setWinningLine(result.line);
      const timeout = setTimeout(() => setShowResult(true), 700);
      return () => clearTimeout(timeout);
    }
    if (isFull(board)) {
      setWinner("draw");
      const timeout = setTimeout(() => setShowResult(true), 700);
      return () => clearTimeout(timeout);
    }
  }, [board]);

  // ---------------------------------------------------------------------
  // Actualizar stats
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!showResult) return;
    if (winner === null) return;
    setStats((prev) => {
      const next = { ...prev };
      if (winner === humanPlayer) {
        next.wins += 1;
        next.streak += 1;
        next.bestStreak = Math.max(next.bestStreak, next.streak);
      } else if (winner === aiPlayer) {
        next.losses += 1;
        next.streak = 0;
      } else {
        next.draws += 1;
      }
      return next;
    });
  }, [showResult, winner, humanPlayer, aiPlayer]);

  // ---------------------------------------------------------------------
  // Ranking (solo victorias)
  // ---------------------------------------------------------------------
  const [showNameInput, setShowNameInput] = useState(false);
  const [playerName, setPlayerName] = useState("");

  const saveWinToRanking = useCallback(() => {
    if (winner !== humanPlayer) return;
    const entry: RankingEntry = {
      name: playerName.trim() || "Anónimo",
      wins: 1,
      difficulty,
      date: new Date().toLocaleString(),
    };
    setRanking((prev) => [...prev, entry].sort((a, b) => b.wins - a.wins).slice(0, 10));
    setPlayerName("");
    setShowNameInput(false);
  }, [winner, humanPlayer, playerName, difficulty]);

  // ---------------------------------------------------------------------
  // Click del jugador
  // ---------------------------------------------------------------------
  const handleCellClick = useCallback(
    (index: number) => {
      if (screen !== "game") return;
      if (isGameOver) return;
      if (!isPlayerTurn) return;
      if (aiThinking) return;
      if (board[index] !== null) return;

      setBoard((prev) => {
        const next = [...prev];
        next[index] = humanPlayer;
        return next;
      });
      setCurrentPlayer(aiPlayer);
    },
    [screen, isGameOver, isPlayerTurn, aiThinking, board, humanPlayer, aiPlayer]
  );

  const fontVars = `${sora.variable} ${inter.variable}`;

  // =====================================================================
  // PANTALLA: MENÚ
  // =====================================================================
  if (screen === "menu") {
    return (
      <div className={`${fontVars} font-[family-name:var(--font-body)] flex flex-col justify-center items-center min-h-screen p-6 text-center ${BRAND_BACKDROP}`}>
        <div className="relative flex flex-col items-center animate-[fadeUp_0.6s_ease-out] w-full max-w-lg">
          <img
            src="logo-caja.webp"
            alt="Caja Huancayo"
            className="w-full max-w-[180px] h-auto mb-6 drop-shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          />

          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/25 px-4 py-1.5 text-xs font-semibold tracking-wide text-white mb-5 backdrop-blur-sm">
            <IconGrid className="w-3.5 h-3.5" />
            Un jugador vs IA
          </span>

          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-3">
            Tres en raya
          </h1>
          <p className="text-white/75 max-w-sm mb-8">
            Elige la dificultad y demuestra que puedes vencer a la máquina.
          </p>

          {/* Selector de dificultad */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-md mb-6">
            {(["easy", "medium", "hard", "impossible"] as Difficulty[]).map((diff) => {
              const info = DIFFICULTY_INFO[diff];
              return (
                <button
                  key={diff}
                  onClick={() => startGameFromMenu(diff)}
                  className="group flex flex-col items-start gap-1 bg-white hover:bg-[#FFF5F5] active:scale-[0.98] p-4 rounded-2xl text-left shadow-lg border border-black/5 transition-all duration-200"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-[family-name:var(--font-display)] font-bold text-[#1A0A0D]">{info.label}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.badge}`}>
                      {diff === "impossible" ? "★" : diff === "hard" ? "★★" : diff === "medium" ? "★" : "○"}
                    </span>
                  </div>
                  <span className="text-xs text-[#7A0F1C]/70 leading-snug">{info.desc}</span>
                </button>
              );
            })}
          </div>

          {/* Récord rápido */}
          {stats.wins + stats.losses + stats.draws > 0 && (
            <div className="flex items-center gap-4 mb-6 text-xs text-white/70">
              <span>Victorias: <span className="font-bold text-white">{stats.wins}</span></span>
              <span className="w-1 h-1 rounded-full bg-white/40" />
              <span>Racha: <span className="font-bold text-white">{stats.streak}</span></span>
            </div>
          )}

          <div className="flex items-center gap-6">
            <button
              onClick={() => setScreen("ranking")}
              className="text-white/80 hover:text-white text-sm font-medium underline underline-offset-4 decoration-white/30 hover:decoration-white transition-colors"
            >
              Ver ranking
            </button>
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <button
              onClick={() => setScreen("stats")}
              className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium transition-colors"
            >
              <IconChart className="w-3.5 h-3.5" />
              Estadísticas
            </button>
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <button
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium transition-colors"
            >
              {isFullscreen ? <IconCollapse /> : <IconExpand />}
            </button>
          </div>
        </div>

        <style jsx>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(14px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .animate-\\[fadeUp_0\\.6s_ease-out\\] { animation: none; }
          }
        `}</style>
      </div>
    );
  }

  // =====================================================================
  // PANTALLA: RANKING
  // =====================================================================
  if (screen === "ranking") {
    return (
      <div className={`${fontVars} font-[family-name:var(--font-body)] min-h-screen p-6 flex flex-col items-center ${BRAND_BACKDROP}`}>
        <div className="relative w-full max-w-md flex flex-col items-center pt-4">
          <IconTrophy className="w-10 h-10 text-white mb-2" />
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-white mb-2">Ranking local</h1>
          <p className="text-white/60 text-xs mb-8">Solo se registran las victorias</p>

          {ranking.length === 0 ? (
            <div className="w-full rounded-2xl bg-white/10 border border-white/20 p-8 text-center backdrop-blur-sm">
              <p className="text-white/85">Aún no hay victorias registradas. ¡Sé el primero!</p>
            </div>
          ) : (
            <ul className="w-full rounded-2xl bg-white shadow-xl overflow-hidden divide-y divide-black/5">
              {ranking.map((r, i) => (
                <li key={`${r.name}-${i}`} className="flex items-center justify-between px-4 py-3 text-[#1A0A0D]">
                  <span className={`text-sm font-bold w-6 ${i === 0 ? "text-[#FFD700]" : i === 1 ? "text-[#C0C0C0]" : i === 2 ? "text-[#CD7F32]" : "text-[#C81E2C]"}`}>
                    #{i + 1}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{r.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mr-2 ${DIFFICULTY_INFO[r.difficulty].badge}`}>
                    {DIFFICULTY_INFO[r.difficulty].label}
                  </span>
                  <span className="font-[family-name:var(--font-display)] font-bold text-sm">{r.wins}V</span>
                </li>
              ))}
            </ul>
          )}

          <button onClick={() => setScreen("menu")} className={`mt-8 px-6 py-2.5 text-sm ${BTN_GHOST_LIGHT}`}>
            <IconExit className="w-4 h-4 rotate-180" />
            Volver al menú
          </button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // PANTALLA: ESTADÍSTICAS
  // =====================================================================
  if (screen === "stats") {
    const total = stats.wins + stats.losses + stats.draws;
    const winRate = total > 0 ? Math.round((stats.wins / total) * 100) : 0;
    return (
      <div className={`${fontVars} font-[family-name:var(--font-body)] min-h-screen p-6 flex flex-col items-center ${BRAND_BACKDROP}`}>
        <div className="relative w-full max-w-md flex flex-col items-center pt-4">
          <IconChart className="w-10 h-10 text-white mb-2" />
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-white mb-8">Estadísticas</h1>

          <div className={`w-full p-6 ${CARD_SURFACE}`}>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="text-center p-3 rounded-2xl bg-emerald-50">
                <p className="text-[10px] text-emerald-700/70 font-semibold uppercase mb-1">Victorias</p>
                <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-emerald-600">{stats.wins}</p>
              </div>
              <div className="text-center p-3 rounded-2xl bg-red-50">
                <p className="text-[10px] text-red-700/70 font-semibold uppercase mb-1">Derrotas</p>
                <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-[#C81E2C]">{stats.losses}</p>
              </div>
              <div className="text-center p-3 rounded-2xl bg-slate-50">
                <p className="text-[10px] text-slate-700/70 font-semibold uppercase mb-1">Empates</p>
                <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-slate-600">{stats.draws}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FFF5F5]">
                <span className="text-sm text-[#7A0F1C]">Tasa de victoria</span>
                <span className="font-[family-name:var(--font-display)] font-bold text-[#C81E2C]">{winRate}%</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FFF5F5]">
                <span className="text-sm text-[#7A0F1C] flex items-center gap-1.5">
                  <IconFlame className="w-4 h-4 text-[#FF8C00]" /> Racha actual
                </span>
                <span className="font-[family-name:var(--font-display)] font-bold text-[#C81E2C]">{stats.streak}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FFF5F5]">
                <span className="text-sm text-[#7A0F1C] flex items-center gap-1.5">
                  <IconFlame className="w-4 h-4 text-[#FFD700]" /> Mejor racha
                </span>
                <span className="font-[family-name:var(--font-display)] font-bold text-[#C81E2C]">{stats.bestStreak}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FFF5F5]">
                <span className="text-sm text-[#7A0F1C]">Partidas totales</span>
                <span className="font-[family-name:var(--font-display)] font-bold text-[#C81E2C]">{total}</span>
              </div>
            </div>
          </div>

          <button onClick={() => setScreen("menu")} className={`mt-8 px-6 py-2.5 text-sm ${BTN_GHOST_LIGHT}`}>
            <IconExit className="w-4 h-4 rotate-180" />
            Volver al menú
          </button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // PANTALLA: JUEGO
  // =====================================================================
  const statusText = (() => {
    if (winner === "draw") return "¡Empate!";
    if (winner === humanPlayer) return "¡Ganaste!";
    if (winner === aiPlayer) return "La IA ganó";
    if (aiThinking) return "La IA está pensando...";
    return "Tu turno";
  })();

  const statusColor = (() => {
    if (winner === humanPlayer) return "text-emerald-600";
    if (winner === aiPlayer) return "text-[#C81E2C]";
    if (winner === "draw") return "text-slate-600";
    if (aiThinking) return "text-[#7A0F1C]/60";
    return "text-[#1A0A0D]";
  })();

  return (
    <div className={`${fontVars} font-[family-name:var(--font-body)] flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 ${BRAND_BACKDROP}`}>
      {/* HUD superior */}
      <div className="relative w-full max-w-md flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="font-[family-name:var(--font-display)] text-white/60 text-sm font-semibold">Tú</span>
          {humanPlayer === "X" ? (
            <IconX className="w-5 h-5 text-white" />
          ) : (
            <IconO className="w-5 h-5 text-white" />
          )}
          <span className="text-white/30 text-sm">vs</span>
          <IconGrid className="w-4 h-4 text-white/60" />
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DIFFICULTY_INFO[difficulty].badge}`}>
            {DIFFICULTY_INFO[difficulty].label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/25 backdrop-blur-sm px-3 py-1.5 text-xs font-bold text-white">
            <IconTrophy className="w-3.5 h-3.5" />
            {stats.wins}
          </div>
          <button
            onClick={goToMenu}
            aria-label="Volver al menú"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-white transition-colors"
          >
            <IconExit className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tarjeta del juego */}
      <div className={`w-full max-w-md p-6 sm:p-8 ${CARD_SURFACE}`}>
        {/* Estado */}
        <div className="text-center mb-6">
          <p className={`font-[family-name:var(--font-display)] text-2xl font-bold ${statusColor} transition-colors`}>
            {statusText}
          </p>
          {!isGameOver && (
            <p className="text-xs text-[#7A0F1C]/60 mt-1">
              {isPlayerTurn ? "Haz clic en una casilla libre" : "Espera tu turno"}
            </p>
          )}
        </div>

        {/* Tablero */}
        <div className="relative grid grid-cols-3 gap-2 sm:gap-3 aspect-square w-full">
          {board.map((cell, i) => {
            const isWinning = winningLine.includes(i);
            const isEmpty = cell === null;
            const canClick = isEmpty && isPlayerTurn && !isGameOver && !aiThinking;

            return (
              <button
                key={i}
                onClick={() => handleCellClick(i)}
                disabled={!canClick}
                aria-label={`Casilla ${i + 1}${cell ? ` ocupada por ${cell}` : " libre"}`}
                className={`relative rounded-2xl flex items-center justify-center transition-all duration-200 ${
                  isWinning
                    ? "bg-gradient-to-br from-[#FFE5E5] to-[#FFD0D0] shadow-[0_0_0_3px_#C81E2C,0_10px_25px_-8px_rgba(200,30,44,0.5)]"
                    : "bg-[#FFF5F5] border-2 border-[#C81E2C]/10"
                } ${canClick ? "hover:bg-[#FFE5E5] hover:border-[#C81E2C]/30 cursor-pointer active:scale-95" : "cursor-default"} ${
                  isEmpty && !canClick ? "opacity-80" : ""
                }`}
              >
                {cell === "X" && (
                  <IconX
                    className={`w-1/2 h-1/2 transition-all ${
                      isWinning ? "text-[#C81E2C]" : "text-[#7A0F1C]"
                    }`}
                    style={{ animation: "popIn 0.25s ease-out" }}
                  />
                )}
                {cell === "O" && (
                  <IconO
                    className={`w-1/2 h-1/2 transition-all ${
                      isWinning ? "text-[#C81E2C]" : "text-[#7A0F1C]"
                    }`}
                    style={{ animation: "popIn 0.25s ease-out" }}
                  />
                )}
              </button>
            );
          })}

          {/* Línea ganadora */}
          {winningLine.length === 3 && (
            <svg
              className="absolute inset-0 pointer-events-none w-full h-full"
              viewBox="0 0 300 300"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line
                x1={winningLine[0] % 3 === 0 ? 50 : winningLine[0] % 3 === 1 ? 150 : 250}
                y1={Math.floor(winningLine[0] / 3) === 0 ? 50 : Math.floor(winningLine[0] / 3) === 1 ? 150 : 250}
                x2={winningLine[2] % 3 === 0 ? 50 : winningLine[2] % 3 === 1 ? 150 : 250}
                y2={Math.floor(winningLine[2] / 3) === 0 ? 50 : Math.floor(winningLine[2] / 3) === 1 ? 150 : 250}
                stroke="#C81E2C"
                strokeWidth="8"
                strokeLinecap="round"
                style={{ animation: "drawLine 0.5s ease-out forwards", strokeDasharray: 500, strokeDashoffset: 500 }}
              />
            </svg>
          )}
        </div>

        {/* Botones */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => startNewGame()}
            className={`flex-1 px-4 py-3 ${BTN_PRIMARY}`}
          >
            Nueva partida
          </button>
          <button
            onClick={goToMenu}
            className="px-4 py-3 rounded-xl border border-black/10 text-[#1A0A0D] font-medium hover:bg-black/5 transition-colors"
          >
            Menú
          </button>
        </div>
      </div>

      {/* Modal de resultado */}
      {showResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-7 rounded-2xl max-w-sm w-full shadow-2xl border border-black/5 text-center">
            <div className={`mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center ${
              winner === humanPlayer ? "bg-emerald-100" : winner === aiPlayer ? "bg-red-100" : "bg-slate-100"
            }`}>
              {winner === humanPlayer ? (
                <IconTrophy className="w-8 h-8 text-emerald-600" />
              ) : winner === aiPlayer ? (
                <IconX className="w-8 h-8 text-[#C81E2C]" />
              ) : (
                <IconGrid className="w-8 h-8 text-slate-500" />
              )}
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#1A0A0D] mb-1">
              {winner === humanPlayer ? "¡Ganaste!" : winner === aiPlayer ? "Perdiste" : "Empate"}
            </h3>
            <p className="text-[#7A0F1C]/70 mb-6 text-sm">
              {winner === humanPlayer
                ? `Venciste a la IA en dificultad ${DIFFICULTY_INFO[difficulty].label}`
                : winner === aiPlayer
                ? "La IA jugó mejor esta vez. ¡Inténtalo de nuevo!"
                : "Nadie pudo ganar. Buen juego."}
            </p>

            {/* Racha actual */}
            {stats.streak > 1 && winner === humanPlayer && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FFD700] to-[#FF8C00] px-4 py-1.5 text-xs font-extrabold text-[#7A0F1C] mb-4">
                <IconFlame className="w-4 h-4" />
                {stats.streak} victorias seguidas
              </div>
            )}

            {winner === humanPlayer && !showNameInput && (
              <button
                onClick={() => setShowNameInput(true)}
                className={`w-full px-6 py-3 mb-3 ${BTN_PRIMARY}`}
              >
                Registrar en el ranking
              </button>
            )}

            {winner === humanPlayer && showNameInput && (
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Tu nombre"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveWinToRanking()}
                  maxLength={20}
                  autoFocus
                  className="w-full p-3 rounded-xl border border-black/10 bg-white mb-2 text-[#1A0A0D] outline-none focus:ring-2 focus:ring-[#C81E2C] focus:border-transparent transition-shadow text-center"
                />
                <button onClick={saveWinToRanking} className={`w-full px-6 py-3 ${BTN_PRIMARY}`}>
                  Guardar
                </button>
              </div>
            )}

            <button
              onClick={() => startNewGame()}
              className={`w-full px-6 py-3 mb-2 ${winner === humanPlayer ? "bg-black/5 hover:bg-black/10 text-[#1A0A0D]" : BTN_PRIMARY} rounded-xl font-semibold transition-colors`}
            >
              Jugar de nuevo
            </button>
            <button
              onClick={goToMenu}
              className="w-full text-[#7A0F1C] hover:text-[#C81E2C] px-6 py-2 text-sm font-semibold transition-colors"
            >
              Volver al menú
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.4); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes drawLine {
          from { stroke-dashoffset: 500; }
          to { stroke-dashoffset: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}