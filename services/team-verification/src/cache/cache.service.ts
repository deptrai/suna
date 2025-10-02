import { Injectable } from '@nestjs/common';

@Injectable()
export class CacheService {
  async get<T = any>(key: string): Promise<T | null> {
    return null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    // Cache implementation
  }
}

