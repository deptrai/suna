import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TokenomicsAnalysisRequestDto {
  @ApiProperty({
    description: 'Project identifier (e.g., bitcoin, ethereum, uniswap)',
    example: 'bitcoin',
  })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiPropertyOptional({
    description: 'Token contract address',
    example: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  })
  @IsString()
  @IsOptional()
  tokenAddress?: string;

  @ApiPropertyOptional({
    description: 'Blockchain network (ethereum, polygon, bsc, etc.)',
    example: 'ethereum',
  })
  @IsString()
  @IsOptional()
  chain?: string;

  @ApiPropertyOptional({
    description: 'Protocol name for DeFi projects',
    example: 'uniswap',
  })
  @IsString()
  @IsOptional()
  protocolName?: string;
}

