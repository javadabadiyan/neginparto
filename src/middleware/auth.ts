import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface FirebaseAuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
}

export async function verifyFirebaseBearerToken(token: string): Promise<DecodedIdToken> {
  return adminAuth.verifyIdToken(token);
}

export const requireFirebaseAuth = async (
  req: FirebaseAuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
  }
};
