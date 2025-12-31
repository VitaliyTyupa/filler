import express from 'express';
import {
  generateInitialState,
  getValidMoves,
  type GameSettings,
  type PlayerId
} from '@filler/shared/engine';

import { RoomStore } from './room-store.js';

const app = express();
const store = new RoomStore();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/rooms', (req, res) => {
  const { board, paletteSize, cols, rows } = req.body ?? {};
  const resolvedCols = board?.cols ?? cols;
  const resolvedRows = board?.rows ?? rows;
  const resolvedPalette = paletteSize;

  if (!resolvedCols || !resolvedRows || !resolvedPalette) {
    res.status(400).json({ message: 'cols, rows and paletteSize are required' });
    return;
  }

  const settings: GameSettings = {
    cols: Number(resolvedCols),
    rows: Number(resolvedRows),
    paletteSize: Number(resolvedPalette)
  };

  const room = store.create(settings);

  res.status(201).json({
    roomId: room.id,
    state: room.state
  });
});

app.post('/rooms/:roomId/join', (req, res) => {
  const { roomId } = req.params;
  const joined = store.join(roomId);

  if (!joined) {
    res.status(404).json({ message: 'Room not found or already full' });
    return;
  }

  const { room, playerId } = joined;
  const validMoves = getValidMoves(room.state, playerId);

  res.json({
    roomId: room.id,
    playerId,
    state: room.state,
    validMoves
  });
});

app.post('/rooms/:roomId/move', (req, res) => {
  const { roomId } = req.params;
  const { playerId, colorIndex } = req.body as { playerId?: PlayerId; colorIndex?: number };

  if (playerId !== 1 && playerId !== 2) {
    res.status(400).json({ message: 'playerId is required' });
    return;
  }

  if (typeof colorIndex !== 'number') {
    res.status(400).json({ message: 'colorIndex is required' });
    return;
  }

  const result = store.applyMove(roomId, playerId, colorIndex);

  if (!result) {
    res.status(404).json({ message: 'Room not found' });
    return;
  }

  res.json(result);
});

app.post('/preview', (req, res) => {
  const { cols, rows, paletteSize } = req.body ?? {};

  if (!cols || !rows || !paletteSize) {
    res.status(400).json({ message: 'cols, rows and paletteSize are required' });
    return;
  }

  const settings: GameSettings = {
    cols: Number(cols),
    rows: Number(rows),
    paletteSize: Number(paletteSize)
  };

  const state = generateInitialState(settings);
  const validMoves = getValidMoves(state, state.currentPlayer);

  res.json({ state, validMoves });
});

app.listen(port, () => {
  console.log(`Filler server running on http://localhost:${port}`);
});
