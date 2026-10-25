import { allPieceIds, type PieceId } from '../data/buildables';
import { ALL_ENEMY_IDS, type EnemyId } from '../data/enemies';
import { ALL_GUN_PART_IDS, type GunPartId } from '../data/guns';
import { OVEN_RECIPES, RECIPES } from '../data/recipes';
import { scoreRun, type BestGun, type ScoreBreakdown, type ScoreInput } from '../data/score';

const KEY = 'aftermath.meta.v1';
const MAX_HISTORY = 40;

export type CodexKind = 'enemy' | 'part' | 'buildable' | 'recipe';

export type { BestGun };

export interface RunRecord {
  issue: number;
  endedAt: number;
  seed: number;
  cause: string;
  abandoned: boolean;
  seconds: number;
  raids: number;
  kills: number;
  killsByType: Partial<Record<EnemyId, number>>;
  bosses: number;
  built: number;
  guns: number;
  gathered: number;
  crafted: number;
  searched: number;
  score: number;
  breakdown: ScoreBreakdown;
  bestGun: BestGun | null;
}

export interface Lifetime {
  runs: number;
  raids: number;
  kills: number;
  bosses: number;
  built: number;
  guns: number;
  seconds: number;
  bestScore: number;
  bestRaids: number;
}

export interface RunDraft extends ScoreInput {
  seed: number;
  cause: string;
  abandoned?: boolean;
  killsByType: Partial<Record<EnemyId, number>>;
  gathered: number;
  crafted: number;
  searched: number;
  bestGun: BestGun | null;
}

export interface RecordedRun {
  run: RunRecord;
  newBest: boolean;
  previousBest: number;
}

interface SaveBlob {
  version: 1;
  lifetime: Lifetime;
  history: RunRecord[];
  discovered: Record<CodexKind, string[]>;
}

const EMPTY_LIFE = (): Lifetime => ({
  runs: 0, raids: 0, kills: 0, bosses: 0, built: 0, guns: 0, seconds: 0, bestScore: 0, bestRaids: 0,
});

/**
 * Everything that survives a death: scores, the issue file, and the Codex.
 * localStorage, no power carried between runs.
 */
export class Meta {
  lifetime: Lifetime;
  history: RunRecord[];
  readonly discovered: Record<CodexKind, Set<string>>;
  bestGun: BestGun | null = null;
  gunsCrafted = 0;

  private constructor(blob: SaveBlob) {
    this.lifetime = blob.lifetime;
    this.history = blob.history;
    this.discovered = {
      enemy: new Set(blob.discovered.enemy),
      part: new Set(blob.discovered.part),
      buildable: new Set(blob.discovered.buildable),
      recipe: new Set(blob.discovered.recipe),
    };
  }

  static load(): Meta {
    return new Meta(readBlob());
  }

  get nextIssue(): number {
    return this.lifetime.runs + 1;
  }

  known(kind: CodexKind, id: string): boolean {
    return this.discovered[kind].has(id);
  }

  /** Returns true the first time this entry is logged. */
  note(kind: CodexKind, id: string): boolean {
    const set = this.discovered[kind];
    if (set.has(id)) return false;
    set.add(id);
    this.persist();
    return true;
  }

  /** Batch unlock (inventory scans, debug kit). Returns the ids that were new. */
  noteMany(kind: CodexKind, ids: readonly string[]): string[] {
    const set = this.discovered[kind];
    const fresh: string[] = [];
    for (const id of ids) {
      if (set.has(id)) continue;
      set.add(id);
      fresh.push(id);
    }
    if (fresh.length) this.persist();
    return fresh;
  }

  noteGun(gun: BestGun): void {
    this.gunsCrafted++;
    if (!this.bestGun || gun.power >= this.bestGun.power) this.bestGun = gun;
  }

  scoreNow(input: ScoreInput) {
    return scoreRun(input);
  }

  record(draft: RunDraft): RecordedRun {
    const scored = scoreRun(draft);
    const previousBest = this.lifetime.bestScore;
    const run: RunRecord = {
      issue: this.nextIssue,
      endedAt: Date.now(),
      seed: draft.seed,
      cause: draft.cause,
      abandoned: !!draft.abandoned,
      seconds: draft.seconds,
      raids: draft.raids,
      kills: draft.kills,
      killsByType: { ...draft.killsByType },
      bosses: draft.bosses,
      built: draft.built,
      guns: draft.guns,
      gathered: draft.gathered,
      crafted: draft.crafted,
      searched: draft.searched,
      score: scored.total,
      breakdown: scored.breakdown,
      bestGun: draft.bestGun,
    };
    this.history.unshift(run);
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
    const first = this.lifetime.runs === 0;
    this.lifetime.runs++;
    this.lifetime.raids += run.raids;
    this.lifetime.kills += run.kills;
    this.lifetime.bosses += run.bosses;
    this.lifetime.built += run.built;
    this.lifetime.guns += run.guns;
    this.lifetime.seconds += run.seconds;
    if (run.score > this.lifetime.bestScore) this.lifetime.bestScore = run.score;
    if (run.raids > this.lifetime.bestRaids) this.lifetime.bestRaids = run.raids;
    this.persist();
    return { run, newBest: first || run.score > previousBest, previousBest };
  }

  leaderboard(): RunRecord[] {
    return [...this.history].sort((a, b) => b.score - a.score || b.raids - a.raids).slice(0, 10);
  }

  unlockAll(): void {
    this.noteMany('enemy', ALL_ENEMY_IDS);
    this.noteMany('part', ALL_GUN_PART_IDS);
    this.noteMany('buildable', allPieceIds());
    this.noteMany('recipe', [...RECIPES.map((r) => r.id), ...OVEN_RECIPES.map((r) => r.id)]);
  }

  logged(kind: CodexKind): number {
    return this.discovered[kind].size;
  }

  private persist(): void {
    const blob: SaveBlob = {
      version: 1,
      lifetime: this.lifetime,
      history: this.history,
      discovered: {
        enemy: [...this.discovered.enemy],
        part: [...this.discovered.part],
        buildable: [...this.discovered.buildable],
        recipe: [...this.discovered.recipe],
      },
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(blob));
    } catch {
      /* quota or private mode — the run still plays, it just will not remember */
    }
  }
}

export const CODEX_TOTALS = {
  enemy: ALL_ENEMY_IDS.length,
  part: ALL_GUN_PART_IDS.length,
  buildable: allPieceIds().length,
  recipe: RECIPES.length + OVEN_RECIPES.length,
} as const;

export const CODEX_IDS = {
  enemy: ALL_ENEMY_IDS as readonly string[],
  part: ALL_GUN_PART_IDS as readonly GunPartId[],
  buildable: allPieceIds() as readonly PieceId[],
  recipe: [...RECIPES.map((r) => r.id), ...OVEN_RECIPES.map((r) => r.id)],
};

function readBlob(): SaveBlob {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyBlob();
    const parsed = JSON.parse(raw) as Partial<SaveBlob>;
    if (parsed.version !== 1 || !parsed.lifetime || !Array.isArray(parsed.history)) return emptyBlob();
    return {
      version: 1,
      lifetime: { ...EMPTY_LIFE(), ...parsed.lifetime },
      history: parsed.history.filter(isRun),
      discovered: {
        enemy: strings(parsed.discovered?.enemy),
        part: strings(parsed.discovered?.part),
        buildable: strings(parsed.discovered?.buildable),
        recipe: strings(parsed.discovered?.recipe),
      },
    };
  } catch {
    return emptyBlob();
  }
}

function emptyBlob(): SaveBlob {
  return {
    version: 1,
    lifetime: EMPTY_LIFE(),
    history: [],
    discovered: { enemy: [], part: [], buildable: [], recipe: [] },
  };
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function isRun(v: unknown): v is RunRecord {
  return !!v && typeof v === 'object' && typeof (v as RunRecord).score === 'number' && typeof (v as RunRecord).seed === 'number';
}
