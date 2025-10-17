import { JwtPayload } from './user.types';

export {}; // Ensure this file is treated as a module.

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
