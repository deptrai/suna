export interface UserContext {
  id?: string; // For backward compatibility
  email: string;
  role: string;
  tier: string;
  iat?: number;
  exp?: number;
  aud?: string;
  iss?: string;
  sub: string; // Primary user ID
  apiKey?: boolean; // Flag to indicate API key authentication
  keyId?: string; // API key ID for API key authentication
  metadata?: {
    preferences?: Record<string, any>;
    profile?: Record<string, any>;
    [key: string]: any;
  };
}
