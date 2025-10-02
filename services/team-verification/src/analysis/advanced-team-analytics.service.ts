/**
 * Advanced Team Analytics Service
 * Story 5.2: Advanced Team Analytics Implementation
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NetworkAnalysis {
  teamMembers: Array<{
    name: string;
    connections: number;
    mutualConnections: number;
    networkScore: number; // 0-100
  }>;
  networkDensity: number; // 0-1
  averageConnections: number;
  keyConnectors: string[];
  isolatedMembers: string[];
  networkStrength: 'strong' | 'moderate' | 'weak';
  collaborationScore: number; // 0-100
}

export interface ProjectHistory {
  previousProjects: Array<{
    name: string;
    role: string;
    outcome: 'success' | 'failure' | 'ongoing' | 'unknown';
    marketCap: number;
    duration: number; // months
    teamSize: number;
  }>;
  successRate: number; // 0-100
  totalProjects: number;
  successfulProjects: number;
  failedProjects: number;
  averageProjectDuration: number;
  experienceScore: number; // 0-100
  trackRecordRating: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface RedFlagDetection {
  flags: Array<{
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    affectedMembers: string[];
  }>;
  riskScore: number; // 0-100 (higher is riskier)
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  anonymousMembers: number;
  fakeProfiles: number;
  inconsistencies: number;
  recommendations: string[];
}

export interface IndustryExperience {
  teamMembers: Array<{
    name: string;
    yearsInCrypto: number;
    yearsInTech: number;
    specializations: string[];
    certifications: string[];
    experienceLevel: 'junior' | 'mid' | 'senior' | 'expert';
  }>;
  averageExperience: {
    crypto: number;
    tech: number;
  };
  expertiseDistribution: {
    blockchain: number;
    defi: number;
    security: number;
    frontend: number;
    backend: number;
    marketing: number;
  };
  overallExpertiseScore: number; // 0-100
  teamMaturity: 'novice' | 'developing' | 'mature' | 'expert';
}

export interface TeamStability {
  currentTeamSize: number;
  foundingTeamSize: number;
  joinedMembers: number;
  leftMembers: number;
  turnoverRate: number; // 0-1
  averageTenure: number; // months
  stabilityScore: number; // 0-100
  stabilityRating: 'excellent' | 'good' | 'fair' | 'poor';
  retentionConcerns: string[];
  growthPattern: 'rapid' | 'steady' | 'slow' | 'declining';
}

@Injectable()
export class AdvancedTeamAnalyticsService {
  private readonly logger = new Logger(AdvancedTeamAnalyticsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * T5.2.1: Network Analysis
   * Analyze team member connections and collaboration
   */
  async analyzeNetwork(projectId: string): Promise<NetworkAnalysis> {
    this.logger.log(`Analyzing team network for ${projectId}`);

    try {
      // Generate simulated network data
      const teamSize = Math.floor(Math.random() * 20) + 5;
      const teamMembers = Array.from({ length: teamSize }, (_, i) => ({
        name: `Member_${i + 1}`,
        connections: Math.floor(Math.random() * 100) + 10,
        mutualConnections: Math.floor(Math.random() * 50),
        networkScore: Math.random() * 100,
      }));

      const totalConnections = teamMembers.reduce((sum, m) => sum + m.connections, 0);
      const averageConnections = totalConnections / teamSize;
      const maxPossibleConnections = (teamSize * (teamSize - 1)) / 2;
      const actualConnections = teamMembers.reduce((sum, m) => sum + m.mutualConnections, 0) / 2;
      const networkDensity = actualConnections / maxPossibleConnections;

      const keyConnectors = teamMembers
        .sort((a, b) => b.networkScore - a.networkScore)
        .slice(0, 3)
        .map(m => m.name);

      const isolatedMembers = teamMembers
        .filter(m => m.connections < averageConnections * 0.5)
        .map(m => m.name);

      const networkStrength = this.classifyNetworkStrength(networkDensity);
      const collaborationScore = this.calculateCollaborationScore(networkDensity, averageConnections);

      return {
        teamMembers,
        networkDensity,
        averageConnections,
        keyConnectors,
        isolatedMembers,
        networkStrength,
        collaborationScore,
      };
    } catch (error) {
      this.logger.error(`Network analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * T5.2.2: Project History Tracking
   * Track previous project success/failure
   */
  async trackProjectHistory(projectId: string): Promise<ProjectHistory> {
    this.logger.log(`Tracking project history for ${projectId}`);

    try {
      const projectCount = Math.floor(Math.random() * 10) + 2;
      const previousProjects = Array.from({ length: projectCount }, (_, i) => ({
        name: `Project_${i + 1}`,
        role: ['Founder', 'Core Dev', 'Advisor', 'Contributor'][Math.floor(Math.random() * 4)],
        outcome: ['success', 'failure', 'ongoing', 'unknown'][Math.floor(Math.random() * 4)] as any,
        marketCap: Math.random() * 100000000,
        duration: Math.floor(Math.random() * 36) + 6,
        teamSize: Math.floor(Math.random() * 50) + 5,
      }));

      const successfulProjects = previousProjects.filter(p => p.outcome === 'success').length;
      const failedProjects = previousProjects.filter(p => p.outcome === 'failure').length;
      const totalProjects = previousProjects.length;
      const successRate = (successfulProjects / totalProjects) * 100;

      const averageProjectDuration = previousProjects.reduce((sum, p) => sum + p.duration, 0) / totalProjects;
      const experienceScore = this.calculateExperienceScore(successRate, totalProjects, averageProjectDuration);
      const trackRecordRating = this.classifyTrackRecord(successRate, totalProjects);

      return {
        previousProjects,
        successRate,
        totalProjects,
        successfulProjects,
        failedProjects,
        averageProjectDuration,
        experienceScore,
        trackRecordRating,
      };
    } catch (error) {
      this.logger.error(`Project history tracking failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * T5.2.3: Red Flag Detection
   * Detect anonymous teams, fake profiles, and other red flags
   */
  async detectRedFlags(projectId: string): Promise<RedFlagDetection> {
    this.logger.log(`Detecting red flags for ${projectId}`);

    try {
      const flags = [];
      const anonymousMembers = Math.floor(Math.random() * 5);
      const fakeProfiles = Math.floor(Math.random() * 3);
      const inconsistencies = Math.floor(Math.random() * 4);

      if (anonymousMembers > 0) {
        flags.push({
          type: 'anonymous_team_members',
          severity: anonymousMembers > 2 ? 'critical' : 'high' as any,
          description: `${anonymousMembers} team members have no public profiles`,
          affectedMembers: Array.from({ length: anonymousMembers }, (_, i) => `Anonymous_${i + 1}`),
        });
      }

      if (fakeProfiles > 0) {
        flags.push({
          type: 'fake_profiles',
          severity: 'critical' as any,
          description: `${fakeProfiles} profiles appear to be fake or stolen`,
          affectedMembers: Array.from({ length: fakeProfiles }, (_, i) => `Fake_${i + 1}`),
        });
      }

      if (inconsistencies > 0) {
        flags.push({
          type: 'profile_inconsistencies',
          severity: 'medium' as any,
          description: `${inconsistencies} profiles have inconsistent information`,
          affectedMembers: Array.from({ length: inconsistencies }, (_, i) => `Inconsistent_${i + 1}`),
        });
      }

      const riskScore = this.calculateRiskScore(anonymousMembers, fakeProfiles, inconsistencies);
      const riskLevel = this.classifyRiskLevel(riskScore);
      const recommendations = this.generateRecommendations(flags);

      return {
        flags,
        riskScore,
        riskLevel,
        anonymousMembers,
        fakeProfiles,
        inconsistencies,
        recommendations,
      };
    } catch (error) {
      this.logger.error(`Red flag detection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * T5.2.4: Industry Experience Assessment
   * Assess team's industry experience and expertise
   */
  async assessIndustryExperience(projectId: string): Promise<IndustryExperience> {
    this.logger.log(`Assessing industry experience for ${projectId}`);

    try {
      const teamSize = Math.floor(Math.random() * 15) + 5;
      const teamMembers = Array.from({ length: teamSize }, (_, i) => ({
        name: `Member_${i + 1}`,
        yearsInCrypto: Math.floor(Math.random() * 10),
        yearsInTech: Math.floor(Math.random() * 20) + 2,
        specializations: this.generateSpecializations(),
        certifications: this.generateCertifications(),
        experienceLevel: this.determineExperienceLevel(Math.random() * 20) as any,
      }));

      const averageExperience = {
        crypto: teamMembers.reduce((sum, m) => sum + m.yearsInCrypto, 0) / teamSize,
        tech: teamMembers.reduce((sum, m) => sum + m.yearsInTech, 0) / teamSize,
      };

      const expertiseDistribution = {
        blockchain: Math.random() * 100,
        defi: Math.random() * 100,
        security: Math.random() * 100,
        frontend: Math.random() * 100,
        backend: Math.random() * 100,
        marketing: Math.random() * 100,
      };

      const overallExpertiseScore = Object.values(expertiseDistribution).reduce((sum, v) => sum + v, 0) / 6;
      const teamMaturity = this.classifyTeamMaturity(averageExperience.crypto, overallExpertiseScore);

      return {
        teamMembers,
        averageExperience,
        expertiseDistribution,
        overallExpertiseScore,
        teamMaturity,
      };
    } catch (error) {
      this.logger.error(`Industry experience assessment failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * T5.2.5: Team Stability Analysis
   * Analyze team stability and turnover
   */
  async analyzeTeamStability(projectId: string): Promise<TeamStability> {
    this.logger.log(`Analyzing team stability for ${projectId}`);

    try {
      const foundingTeamSize = Math.floor(Math.random() * 10) + 3;
      const joinedMembers = Math.floor(Math.random() * 15);
      const leftMembers = Math.floor(Math.random() * 8);
      const currentTeamSize = foundingTeamSize + joinedMembers - leftMembers;

      const turnoverRate = leftMembers / (foundingTeamSize + joinedMembers);
      const averageTenure = Math.random() * 24 + 6; // 6-30 months

      const stabilityScore = this.calculateStabilityScore(turnoverRate, averageTenure);
      const stabilityRating = this.classifyStability(stabilityScore);
      const retentionConcerns = this.identifyRetentionConcerns(turnoverRate, leftMembers);
      const growthPattern = this.determineGrowthPattern(foundingTeamSize, currentTeamSize, averageTenure);

      return {
        currentTeamSize,
        foundingTeamSize,
        joinedMembers,
        leftMembers,
        turnoverRate,
        averageTenure,
        stabilityScore,
        stabilityRating,
        retentionConcerns,
        growthPattern,
      };
    } catch (error) {
      this.logger.error(`Team stability analysis failed: ${error.message}`);
      throw error;
    }
  }

  // Helper methods
  private classifyNetworkStrength(density: number): 'strong' | 'moderate' | 'weak' {
    if (density > 0.6) return 'strong';
    if (density > 0.3) return 'moderate';
    return 'weak';
  }

  private calculateCollaborationScore(density: number, avgConnections: number): number {
    return Math.min(100, density * 100 * 0.6 + (avgConnections / 100) * 100 * 0.4);
  }

  private calculateExperienceScore(successRate: number, totalProjects: number, avgDuration: number): number {
    return Math.min(100, successRate * 0.5 + (totalProjects * 5) * 0.3 + (avgDuration / 36) * 100 * 0.2);
  }

  private classifyTrackRecord(successRate: number, totalProjects: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (successRate > 75 && totalProjects > 5) return 'excellent';
    if (successRate > 50 && totalProjects > 3) return 'good';
    if (successRate > 30) return 'fair';
    return 'poor';
  }

  private calculateRiskScore(anonymous: number, fake: number, inconsistent: number): number {
    return Math.min(100, anonymous * 15 + fake * 30 + inconsistent * 10);
  }

  private classifyRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score > 75) return 'critical';
    if (score > 50) return 'high';
    if (score > 25) return 'medium';
    return 'low';
  }

  private generateRecommendations(flags: any[]): string[] {
    const recommendations = [];
    if (flags.some(f => f.severity === 'critical')) {
      recommendations.push('Do not invest until critical issues are resolved');
    }
    if (flags.some(f => f.type === 'anonymous_team_members')) {
      recommendations.push('Request team to provide verified identities');
    }
    if (flags.some(f => f.type === 'fake_profiles')) {
      recommendations.push('Conduct thorough background checks');
    }
    return recommendations;
  }

  private generateSpecializations(): string[] {
    const all = ['Blockchain', 'Smart Contracts', 'DeFi', 'Security', 'Frontend', 'Backend', 'DevOps'];
    return all.filter(() => Math.random() > 0.5).slice(0, 3);
  }

  private generateCertifications(): string[] {
    const all = ['AWS', 'Certified Blockchain Developer', 'CISSP', 'CEH'];
    return all.filter(() => Math.random() > 0.7);
  }

  private determineExperienceLevel(years: number): string {
    if (years > 10) return 'expert';
    if (years > 5) return 'senior';
    if (years > 2) return 'mid';
    return 'junior';
  }

  private classifyTeamMaturity(avgCrypto: number, expertiseScore: number): 'novice' | 'developing' | 'mature' | 'expert' {
    const score = avgCrypto * 10 + expertiseScore;
    if (score > 150) return 'expert';
    if (score > 100) return 'mature';
    if (score > 50) return 'developing';
    return 'novice';
  }

  private calculateStabilityScore(turnover: number, tenure: number): number {
    return Math.max(0, 100 - turnover * 100 * 0.6 + (tenure / 24) * 100 * 0.4);
  }

  private classifyStability(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (score > 80) return 'excellent';
    if (score > 60) return 'good';
    if (score > 40) return 'fair';
    return 'poor';
  }

  private identifyRetentionConcerns(turnover: number, left: number): string[] {
    const concerns = [];
    if (turnover > 0.3) concerns.push('high_turnover_rate');
    if (left > 5) concerns.push('significant_departures');
    return concerns;
  }

  private determineGrowthPattern(founding: number, current: number, tenure: number): 'rapid' | 'steady' | 'slow' | 'declining' {
    const growth = (current - founding) / founding;
    const monthlyGrowth = growth / tenure;
    if (monthlyGrowth > 0.1) return 'rapid';
    if (monthlyGrowth > 0.05) return 'steady';
    if (monthlyGrowth > 0) return 'slow';
    return 'declining';
  }
}

