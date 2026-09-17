import { chooseMove } from '../../server/ai';
import { createGame, legalMoves, applyMove, rollDice, type Game } from '../../shared/game';
import type { Fetch, SystemOneRequest } from '@typesafe-ai/sdk';

async function capture(game: Game) {
  let payload: SystemOneRequest | undefined;
  const fetcher: Fetch = async (_url, init) => {
    payload = JSON.parse(init!.body as string);
    return Response.json({ answers: { move: { type: 'choice', choice: legalMoves(game)[0].id } } });
  };
  await chooseMove(game, 'audit-placeholder', 'jev-latest', fetcher);
  return payload!;
}
const early = createGame('jungle');
const nearDraw = { ...early, quiet: 98 };
const earlyPayload = await capture(early);
const drawPayload = await capture(nearDraw);
const next = applyMove(nearDraw, legalMoves(nearDraw)[0].id);
const flight = rollDice(createGame('flight'), 6);
const secondSix = { ...flight, sixes: 2 };
const firstSixPayload = await capture(flight);
const secondSixPayload = await capture(secondSix);
const firstThenSix = rollDice(applyMove(flight, 'plane-0'), 6);
const secondThenSix = rollDice(applyMove(secondSix, 'plane-0'), 6);
const risk = createGame('flight');
risk.planes = [
  [0, 10, -1, -1],
  [26, -1, -1, -1],
];
const pending = rollDice(risk, 1);
const riskPayload = await capture(pending);
const after = applyMove(pending, 'plane-0');
const replyState = rollDice(after, 1);
const reply = applyMove(replyState, 'plane-0');
const result = {
  generatedAt: new Date().toISOString(),
  source: 'Current production chooseMove with injected transport; no live API calls',
  jungleDrawHistory: {
    quietCounts: [early.quiet, nearDraw.quiet],
    identicalRequests: JSON.stringify(earlyPayload) === JSON.stringify(drawPayload),
    nearDrawOpponentReplies: legalMoves(next).length,
    nearDrawOpponentDrawingReplies: legalMoves(next).filter(
      (m) => applyMove(next, m.id).winner === 'draw',
    ).length,
  },
  flightSixHistory: {
    sixCounts: [flight.sixes, secondSix.sixes],
    identicalRequests: JSON.stringify(firstSixPayload) === JSON.stringify(secondSixPayload),
    afterNextSix: [firstThenSix, secondThenSix].map((g) => ({
      turn: g.turn,
      die: g.die,
      legalMoves: legalMoves(g).length,
    })),
  },
  flightThreat: {
    planesBefore: pending.planes,
    ownMove: 'plane-0',
    sentCandidate: (riskPayload.state as { candidates: Record<string, unknown> }).candidates[
      'plane-0'
    ],
    opponentRoll: 1,
    opponentMove: 'plane-0',
    planesAfterReply: reply.planes,
    movedPlaneCaptured: reply.planes[0][0] === -1,
  },
  openingRequestBytes: {
    jungle: Buffer.byteLength(JSON.stringify(earlyPayload)),
    flight: Buffer.byteLength(JSON.stringify(firstSixPayload)),
  },
};
console.log(JSON.stringify(result, null, 2));
