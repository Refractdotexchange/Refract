/**
 * Frame constants for the three bespoke films in `src/films`.
 *
 * They live in their own module, free of JSX, so `music/emit-cues.mjs` can
 * bundle them alongside the motion-type scripts and hand the real numbers to
 * the scorer. The eight films in `src/scenes` restate their frame constants
 * inside `compose.mjs` and carry a warning about keeping the two in step;
 * these three cannot drift, because there is only one copy.
 */

export const FILMS_FPS = 30;

/**
 * HEAD TO HEAD — the same trade run down two lanes at once.
 * A single-pool router on the left, every venue on the right.
 */
export const HEAD = {
  /** Lanes drop in. */
  lanes: 34,
  /** The 1 ETH input splits and enters both lanes. */
  send: 66,
  /** The left lane finds its one pool and stops. */
  leftLand: 148,
  /** The right lane's five probes resolve, one every `probeGap`. */
  probeFrom: 96,
  probeGap: 22,
  rightLand: 250,
  /** The gap between the two results opens up. */
  delta: 296,
  /** Closing line. */
  line: 372,
  end: 438,
  duration: 534,
} as const;

/**
 * TOKEN FACES — the generated avatar wall.
 * Addresses stream in and each one blooms into the disc the app would draw
 * for it, using the same hash the product ships.
 */
export const FACES = {
  /** The first address types itself out. */
  type: 12,
  /** It resolves into a single large disc. */
  bloom: 62,
  /** The wall starts filling. */
  wallFrom: 110,
  /** 4 frames apart so the last of the 48 lands at 298, before `hero`. At 6
      the wall was still filling while the hero stepped back out of it. */
  wallGap: 4,
  wallCount: 48,
  /** The wall settles and one token steps forward. */
  hero: 320,
  line: 374,
  end: 438,
  duration: 534,
} as const;

/**
 * ONE SCREEN — the product itself, driven once through a trade.
 * The only film in the set that shows the real interface rather than an
 * abstraction of it.
 */
export const SCREEN = {
  /** The window assembles. */
  window: 20,
  /** The amount is typed into the sell field. */
  amount: 62,
  /** Quotes start resolving, one every `rowGap`. */
  quoteFrom: 128,
  rowGap: 20,
  /** The winner is picked and lifts. */
  pick: 268,
  /** Price impact reads out. */
  impact: 322,
  /** Approval is scoped to the exact amount. */
  approve: 392,
  /** Signed. */
  done: 458,
  end: 516,
  duration: 612,
} as const;

/* ---------- the questions set --------------------------------------------

   Three films sharing the header art's visual language: a drifting field of
   question marks with Facet flying a thruster through it. They carry the
   contract address, so they are the launch-facing cut of the set.
-------------------------------------------------------------------------- */

/**
 * QUESTIONS — the field, answered one mark at a time.
 * Five real questions a trader has, each flipping to what the app does.
 */
export const QUESTIONS = {
  /** The field fades up. */
  field: 24,
  /** Facet enters from the left. */
  enter: 58,
  /** First card. Each holds `cardHold`, and the next follows immediately. */
  cardFrom: 96,
  cardHold: 92,
  cards: 5,
  /** Everything clears and the closing line lands. */
  clearAt: 96 + 92 * 5,
  line: 96 + 92 * 5 + 40,
  end: 96 + 92 * 5 + 128,
  duration: 96 + 92 * 5 + 128 + 96,
} as const;

/**
 * LIFTOFF — a vertical climb. The shortest of the three and the one built to
 * open a launch post.
 */
export const LIFTOFF = {
  /** Ignition. */
  fire: 22,
  /** The climb proper, past the stat markers. */
  climb: 54,
  markerFrom: 76,
  markerGap: 46,
  markers: 4,
  /** Apex: he clears the field and the address lands. */
  apex: 286,
  ca: 322,
  end: 412,
  duration: 508,
} as const;

/**
 * CHECK THE ADDRESS — three tokens wearing one name, and the only field that
 * tells them apart.
 */
export const CHECK = {
  cardsFrom: 40,
  cardGap: 26,
  /** The name and symbol are shown to match. */
  match: 148,
  /** The addresses resolve, and they do not. */
  reveal: 214,
  /** Ours, in full. */
  ours: 306,
  line: 388,
  end: 452,
  duration: 548,
} as const;

/**
 * SHIELDED FLOW — the private pool, driven once from empty to change.
 *
 * The second film to show the real interface rather than an abstraction. It
 * runs the whole utility in one take: unlock, deposit an arbitrary amount,
 * spend part of it to a fresh address, and land on the change that stays
 * hidden. The chain's own view runs beside it the entire time, so what is
 * public and what is not can be compared frame by frame rather than claimed.
 */
export const SHIELD = {
  /** The window assembles. */
  window: 18,
  /** One signature derives the spending key. */
  unlock: 72,
  /** Balance resolves, at zero. */
  unlocked: 124,
  /** An arbitrary amount is typed. No denominations to pick from. */
  typeIn: 164,
  /** Shielded. The chain sees the deposit arrive. */
  shield: 238,
  shielded: 282,
  /** Switch to spending. */
  toWithdraw: 340,
  /** Part of the note, and a recipient that has never been used. */
  typeOut: 378,
  /** Proving, in the browser. */
  prove: 462,
  /** Paid. The chain sees a withdrawal it cannot link to the deposit. */
  sent: 556,
  /** What is left stays hidden. */
  change: 598,
  line: 658,
  end: 718,
  duration: 814,
} as const;

/**
 * PRIVATE SWAP — the routing engine and the shielded pool, meeting.
 *
 * The only film where both halves of the product are on screen at once: every
 * venue on the chain is quoted, and the pool rather than the trader executes
 * the winner. It carries the honest line too, because the trade is visible and
 * only the trader is not.
 */
export const PSWAP = {
  /** Balance, already shielded. */
  window: 16,
  /** A token is chosen. */
  token: 72,
  /** Venues start reporting, one every `venueGap`. */
  quoteFrom: 128,
  venueGap: 18,
  venues: 5,
  /** The winner lifts out of the list. */
  pick: 236,
  /** Proving, in the browser. */
  prove: 292,
  /** The pool executes. */
  execute: 372,
  /** The chain's version of events. */
  chain: 428,
  /** And the one row it cannot fill in. */
  unknown: 496,
  line: 560,
  end: 620,
  duration: 716,
} as const;

/**
 * MAINNET LIVE — the launch film.
 *
 * Four things shipped, so four beats, each carrying a figure taken from a real
 * run rather than an illustration: the venue spread the router actually found,
 * the baseline and fill from a simulation against live state, the deposit and
 * partial spend from the pool, and the swap the pool executed.
 */
export const MAINNET = {
  /*
   * Timed to the track rather than the other way round.
   *
   * The first cut put the four features landing at 22.9s, which fell straight
   * into the music's one deep break, so the biggest moment in the picture sat
   * under the quietest moment in the score. The music peaks at 20 to 21
   * seconds and has faded to nothing by 27, so the payoff moved onto that peak
   * and the film now ends before the audio dies rather than after.
   */
  title: 14,
  /** Venues report in. */
  route: 80,
  routeBest: 150,
  /** What the fee is carved out of. */
  cash: 215,
  cashClaim: 280,
  /** Any amount in, any part out. */
  send: 345,
  sendChange: 410,
  /** The pool trades, not you. */
  swap: 475,
  swapUnknown: 545,
  /** All four, lit. Lands on the music's peak. */
  cards: 624,
  line: 690,
  end: 730,
  duration: 810,
} as const;

/** DIMENSIONAL — the camera orbit around an extruded Facet. */
export const DIMENSIONAL = {
  /** He arrives and the dolly settles. */
  settle: 46,
  /** Camera swings wide right. */
  swing: 190,
  /** Crosses back through front. */
  cross: 330,
  /** And settles facing camera. */
  rest: 452,
  hold: 540,
  title: 60,
  line: 430,
  end: 566,
  duration: 662,
} as const;

/** QUICK CUTS — hard cuts, one caption a beat. Shot lengths live in the film. */
export const QUICK = {
  start: 8,
  /** Sum of the shot list plus the lead-in; kept here so the scorer can see it. */
  end: 8 + 34 + 40 + 30 + 44 + 52 + 56 + 52 + 46,
  duration: 8 + 34 + 40 + 30 + 44 + 52 + 56 + 52 + 46 + 96,
} as const;
