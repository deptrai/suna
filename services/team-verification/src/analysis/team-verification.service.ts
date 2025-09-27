import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { TeamData } from '../entities/team-data.entity';
import { TeamMember } from '../entities/team-member.entity';
import { GitHubService } from '../external-apis/github.service';
import { LinkedInService } from '../external-apis/linkedin.service';
import { WebScrapingService } from '../external-apis/web-scraping.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import { TeamVerificationRequestDto } from './dto/team-verification-request.dto';
import { TeamVerificationResponseDto } from './dto/team-verification-response.dto';

@Injectable()
export class TeamVerificationService {
  private readonly logger = new Logger(TeamVerificationService.name);

  constructor(
    @InjectRepository(TeamData)
    private readonly teamDataRepository: Repository<TeamData>,
    @InjectRepository(TeamMember)
    private readonly teamMemberRepository: Repository<TeamMember>,
    private readonly githubService: GitHubService,
    private readonly linkedinService: LinkedInService,
    private readonly webScrapingService: WebScrapingService,
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {}

  async verifyTeam(request: TeamVerificationRequestDto): Promise<TeamVerificationResponseDto> {
    const startTime = Date.now();
    const { projectId, teamMembers, projectWebsite, githubOrg } = request;

    this.logger.log(`Starting team verification for ${projectId}`, {
      projectId,
      teamMemberCount: teamMembers?.length || 0,
      projectWebsite,
      githubOrg,
    });

    try {
      // Check cache first
      const cacheKey = `team:${projectId}`;
      const cachedResult = await this.cacheService.get<TeamVerificationResponseDto>(cacheKey);
      
      if (cachedResult) {
        this.logger.log(`Cache hit for ${projectId}`, { projectId, cacheKey });
        this.metricsService.incrementCacheHits('team_verification');
        return cachedResult;
      }

      // Gather team verification data from multiple sources
      const [
        githubData,
        websiteTeamData,
        memberVerifications,
      ] = await Promise.allSettled([
        this.getGitHubOrgData(githubOrg),
        this.getWebsiteTeamData(projectWebsite),
        this.verifyTeamMembers(teamMembers || []),
      ]);

      // Process and combine team verification data
      const analysisResult = await this.processTeamData({
        projectId,
        teamMembers: teamMembers || [],
        projectWebsite,
        githubOrg,
        githubData: this.extractSettledValue(githubData),
        websiteTeamData: this.extractSettledValue(websiteTeamData),
        memberVerifications: this.extractSettledValue(memberVerifications),
      });

      // Calculate team credibility scores
      analysisResult.credibilityScore = this.calculateCredibilityScore(analysisResult);
      analysisResult.experienceScore = this.calculateExperienceScore(analysisResult);
      analysisResult.transparencyScore = this.calculateTransparencyScore(analysisResult);
      analysisResult.confidence = this.calculateConfidence(analysisResult);
      analysisResult.riskFlags = this.identifyRiskFlags(analysisResult);

      // Store in database
      await this.storeTeamResult(analysisResult);

      // Cache the result
      const cacheTTL = this.getCacheTTL(analysisResult.confidence);
      await this.cacheService.set(cacheKey, analysisResult, cacheTTL);

      // Record metrics
      const processingTime = Date.now() - startTime;
      this.metricsService.recordAnalysisTime('team', processingTime);
      this.metricsService.incrementAnalysisCount('team', 'success');

      this.logger.log(`Team verification completed for ${projectId}`, {
        projectId,
        processingTime,
        credibilityScore: analysisResult.credibilityScore,
        confidence: analysisResult.confidence,
        verifiedMembers: analysisResult.verifiedMembers,
      });

      return analysisResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Team verification failed for ${projectId}`, {
        projectId,
        error: error.message,
        processingTime,
      });

      this.metricsService.incrementAnalysisCount('team', 'error');
      throw error;
    }
  }

  private async getGitHubOrgData(githubOrg?: string) {
    if (!githubOrg) return null;

    try {
      const [orgData, repositories, contributors] = await Promise.allSettled([
        this.githubService.getOrganization(githubOrg),
        this.githubService.getOrgRepositories(githubOrg),
        this.githubService.getOrgContributors(githubOrg),
      ]);

      return {
        organization: this.extractSettledValue(orgData),
        repositories: this.extractSettledValue(repositories),
        contributors: this.extractSettledValue(contributors),
      };
    } catch (error) {
      this.logger.warn(`GitHub API error: ${error.message}`);
      return null;
    }
  }

  private async getWebsiteTeamData(projectWebsite?: string) {
    if (!projectWebsite) return null;

    try {
      const teamData = await this.webScrapingService.scrapeTeamInfo(projectWebsite);
      return teamData;
    } catch (error) {
      this.logger.warn(`Website scraping error: ${error.message}`);
      return null;
    }
  }

  private async verifyTeamMembers(teamMembers: any[]) {
    const verifications = [];

    for (const member of teamMembers) {
      try {
        const verification = await this.verifyIndividualMember(member);
        verifications.push(verification);
      } catch (error) {
        this.logger.warn(`Member verification failed for ${member.name}: ${error.message}`);
        verifications.push({
          name: member.name,
          verified: false,
          error: error.message,
        });
      }
    }

    return verifications;
  }

  private async verifyIndividualMember(member: any) {
    const verification = {
      name: member.name,
      role: member.role,
      verified: false,
      githubProfile: null,
      linkedinProfile: null,
      experienceYears: 0,
      previousProjects: [],
      credibilityScore: 0,
      verificationSources: [],
    };

    // Verify GitHub profile
    if (member.github) {
      try {
        const githubProfile = await this.githubService.getUserProfile(member.github);
        verification.githubProfile = githubProfile;
        verification.verificationSources.push('github');
        verification.verified = true;
        
        // Calculate experience from GitHub
        if (githubProfile.created_at) {
          const accountAge = new Date().getFullYear() - new Date(githubProfile.created_at).getFullYear();
          verification.experienceYears = Math.max(verification.experienceYears, accountAge);
        }
      } catch (error) {
        this.logger.warn(`GitHub verification failed for ${member.name}: ${error.message}`);
      }
    }

    // Verify LinkedIn profile
    if (member.linkedin) {
      try {
        const linkedinProfile = await this.linkedinService.getProfile(member.linkedin);
        verification.linkedinProfile = linkedinProfile;
        verification.verificationSources.push('linkedin');
        verification.verified = true;
        
        // Calculate experience from LinkedIn
        if (linkedinProfile.experience) {
          verification.experienceYears = Math.max(
            verification.experienceYears,
            linkedinProfile.totalExperience || 0
          );
        }
      } catch (error) {
        this.logger.warn(`LinkedIn verification failed for ${member.name}: ${error.message}`);
      }
    }

    // Calculate individual credibility score
    verification.credibilityScore = this.calculateMemberCredibility(verification);

    return verification;
  }

  private calculateMemberCredibility(member: any): number {
    let score = 0;

    // GitHub credibility
    if (member.githubProfile) {
      score += 30; // Base score for having GitHub
      
      if (member.githubProfile.public_repos > 10) score += 10;
      if (member.githubProfile.followers > 50) score += 10;
      if (member.githubProfile.public_gists > 5) score += 5;
    }

    // LinkedIn credibility
    if (member.linkedinProfile) {
      score += 25; // Base score for having LinkedIn
      
      if (member.experienceYears > 5) score += 15;
      if (member.experienceYears > 10) score += 10;
    }

    // Experience bonus
    if (member.experienceYears > 3) score += 10;
    if (member.experienceYears > 7) score += 10;

    // Multiple verification sources bonus
    if (member.verificationSources.length > 1) score += 10;

    return Math.min(score, 100);
  }

  private async processTeamData(data: any): Promise<TeamVerificationResponseDto> {
    const {
      projectId,
      teamMembers,
      projectWebsite,
      githubOrg,
      githubData,
      websiteTeamData,
      memberVerifications,
    } = data;

    // Initialize result
    const result: TeamVerificationResponseDto = {
      projectId,
      totalMembers: teamMembers.length,
      verifiedMembers: 0,
      credibilityScore: 0,
      experienceScore: 0,
      transparencyScore: 0,
      confidence: 0,
      teamMembers: [],
      githubActivity: null,
      riskFlags: [],
      lastUpdated: new Date(),
      warnings: [],
    };

    // Process member verifications
    if (memberVerifications && Array.isArray(memberVerifications)) {
      result.teamMembers = memberVerifications;
      result.verifiedMembers = memberVerifications.filter(m => m.verified).length;
    }

    // Process GitHub organization data
    if (githubData) {
      result.githubActivity = {
        organization: githubData.organization?.login || githubOrg,
        totalRepositories: githubData.repositories?.length || 0,
        totalContributors: githubData.contributors?.length || 0,
        recentActivity: this.calculateGitHubActivity(githubData.repositories),
      };
    }

    // Add warnings for missing data
    if (!githubData) result.warnings.push('github_unavailable');
    if (!websiteTeamData) result.warnings.push('website_team_data_unavailable');
    if (!memberVerifications || memberVerifications.length === 0) {
      result.warnings.push('member_verification_unavailable');
    }

    return result;
  }

  private calculateGitHubActivity(repositories: any[]): any {
    if (!repositories || repositories.length === 0) {
      return { commits: 0, lastCommit: null, activeRepos: 0 };
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const activeRepos = repositories.filter(repo => 
      new Date(repo.updated_at) > threeMonthsAgo
    ).length;

    const lastCommit = repositories.reduce((latest, repo) => {
      const repoDate = new Date(repo.updated_at);
      return repoDate > latest ? repoDate : latest;
    }, new Date(0));

    return {
      commits: repositories.reduce((sum, repo) => sum + (repo.size || 0), 0),
      lastCommit: lastCommit.getTime() > 0 ? lastCommit : null,
      activeRepos,
    };
  }

  private calculateCredibilityScore(data: TeamVerificationResponseDto): number {
    if (data.totalMembers === 0) return 0;

    const verificationRate = data.verifiedMembers / data.totalMembers;
    const avgMemberCredibility = data.teamMembers.reduce(
      (sum, member) => sum + (member.credibilityScore || 0), 0
    ) / data.teamMembers.length;

    // Combine verification rate and average member credibility
    const score = (verificationRate * 50) + (avgMemberCredibility * 0.5);
    
    return Math.round(Math.min(score, 100));
  }

  private calculateExperienceScore(data: TeamVerificationResponseDto): number {
    if (data.teamMembers.length === 0) return 0;

    const totalExperience = data.teamMembers.reduce(
      (sum, member) => sum + (member.experienceYears || 0), 0
    );
    const avgExperience = totalExperience / data.teamMembers.length;

    // Score based on average experience
    if (avgExperience > 10) return 100;
    if (avgExperience > 7) return 85;
    if (avgExperience > 5) return 70;
    if (avgExperience > 3) return 55;
    if (avgExperience > 1) return 40;
    return 20;
  }

  private calculateTransparencyScore(data: TeamVerificationResponseDto): number {
    let score = 0;

    // Team member disclosure
    if (data.totalMembers > 0) {
      score += 30;
      
      // Bonus for having multiple team members
      if (data.totalMembers > 3) score += 10;
      if (data.totalMembers > 5) score += 10;
    }

    // GitHub organization transparency
    if (data.githubActivity) {
      score += 25;
      
      if (data.githubActivity.totalRepositories > 5) score += 10;
      if (data.githubActivity.activeRepos > 2) score += 10;
    }

    // Verification transparency
    const verificationRate = data.totalMembers > 0 ? data.verifiedMembers / data.totalMembers : 0;
    score += verificationRate * 25;

    return Math.round(Math.min(score, 100));
  }

  private calculateConfidence(data: TeamVerificationResponseDto): number {
    let confidence = 1.0;
    const dataPoints = [];

    // Check data availability
    if (data.totalMembers > 0) dataPoints.push('team_members');
    if (data.verifiedMembers > 0) dataPoints.push('verified_members');
    if (data.githubActivity) dataPoints.push('github_activity');

    // Reduce confidence based on missing data
    const maxDataPoints = 3;
    const dataAvailability = dataPoints.length / maxDataPoints;
    confidence *= dataAvailability;

    // Reduce confidence based on low verification rate
    if (data.totalMembers > 0) {
      const verificationRate = data.verifiedMembers / data.totalMembers;
      confidence *= (0.5 + verificationRate * 0.5); // Minimum 50% confidence
    }

    // Reduce confidence based on warnings
    const warningPenalty = data.warnings.length * 0.1;
    confidence = Math.max(confidence - warningPenalty, 0.1);

    return Math.round(confidence * 100) / 100;
  }

  private identifyRiskFlags(data: TeamVerificationResponseDto): string[] {
    const flags = [];

    // Anonymous team risk
    if (data.totalMembers === 0) {
      flags.push('anonymous_team');
    } else if (data.verifiedMembers === 0) {
      flags.push('unverified_team');
    }

    // Low verification rate
    if (data.totalMembers > 0) {
      const verificationRate = data.verifiedMembers / data.totalMembers;
      if (verificationRate < 0.5) {
        flags.push('low_verification_rate');
      }
    }

    // Inexperienced team
    if (data.experienceScore < 40) {
      flags.push('inexperienced_team');
    }

    // Low transparency
    if (data.transparencyScore < 50) {
      flags.push('low_transparency');
    }

    // No GitHub activity
    if (!data.githubActivity || data.githubActivity.totalRepositories === 0) {
      flags.push('no_github_activity');
    }

    return flags;
  }

  private getCacheTTL(confidence: number): number {
    // Team data changes less frequently, so longer cache times
    if (confidence > 0.8) return 3600; // 1 hour
    if (confidence > 0.6) return 1800; // 30 minutes
    return 900; // 15 minutes for low confidence
  }

  private async storeTeamResult(result: TeamVerificationResponseDto): Promise<void> {
    try {
      const teamData = this.teamDataRepository.create({
        projectId: result.projectId,
        totalMembers: result.totalMembers,
        verifiedMembers: result.verifiedMembers,
        credibilityScore: result.credibilityScore,
        experienceScore: result.experienceScore,
        transparencyScore: result.transparencyScore,
        confidence: result.confidence,
        riskFlags: result.riskFlags,
        rawData: result,
      });

      await this.teamDataRepository.save(teamData);

      // Store individual team members
      for (const member of result.teamMembers) {
        const teamMember = this.teamMemberRepository.create({
          projectId: result.projectId,
          name: member.name,
          role: member.role,
          verified: member.verified,
          credibilityScore: member.credibilityScore,
          experienceYears: member.experienceYears,
          verificationSources: member.verificationSources,
          githubProfile: member.githubProfile,
          linkedinProfile: member.linkedinProfile,
        });

        await this.teamMemberRepository.save(teamMember);
      }

    } catch (error) {
      this.logger.error(`Failed to store team result: ${error.message}`, {
        projectId: result.projectId,
        error: error.message,
      });
      // Don't throw - storage failure shouldn't fail the analysis
    }
  }

  private extractSettledValue<T>(settledResult: PromiseSettledResult<T>): T | null {
    return settledResult.status === 'fulfilled' ? settledResult.value : null;
  }
}
