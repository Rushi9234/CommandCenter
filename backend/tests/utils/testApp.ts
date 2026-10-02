// Imports the real, unmodified Express app -- same routes, same middleware
// chain (helmet, rate limiter, authenticate, requireAccess/requireTeamRole,
// validate, errorHandler), same controllers/services/repositories as
// production. supertest drives it directly without a real listening port.
import { app } from '../../src/app';

export { app };
