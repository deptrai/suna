/**
 * Team Verification Module
 * Provides team background analysis and verification functionality
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

import { TeamVerificationController } from './team-verification.controller';
import { TeamVerificationService } from './team-verification.service';
import { AdvancedTeamAnalyticsService } from './advanced-team-analytics.service';
import { TeamData } from '../entities/team-data.entity';
import { TeamMember } from '../entities/team-member.entity';
import { GitHubService } from '../external-apis/github.service';
import { LinkedInService } from '../external-apis/linkedin.service';
import { WebScrapingService } from '../external-apis/web-scraping.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([
      TeamData,
      TeamMember,
    ]),
  ],
  controllers: [TeamVerificationController],
  providers: [
    TeamVerificationService,
    AdvancedTeamAnalyticsService,
    GitHubService,
    LinkedInService,
    WebScrapingService,
    CacheService,
    MetricsService,
  ],
  exports: [TeamVerificationService, AdvancedTeamAnalyticsService],
})
export class TeamVerificationModule {}

