import { IsString, IsOptional, IsNotEmpty, IsArray, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TeamVerificationRequestDto {
  @ApiProperty({
    description: 'Project identifier',
    example: 'uniswap',
  })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiPropertyOptional({
    description: 'Array of team member names or identifiers',
    example: ['Hayden Adams', 'Noah Zinsmeister'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  teamMembers?: string[];

  @ApiPropertyOptional({
    description: 'Project website URL',
    example: 'https://uniswap.org',
  })
  @IsUrl()
  @IsOptional()
  projectWebsite?: string;

  @ApiPropertyOptional({
    description: 'GitHub organization name',
    example: 'Uniswap',
  })
  @IsString()
  @IsOptional()
  githubOrg?: string;
}

