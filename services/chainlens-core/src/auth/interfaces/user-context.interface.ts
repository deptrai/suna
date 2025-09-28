export interface UserContext {
  id: string;
  email: string;
  role: string;
  tier: string;
  iat?: number;
  exp?: number;
  aud?: string;
  iss?: string;
  sub?: string;
  metadata?: {
    preferences?: Record<string, any>;
    profile?: Record<string, any>;
    [key: string]: any;
  };
}
