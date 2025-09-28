import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialMediaPost } from '../entities/social-media-post.entity';

@Injectable()
export class SocialMediaPostRepository {
  constructor(
    @InjectRepository(SocialMediaPost)
    private repository: Repository<SocialMediaPost>,
  ) {}

  async findByPlatformAndSymbol(platform: string, symbol: string, limit: number = 100): Promise<SocialMediaPost[]> {
    return this.repository.find({
      where: { platform, symbol },
      order: { publishedAt: 'DESC' },
      take: limit,
    });
  }

  async findRecent(hours: number = 24): Promise<SocialMediaPost[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.repository.find({
      where: {},
      order: { publishedAt: 'DESC' },
    });
  }

  async save(post: Partial<SocialMediaPost>): Promise<SocialMediaPost> {
    return this.repository.save(post);
  }

  async saveBatch(posts: Partial<SocialMediaPost>[]): Promise<SocialMediaPost[]> {
    return this.repository.save(posts);
  }
}
