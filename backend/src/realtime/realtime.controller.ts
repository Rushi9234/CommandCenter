import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { teamsRepository } from '../modules/teams/teams.repository';
import { realtimeProvider } from './inMemoryRealtimeProvider';

export const connectRealtime = async (req: AuthRequest, res: Response) => {
  const teams = await teamsRepository.getUserTeams(req.user!.userId);
  const teamIds = teams.map((team: any) => team.team_id);

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': connected\n\n');

  const unsubscribe = realtimeProvider.subscribe(req.user!.userId, teamIds, (event) => {
    if (!res.writableEnded) {
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
  });
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  req.once('close', cleanup);
  res.once('close', cleanup);
};