import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    issuer: 'chainlens-core',
    audience: 'chainlens-services',
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
  },
  rateLimiting: {
    ttl: parseInt(process.env.THROTTLE_TTL, 10) || 60,
    limit: parseInt(process.env.THROTTLE_LIMIT, 10) || 100,
    skipIf: process.env.NODE_ENV === 'development',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
}));
